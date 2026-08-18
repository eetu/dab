// The sprite format, and every operation that edits one.
//
// A sprite is rows of characters plus the palette those characters mean. That is
// the whole format: it diffs as art (a changed pixel is a changed character on a
// line you can point at), it needs no decoder, and it is what a sprite was on the
// machines this kind of art comes from — an X PixMap in JSON, essentially.
// `.` is transparent everywhere and is never a palette key.
//
// A sprite may also carry named PALETTE VARIANTS: alternate colours for some of
// its characters, so one drawing can be recoloured without being redrawn. A
// variant overrides the entries it names and inherits the rest, which is why a
// two-tone sign only has to name its two colours. Nothing about the characters is
// reserved or special-cased — a variant is data, not a rule.
//
// A sprite may carry PARTS: an ordered list of child grids placed at offsets in
// its own coordinates, each with its own frames and its own state. That is how a
// subject that is not one grid — a car with doors, lamps and wheels — is said
// without multiplying its frame strip by every combination of them. A part is
// itself a sprite, which is why every operation below works on one unchanged.
// This is not layers: nothing composites into the grid being edited, and each
// part is still one grid per frame.
//
// And a sprite may carry CLIPS: named runs of frame indices, so a strip that is
// an animation in one place and a set of states in another can say which is
// which.
//
// Everything here is pure and string-in/string-out, so the editor's undo stack is
// a list of sprites rather than a list of inverse operations, and every tool is
// testable without a canvas.

/** Mirror a part's own grid. Free in this format: reverse rows, reverse each. */
export type Flip = "h" | "v" | "hv";

/**
 * A grid and everything that colours it — the shape a sprite and a part share.
 *
 * The sharing is the point: a part with a body IS a sprite, so `setPixels`,
 * `resizeSprite`, `addFrame` and the rest apply to a part with no second
 * implementation. What a part adds on top is only where it sits.
 */
export type SpriteBody = {
  w: number;
  h: number;
  /** Character → `#rrggbb` or `#rrggbbaa`. Order is the palette's order in
   *  the editor, and the order the file is written in. */
  palette: Record<string, string>;
  /**
   * Named alternate colours, each overriding a subset of `palette`. A consumer
   * picks one by name; nothing here is required, and a sprite with no variants
   * is simply drawn in its palette.
   */
  variants?: Record<string, Record<string, string>>;
  /**
   * Named runs of frame indices. Repeats are legal and mean a hold; reversing is
   * reading the list backwards, so there is no direction field and no duration —
   * a consumer's clock is its own.
   */
  clips?: Record<string, number[]>;
  /** One entry per animation frame; each is `h` rows of `w` characters. */
  frames: string[][];
  /** Children, drawn in list order after this grid — see `Part`. */
  parts?: Part[];
};

/** Where a part sits on its parent, in the parent's own pixel coordinates. */
export type Placement = {
  /** Unique among its siblings: the key a consumer holds this part's state under. */
  name: string;
  x: number;
  y: number;
  /** Draw before the parent's own grid rather than after — a seat behind a body,
   *  showing through the windows. Godot spells this `show_behind_parent`. */
  behind?: boolean;
  flip?: Flip;
};

/**
 * A part: a placement, plus either its own pixels or the name of a sprite in the
 * same folder to draw there.
 *
 * Inline for composition, which is intrinsic — a car's trunk lid is not a thing
 * apart from that car, and giving it a file of its own would split one subject
 * across two documents and put its offset out of reach of the undo stack.
 * `use` for reuse, which is a link — one wheel drawn once and fixed once for
 * every car in the folder.
 */
export type Part = Placement & (SpriteBody | { use: string });

export type SpriteFile = SpriteBody & { name: string };

/** How deep inline parts may nest. A backstop against a malformed file, not a
 *  design goal — nothing real is four levels of car. */
export const MAX_PART_DEPTH = 4;

export const TRANSPARENT = ".";

/** A part that names another sprite rather than carrying pixels. */
export const isPartRef = (p: Part): p is Placement & { use: string } => "use" in p;

/** A part that carries its own pixels — and is therefore a sprite. */
export const isPartBody = (p: Part): p is Placement & SpriteBody => !("use" in p);

/**
 * Spread a patch over a node, keeping whatever else it carries — its name at the
 * root, its placement when it is a part.
 *
 * Every operation below goes through this, which is what lets one function serve
 * both. The cast is TypeScript's inability to see that a spread of `T` is a `T`;
 * it lives here once rather than at each call.
 */
const patch = <T extends SpriteBody>(node: T, next: Partial<SpriteBody>): T =>
  ({ ...node, ...next }) as T;

/**
 * What a cell paints as: the variant's colour for that character if the named
 * variant has one, otherwise the palette's.
 *
 * This is the whole rule a consumer needs — the reason the format is the contract
 * and there is no library to depend on.
 */
export function cellColour(s: SpriteBody, ch: string, variant?: string | null): string | null {
  if (ch === TRANSPARENT) return null;
  if (variant) {
    const alt = s.variants?.[variant]?.[ch];
    if (alt) return alt;
  }
  return s.palette[ch] ?? null;
}

/**
 * What a colour may look like: `#rrggbb`, or `#rrggbbaa` for one you can see
 * through.
 *
 * Eight digits rather than a separate alpha map, because a canvas and a
 * stylesheet both take that string as it stands — so the one-line rule a
 * consumer needs does not grow a second lookup to handle glass. It is also how
 * an indexed PNG says it, one alpha per palette entry in `tRNS`.
 *
 * `.` is still the only way to say NOTHING IS HERE. A colour ending `00` is a
 * colour that happens to be invisible, which is a different statement and one
 * the format has no reason to forbid.
 */
export const COLOUR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

/** How opaque a colour is, 0–255. A colour with no alpha digits is opaque. */
export const alphaOf = (hex: string): number =>
  hex.length === 9 ? parseInt(hex.slice(7, 9), 16) : 255;

/** The same colour at a different opacity. 255 drops the digits again, so a
 *  colour that is opaque is written the short way it always was. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hex.slice(0, 7);
  const a = Math.max(0, Math.min(255, Math.round(alpha)));
  return a >= 255 ? rgb : `${rgb}${a.toString(16).padStart(2, "0")}`;
}

/** The variant names a sprite offers, in declaration order. */
export const variantNames = (s: SpriteBody): string[] => Object.keys(s.variants ?? {});

/**
 * A part's grid, mirrored. Shared with consumers rather than left to each,
 * because a flipped part has to look the same in the editor as in the game.
 */
export function flipRows(rows: string[], flip?: Flip): string[] {
  if (!flip) return rows;
  const v = flip === "v" || flip === "hv" ? [...rows].reverse() : rows;
  return flip === "h" || flip === "hv" ? v.map((r) => [...r].reverse().join("")) : v;
}

export const blankFrame = (w: number, h: number): string[] =>
  Array.from({ length: h }, () => TRANSPARENT.repeat(w));

export function blankSprite(name: string, w: number, h: number): SpriteFile {
  return { name, w, h, palette: {}, frames: [blankFrame(w, h)] };
}

/** Deep copy. Rows are strings, so only the arrays need cloning. */
export function cloneSprite<T extends SpriteBody>(s: T): T {
  return patch(s, {
    palette: { ...s.palette },
    variants: s.variants
      ? Object.fromEntries(Object.entries(s.variants).map(([k, v]) => [k, { ...v }]))
      : undefined,
    clips: s.clips
      ? Object.fromEntries(Object.entries(s.clips).map(([k, v]) => [k, [...v]]))
      : undefined,
    frames: s.frames.map((f) => [...f]),
    parts: s.parts?.map((p) => (isPartRef(p) ? { ...p } : cloneSprite(p))),
  });
}

// ---------- the tree ----------
//
// A path is the list of part names from the root down. `[]` is the sprite
// itself, `["doorL"]` its door, `["doorL", "handle"]` the handle on that door.
// The editor holds one, every operation is applied through `withNode`, and a
// consumer holds each node's frame under the same path — so the same three lines
// address a part in the tool, in the file and in the game.

/** The node at a path, or null when the path names nothing — or names a `use`
 *  part, which has no body of its own to reach into. */
export function nodeAt(s: SpriteBody, path: readonly string[]): SpriteBody | null {
  let node: SpriteBody = s;
  for (const name of path) {
    const found = (node.parts ?? []).find((p) => p.name === name);
    if (!found || isPartRef(found)) return null;
    node = found;
  }
  return node;
}

/**
 * Apply a pure node transform at a path and rebuild the tree above it.
 *
 * The single mutation entry point, so every operation in this file — and every
 * tool in the editor, and any server driving the same vocabulary — works on a
 * part without knowing that parts exist. A path that names nothing returns the
 * sprite unchanged rather than throwing: a stale path is a UI bug, not a reason
 * to lose the document.
 */
export function withNode<T extends SpriteBody>(
  s: T,
  path: readonly string[],
  fn: (node: SpriteBody) => SpriteBody,
): T {
  if (!path.length) return patch(s, fn(s));
  const parts = s.parts ?? [];
  const i = parts.findIndex((p) => p.name === path[0]);
  if (i < 0) return s;
  const target = parts[i];
  if (isPartRef(target)) return s;
  const next = [...parts];
  next[i] = withNode(target, path.slice(1), fn);
  return patch(s, { parts: next });
}

/** The frames a clip plays, in order, or null for a name the node has not got.
 *  No silent fallback to the whole strip: that hides a typo. */
export function clipFrames(node: SpriteBody, name: string): number[] | null {
  const clip = node.clips?.[name];
  return clip ? [...clip] : null;
}

export type Box = { x: number; y: number; w: number; h: number };

/**
 * The box a node and its parts fill, in the node's own coordinates.
 *
 * Offsets may be negative and may reach past the parent's edge — a raised lamp
 * sticks out above the bonnet — so this is what the editor frames the view with
 * and what a consumer lays a sheet out with. `resolve` is passed in because core
 * has no folder; a `use` part is a leaf, so its own parts are not expanded.
 */
export function groupBox(
  node: SpriteBody,
  resolve: (name: string) => SpriteBody | null = () => null,
): Box {
  let x0 = 0;
  let y0 = 0;
  let x1 = node.w;
  let y1 = node.h;
  for (const p of node.parts ?? []) {
    const child = isPartRef(p) ? resolve(p.use) : p;
    if (!child) continue;
    const box = isPartRef(p) ? { x: 0, y: 0, w: child.w, h: child.h } : groupBox(child, resolve);
    x0 = Math.min(x0, p.x + box.x);
    y0 = Math.min(y0, p.y + box.y);
    x1 = Math.max(x1, p.x + box.x + box.w);
    y1 = Math.max(y1, p.y + box.y + box.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Everything wrong with a sprite, as sentences.
 *
 * Returned as a list rather than thrown: a file dragged in from somewhere else
 * is usually wrong in one small way, and the editor can show all of them at
 * once instead of one per reload.
 */
export function validateSprite(s: unknown): string[] {
  const errors: string[] = [];
  const sp = s as Partial<SpriteFile>;
  if (!sp || typeof sp !== "object") return ["not an object"];
  if (typeof sp.name !== "string" || !sp.name) errors.push("name is missing");
  validateBody(sp, "", 0, sp.name ?? "", errors);
  return [...new Set(errors)];
}

/**
 * One node's rules. `where` prefixes every message with the part's path, so a
 * complaint about the third row of a door still says which door — the messages
 * are the whole point of returning a list rather than throwing.
 */
function validateBody(
  sp: Partial<SpriteBody>,
  where: string,
  depth: number,
  rootName: string,
  errors: string[],
): void {
  const say = (msg: string) => errors.push(where ? `${where}: ${msg}` : msg);
  if (!Number.isInteger(sp.w) || (sp.w ?? 0) < 1) say("w must be a positive integer");
  if (!Number.isInteger(sp.h) || (sp.h ?? 0) < 1) say("h must be a positive integer");
  if (!sp.palette || typeof sp.palette !== "object") say("palette is missing");
  else {
    for (const [ch, hex] of Object.entries(sp.palette)) {
      if (ch.length !== 1) say(`palette key ${JSON.stringify(ch)} is not one character`);
      if (ch === TRANSPARENT) say("`.` is transparent and cannot carry a colour");
      if (!COLOUR.test(hex)) say(`${ch} is not a #rrggbb or #rrggbbaa colour: ${hex}`);
    }
  }
  // A variant may only recolour characters the palette already has: every cell
  // needs a colour with no variant selected, or a sprite would draw with holes
  // for anyone who ignored the variants.
  if (sp.variants !== undefined) {
    if (typeof sp.variants !== "object" || Array.isArray(sp.variants)) {
      say("variants must be an object of name → { character: colour }");
    } else {
      for (const [name, colours] of Object.entries(sp.variants)) {
        if (!name) say("a variant has no name");
        if (!colours || typeof colours !== "object" || Array.isArray(colours)) {
          say(`variant ${name} is not an object of character → colour`);
          continue;
        }
        for (const [ch, hex] of Object.entries(colours)) {
          if (!COLOUR.test(hex)) {
            say(`variant ${name}: ${ch} is not a #rrggbb or #rrggbbaa colour: ${hex}`);
          }
          if (!(ch in (sp.palette ?? {}))) {
            say(`variant ${name} recolours ${ch}, which the palette does not have`);
          }
        }
      }
    }
  }
  if (!Array.isArray(sp.frames) || sp.frames.length === 0) say("frames is empty");
  else {
    const known = new Set([...Object.keys(sp.palette ?? {}), TRANSPARENT]);
    sp.frames.forEach((frame, fi) => {
      if (!Array.isArray(frame) || frame.length !== sp.h) {
        say(`frame ${fi} has ${Array.isArray(frame) ? frame.length : "?"} rows, expected ${sp.h}`);
        return;
      }
      frame.forEach((row, ri) => {
        if (typeof row !== "string" || row.length !== sp.w) {
          say(`frame ${fi} row ${ri} is ${row?.length ?? "?"} wide, expected ${sp.w}`);
          return;
        }
        for (const ch of row) {
          if (!known.has(ch)) say(`frame ${fi} row ${ri} uses ${ch}, which has no colour`);
        }
      });
    });
  }
  // A clip that points past the end of the strip is a file that fails to load
  // the next time it is opened, which is why every frame operation remaps them.
  if (sp.clips !== undefined) {
    if (typeof sp.clips !== "object" || Array.isArray(sp.clips)) {
      say("clips must be an object of name → list of frame indices");
    } else {
      const count = Array.isArray(sp.frames) ? sp.frames.length : 0;
      for (const [name, list] of Object.entries(sp.clips)) {
        if (!name) say("a clip has no name");
        if (!Array.isArray(list) || list.length === 0) {
          say(`clip ${name} is not a non-empty list of frame indices`);
          continue;
        }
        for (const i of list) {
          if (!Number.isInteger(i) || i < 0 || i >= count) {
            say(`clip ${name} names frame ${i}, which the sprite has not got`);
          }
        }
      }
    }
  }
  if (sp.parts !== undefined) validateParts(sp.parts, where, depth, rootName, errors);
}

function validateParts(
  parts: unknown,
  where: string,
  depth: number,
  rootName: string,
  errors: string[],
): void {
  const say = (msg: string) => errors.push(where ? `${where}: ${msg}` : msg);
  if (!Array.isArray(parts)) {
    say("parts must be a list");
    return;
  }
  // An empty list is not nesting, so it is checked before the depth: a leaf that
  // happens to carry `"parts": []` is a leaf.
  if (!parts.length) return;
  if (depth >= MAX_PART_DEPTH) {
    say(`parts nest more than ${MAX_PART_DEPTH} deep`);
    return;
  }
  const seen = new Set<string>();
  parts.forEach((raw, i) => {
    const p = raw as Partial<Placement & SpriteBody & { use: unknown }>;
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      say(`part ${i} is not an object`);
      return;
    }
    if (typeof p.name !== "string" || !p.name) {
      say(`part ${i} has no name`);
      return;
    }
    const at = where ? `${where}/${p.name}` : `part ${p.name}`;
    const there = (msg: string) => errors.push(`${at}: ${msg}`);
    if (seen.has(p.name)) say(`two parts are called ${p.name}`);
    seen.add(p.name);
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) there("x and y must be whole pixels");
    if (p.behind !== undefined && typeof p.behind !== "boolean")
      there("behind must be true or false");
    if (p.flip !== undefined && !["h", "v", "hv"].includes(p.flip)) {
      there(`flip must be "h", "v" or "hv"`);
    }
    const ref = "use" in p;
    if (ref === "frames" in p) {
      there("must have either its own frames or a `use`, and not both");
      return;
    }
    if (ref) {
      if (typeof p.use !== "string" || !p.use) there("use must name a sprite");
      else if (p.use === rootName) there("uses the sprite it is part of");
      // A `use` part is a leaf, so there is nothing below it to check.
      return;
    }
    // Mirroring a subtree would mean mirroring its children's offsets too, and
    // that arithmetic is a bug farm for a case nobody has.
    if (p.flip && Array.isArray(p.parts) && p.parts.length) {
      there("cannot be flipped and carry parts of its own");
    }
    validateBody(p, at, depth + 1, rootName, errors);
  });
}

// ---------- geometry ----------

export type Anchor = "topLeft" | "center";

/**
 * Resize the canvas — crop or pad, never scale.
 *
 * Pixel art has no meaningful resample: doubling a 72×18 car gives a blurry
 * 144×36 car or a blocky one, and neither is what "make it bigger" means when
 * the grid IS the drawing. Growing pads with transparent, shrinking crops.
 */
export function resizeSprite<T extends SpriteBody>(
  s: T,
  w: number,
  h: number,
  anchor: Anchor = "topLeft",
): T {
  const dx = anchor === "center" ? Math.round((w - s.w) / 2) : 0;
  const dy = anchor === "center" ? Math.round((h - s.h) / 2) : 0;
  return shifted(s, w, h, dx, dy);
}

/**
 * Grow or shrink by an explicit margin on each side.
 *
 * `resizeSprite`'s anchors put the old art at the top-left or in the middle, and
 * neither can pad only the left — which is exactly what "make room for this part"
 * needs when a part wants a pixel off the near edge. Negative margins crop.
 */
export function padSprite<T extends SpriteBody>(
  s: T,
  left: number,
  top: number,
  right: number,
  bottom: number,
): T {
  return shifted(s, s.w + left + right, s.h + top + bottom, left, top);
}

/** Re-canvas to `w × h` with the old art at `(dx, dy)`. Parts travel with the
 *  pixels they were drawn against — a body that slides two right takes its
 *  wheels with it, or the resize silently moves every part relative to the art. */
function shifted<T extends SpriteBody>(s: T, w: number, h: number, dx: number, dy: number): T {
  const frames = s.frames.map((frame) =>
    Array.from({ length: h }, (_, y) => {
      const src = frame[y - dy];
      let row = "";
      for (let x = 0; x < w; x++) {
        const sx = x - dx;
        row += src && sx >= 0 && sx < s.w ? src[sx] : TRANSPARENT;
      }
      return row;
    }),
  );
  return patch(s, {
    w,
    h,
    frames,
    parts: s.parts?.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
  });
}

export const getPixel = (frame: string[], x: number, y: number): string =>
  frame[y]?.[x] ?? TRANSPARENT;

export function setPixel(frame: string[], x: number, y: number, ch: string): string[] {
  if (y < 0 || y >= frame.length || x < 0 || x >= frame[y].length) return frame;
  if (frame[y][x] === ch) return frame;
  const out = [...frame];
  out[y] = out[y].slice(0, x) + ch + out[y].slice(x + 1);
  return out;
}

/** Apply one character to many pixels at once — every shape tool ends here. */
export function setPixels(
  frame: string[],
  points: Iterable<readonly [number, number]>,
  ch: string,
): string[] {
  const rows = frame.map((r) => r.split(""));
  let touched = false;
  for (const [x, y] of points) {
    if (y < 0 || y >= rows.length || x < 0 || x >= rows[y].length) continue;
    if (rows[y][x] === ch) continue;
    rows[y][x] = ch;
    touched = true;
  }
  return touched ? rows.map((r) => r.join("")) : frame;
}

// ---------- blocks ----------

/**
 * A lifted block of pixels: what was there, and where each cell sat relative to
 * the block's top-left corner.
 *
 * Relative rather than absolute so the same block can be put down anywhere — a
 * move is a lift and a put-down at an offset, and a paste is a put-down of a
 * block lifted earlier. Transparent cells are carried so the block keeps its
 * shape and its size; they are gaps when it lands, not paint. See `stampCells`.
 */
export type Stamp = { w: number; h: number; cells: { dx: number; dy: number; ch: string }[] };

/** Lift the given pixels out of a frame, keeping their shape. */
export function readStamp(frame: string[], points: Iterable<readonly [number, number]>): Stamp {
  const pts = [...points].filter(
    ([x, y]) => y >= 0 && y < frame.length && x >= 0 && x < frame[y].length,
  );
  if (!pts.length) return { w: 0, h: 0, cells: [] };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return {
    w: maxX - minX + 1,
    h: maxY - minY + 1,
    cells: pts.map(([x, y]) => ({ dx: x - minX, dy: y - minY, ch: frame[y][x] })),
  };
}

/**
 * Put a block down with its top-left corner at (x, y). Cells that fall outside
 * the frame are dropped, not wrapped — a block dragged half off the edge loses
 * the half that left.
 *
 * Transparent cells in the stamp are holes, not
 * paint: a box drawn round a door takes the empty corners with it, and stamping
 * those as `.` would rub out whatever the door was laid over. Every editor with
 * a brush or a floating paste works this way — the shape covers, its gaps show
 * through. To clear a region, clear it; that is `setPixels`, not a stamp.
 */
export function stampCells(frame: string[], stamp: Stamp, x: number, y: number): string[] {
  const rows = frame.map((r) => r.split(""));
  let touched = false;
  for (const c of stamp.cells) {
    if (c.ch === TRANSPARENT) continue;
    const px = x + c.dx;
    const py = y + c.dy;
    if (py < 0 || py >= rows.length || px < 0 || px >= rows[py].length) continue;
    if (rows[py][px] === c.ch) continue;
    rows[py][px] = c.ch;
    touched = true;
  }
  return touched ? rows.map((r) => r.join("")) : frame;
}

// ---------- rotation ----------

/**
 * A colour in OKLab, plus its opacity — used for one question only: is this the
 * same colour as one the palette already has?
 *
 * Not RGB distance, which is not what an eye does. Green carries most of the
 * perceived brightness and blue almost none, so two colours a fixed RGB step
 * apart can be indistinguishable in one part of the space and obviously
 * different in another. Rotation leans on this hard: it invents blend colours,
 * and if "near enough to one we have" is judged wrongly the palette fills with
 * duplicates nobody can tell apart — and there are only 69 characters.
 */
export type Lab = { L: number; a: number; b: number; alpha: number };

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** `#rrggbb` or `#rrggbbaa` as four 0–255 channels. */
export function channels(hex: string): [number, number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
    alphaOf(hex),
  ];
}

export function oklab(hex: string): Lab {
  const [r8, g8, b8, a8] = channels(hex);
  const r = linear(r8 / 255);
  const g = linear(g8 / 255);
  const b = linear(b8 / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    alpha: a8 / 255,
  };
}

/** How far apart two colours look. Opacity is a full axis: same red at 20% and
 *  at 100% is not the same colour, and blending edges makes plenty of both. */
export function colourGap(x: Lab, y: Lab): number {
  const dL = x.L - y.L;
  const da = x.a - y.a;
  const db = x.b - y.b;
  const dAlpha = x.alpha - y.alpha;
  return Math.sqrt(dL * dL + da * da + db * db + dAlpha * dAlpha);
}

/**
 * How close two colours must be before one is reused for the other.
 *
 * Roughly twice a just-noticeable difference. Tighter and every rotation leaves
 * a drift of colours that look identical in the palette grid; looser and a
 * rotation quietly restates the art in colours the artist did not choose.
 */
export const SAME_COLOUR = 0.04;

/**
 * Characters for colours nobody drew by hand — the palette side of every
 * operation that INVENTS colour (rotation's blends, flatten's glass overlaps).
 * The nearest existing entry when it looks the same (OKLab, within
 * `tolerance`), a new entry while the 69 characters last, and the nearest
 * anyway when they run out: slightly wrong beats cannot-happen.
 */
function paletteMapper(palette: Record<string, string>, tolerance = SAME_COLOUR) {
  const pal = { ...palette };
  const added: string[] = [];
  // Both caches exist because a caller asks the same question over and over —
  // rotation samples² times per pixel, flatten once per cell of flat art.
  const labs = new Map<string, Lab>();
  const chosen = new Map<string, string>();
  const labOf = (hex: string) => {
    let l = labs.get(hex);
    if (!l) labs.set(hex, (l = oklab(hex)));
    return l;
  };
  const charFor = (hex: string): string => {
    const hit = chosen.get(hex);
    if (hit) return hit;
    const want = labOf(hex);
    let best = "";
    let gap = Infinity;
    for (const [ch, have] of Object.entries(pal)) {
      const d = colourGap(want, labOf(have));
      if (d < gap) {
        gap = d;
        best = ch;
      }
    }
    let ch = best;
    if (gap > tolerance) {
      const free = [...PALETTE_CHARS].find((c) => !(c in pal));
      if (free) {
        pal[free] = hex;
        added.push(free);
        ch = free;
      }
    }
    chosen.set(hex, ch);
    return ch;
  };
  return { pal, added, charFor };
}

export type Rotation = {
  rows: string[];
  palette: Record<string, string>;
  /** Characters the palette gained. Worth showing before anyone commits: the
   *  format has 69 to spend, and a smooth rotation can want dozens. */
  added: string[];
  w: number;
  h: number;
};

/** Crop and pad a grid to a new size about its centre, in one pass — either
 *  offset may be negative, so this covers both. */
export function fitRows(src: string[], sw: number, sh: number, dw: number, dh: number): string[] {
  const ox = Math.round((sw - dw) / 2);
  const oy = Math.round((sh - dh) / 2);
  return Array.from({ length: dh }, (_, y) =>
    Array.from({ length: dw }, (_, x) => src[y + oy]?.[x + ox] ?? TRANSPARENT).join(""),
  );
}

/** A block as a solid grid, gaps and all — what a transform needs, since it has
 *  to know where the holes are to turn them too. The inverse is `readStamp`. */
export function stampRows(stamp: Stamp): string[] {
  const grid = Array.from({ length: stamp.h }, () => new Array<string>(stamp.w).fill(TRANSPARENT));
  for (const c of stamp.cells) if (grid[c.dy] && c.dx < stamp.w) grid[c.dy][c.dx] = c.ch;
  return grid.map((r) => r.join(""));
}

/** Every cell of a w×h grid, for lifting one whole. */
export const allCells = (w: number, h: number): [number, number][] =>
  Array.from({ length: w * h }, (_, i) => [i % w, Math.floor(i / w)]);

/** A quarter turn, exactly: every pixel lands on a pixel and no colour is
 *  invented. Free in a character grid, the same way `flip` is. */
function quarterTurn(rows: string[], turns: number, w: number, h: number): string[] {
  if (turns === 2) return [...rows].reverse().map((r) => [...r].reverse().join(""));
  const [W, H] = [h, w];
  return Array.from({ length: H }, (_, y) => {
    let row = "";
    for (let x = 0; x < W; x++) {
      // One turn clockwise: the left column becomes the top row.
      row += turns === 1 ? rows[h - 1 - x][y] : rows[x][w - 1 - y];
    }
    return row;
  });
}

/**
 * Turn a grid of characters by any angle, clockwise.
 *
 * Indexed art cannot interpolate: there is no character between `A` and `B`.
 * So either every destination pixel takes exactly one source pixel — crisp,
 * jagged, palette untouched — or the blends it wants become real palette
 * entries. `samples` is that dial. At 1 it is nearest-neighbour and nothing is
 * added; above that each destination pixel is averaged over samples² positions
 * and whatever comes out is matched against the palette, reusing an entry when
 * one is near enough and allocating when none is.
 *
 * Which is why a second rotation costs less than the first: it is matching
 * against a palette the first one already taught the blend colours to.
 *
 * Blending is in sRGB, not linear light. Linear is the physically correct
 * answer for photographs and the wrong one here — hand-placed pixel-art
 * antialiasing is chosen in sRGB, so a generated blend has to sit in the same
 * space as the ones an artist would have put there by hand. It is premultiplied
 * by opacity, so an edge against nothing fades to transparent rather than
 * toward some guessed background — that guess is what makes rotated sprites
 * look right in the editor and wrong in the game.
 */
export function rotateRows(
  rows: string[],
  palette: Record<string, string>,
  degrees: number,
  opts: { samples?: number; grow?: boolean; tolerance?: number } = {},
): Rotation {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const grow = opts.grow ?? false;
  const turn = ((degrees % 360) + 360) % 360;
  if (!w || !h) return { rows, palette, added: [], w, h };

  // Quarter turns are exact, so they never go near the sampler — and never cost
  // a colour. 90 and 270 swap the sides, which only fits if we are growing.
  if (turn % 90 === 0) {
    const turns = turn / 90;
    if (turns === 0) return { rows, palette, added: [], w, h };
    const out = quarterTurn(rows, turns, w, h);
    const [W, H] = turns === 2 ? [w, h] : [h, w];
    if (grow || W === w) return { rows: out, palette, added: [], w: W, h: H };
    // Keeping the old bounds: a quarter turn of an oblong does not fit them, so
    // it crops the long side and pads the short one, about the centre.
    return { rows: fitRows(out, W, H, w, h), palette, added: [], w, h };
  }

  const rad = (turn * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const W = grow ? Math.ceil(Math.abs(w * cos) + Math.abs(h * sin)) : w;
  const H = grow ? Math.ceil(Math.abs(w * sin) + Math.abs(h * cos)) : h;
  const n = Math.max(1, Math.round(opts.samples ?? 1));
  const tolerance = opts.tolerance ?? SAME_COLOUR;

  const { pal, added, charFor } = paletteMapper(palette, tolerance);

  const out: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = "";
    for (let x = 0; x < W; x++) {
      let R = 0;
      let G = 0;
      let B = 0;
      let A = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const u = x + (sx + 0.5) / n - W / 2;
          const v = y + (sy + 0.5) / n - H / 2;
          const px = Math.floor(u * cos + v * sin + w / 2);
          const py = Math.floor(-u * sin + v * cos + h / 2);
          if (py < 0 || py >= h || px < 0 || px >= w) continue;
          const ch = rows[py][px];
          const hex = ch === TRANSPARENT ? undefined : pal[ch];
          if (!hex) continue;
          const [r, g, b, a8] = channels(hex);
          const a = a8 / 255;
          R += r * a;
          G += g * a;
          B += b * a;
          A += a;
        }
      }
      const alpha = (A / (n * n)) * 255;
      if (Math.round(alpha) <= 0) {
        row += TRANSPARENT;
        continue;
      }
      // Unpremultiply: R is the opacity-weighted sum, A the weight.
      const hex2 = (v: number) =>
        Math.max(0, Math.min(255, Math.round(v / A)))
          .toString(16)
          .padStart(2, "0");
      row += charFor(withAlpha(`#${hex2(R)}${hex2(G)}${hex2(B)}`, alpha));
    }
    out.push(row);
  }
  return { rows: out, palette: pal, added, w: W, h: H };
}

// ---------- flatten ----------

export type Flattened = {
  frames: string[][];
  palette: Record<string, string>;
  /** Characters the palette gained holding colours from the parts' palettes
   *  and from glass landing on paint. */
  added: string[];
  w: number;
  h: number;
};

export type FlattenView = {
  /** What a `use` part draws; null for a name the folder has not got. */
  resolve?: (name: string) => SpriteBody | null;
  /** The frame a node shows while output frame `frame` is built. The node
   *  being flattened always shows `frame`; this is asked for its parts.
   *  Default: the parts play along, clamped to their own strips. */
  frameOf?: (path: string[], node: SpriteBody, frame: number) => number;
  /** Whether a node's own grid is left out — the editor's eye toggles. */
  hidden?: (path: string[]) => boolean;
  tolerance?: number;
};

/** Source-over in sRGB — the compositing a canvas does, so a flatten produces
 *  the pixels the editor was already showing. Opaque paint simply wins;
 *  glass over paint becomes the colour you were seeing through it. */
function over(fg: string, bg: string | null): string {
  const fa8 = alphaOf(fg);
  if (fa8 >= 255 || !bg) return fg;
  const [fr, fgc, fb] = channels(fg);
  const [br, bgc, bb, ba8] = channels(bg);
  const fa = fa8 / 255;
  const ba = ba8 / 255;
  const oa = fa + ba * (1 - fa);
  if (oa <= 0) return fg;
  const mix = (f: number, b: number) =>
    Math.max(0, Math.min(255, Math.round((f * fa + b * ba * (1 - fa)) / oa)))
      .toString(16)
      .padStart(2, "0");
  return withAlpha(`#${mix(fr, br)}${mix(fgc, bgc)}${mix(fb, bb)}`, oa * 255);
}

/**
 * Bake an assembly into one flat grid per frame: the node's pixels, its parts
 * in draw order, and the parts of those — the same walk the renderer makes.
 *
 * This is the answer to "rotate the whole car". The parts cannot turn together
 * — a borrowed wheel is another sprite's pixels, each part invents blends in
 * its own palette, and every part edge would fade against nothing and halo at
 * the seams. A flat copy turns as one grid and blends across the seams, so the
 * assembly stays the source of truth and the flat copy is what gets posed.
 *
 * Colours composite BEFORE they become characters — glass over paint has to
 * blend, and characters cannot. The result colours then go through the same
 * reuse-or-allocate rule rotation uses, starting from the node's own palette so
 * its art keeps its characters.
 */
export function flattenSprite(node: SpriteBody, view: FlattenView = {}): Flattened {
  const resolve = view.resolve ?? (() => null);
  const box = groupBox(node, resolve);
  const frameFor = (path: string[], n: SpriteBody, f: number) =>
    Math.max(0, Math.min(view.frameOf ? view.frameOf(path, n, f) : f, n.frames.length - 1));
  const { pal, added, charFor } = paletteMapper(node.palette, view.tolerance);

  const frames = node.frames.map((_, f) => {
    const grid: (string | null)[][] = Array.from({ length: box.h }, () =>
      new Array<string | null>(box.w).fill(null),
    );
    const stamp = (n: SpriteBody, rows: string[], ox: number, oy: number) => {
      for (let y = 0; y < rows.length; y++) {
        for (let x = 0; x < rows[y].length; x++) {
          const ch = rows[y][x];
          if (ch === TRANSPARENT) continue;
          const hex = n.palette[ch];
          if (!hex) continue;
          const gy = oy + y;
          const gx = ox + x;
          if (gy < 0 || gy >= box.h || gx < 0 || gx >= box.w) continue;
          grid[gy][gx] = over(hex, grid[gy][gx]);
        }
      }
    };
    const paintPart = (p: Part, ox: number, oy: number, path: string[]) => {
      const sub = [...path, p.name];
      // A shared part is a leaf: its own parts, if it has any, are not expanded.
      const inner = isPartRef(p) ? resolve(p.use) : p;
      if (!inner) return;
      if (isPartRef(p) || p.flip) {
        if (view.hidden?.(sub)) return;
        const rows = inner.frames[frameFor(sub, inner, f)] ?? [];
        stamp(inner, p.flip ? flipRows(rows, p.flip) : rows, ox + p.x, oy + p.y);
        return;
      }
      walk(inner, ox + p.x, oy + p.y, sub);
    };
    const walk = (n: SpriteBody, ox: number, oy: number, path: string[]) => {
      const parts = n.parts ?? [];
      for (const p of parts) if (p.behind) paintPart(p, ox, oy, path);
      if (!view.hidden?.(path)) stamp(n, n.frames[frameFor(path, n, f)] ?? [], ox, oy);
      for (const p of parts) if (!p.behind) paintPart(p, ox, oy, path);
    };
    walk(node, -box.x, -box.y, []);
    return grid.map((cells) => cells.map((hex) => (hex ? charFor(hex) : TRANSPARENT)).join(""));
  });

  return { frames, palette: pal, added, w: box.w, h: box.h };
}

// ---------- shapes ----------

/** Bresenham. Integer steps only — a float line rounds to an uneven stair. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  let x = Math.round(x0);
  let y = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - x);
  const dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1;
  const sy = y < ey ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x, y]);
    if (x === ex && y === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

export function rectPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean,
): [number, number][] {
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);
  const pts: [number, number][] = [];
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      if (filled || y === ya || y === yb || x === xa || x === xb) pts.push([x, y]);
    }
  }
  return pts;
}

/** Midpoint ellipse inscribed in the dragged box, so a square drag is a circle. */
export function ellipsePoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean,
): [number, number][] {
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);
  const cx = (xa + xb) / 2;
  const cy = (ya + yb) / 2;
  const rx = (xb - xa) / 2 + 0.001;
  const ry = (yb - ya) / 2 + 0.001;
  const pts: [number, number][] = [];
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const d = nx * nx + ny * ny;
      if (filled ? d <= 1 : d <= 1 && !insideRing(x, y, cx, cy, rx, ry)) pts.push([x, y]);
    }
  }
  return pts;
}

/** True when every 4-neighbour is also inside — i.e. not on the outline. */
function insideRing(x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean {
  const inside = (px: number, py: number) => {
    const nx = (px - cx) / rx;
    const ny = (py - cy) / ry;
    return nx * nx + ny * ny <= 1;
  };
  return inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1);
}

/** 4-connected flood fill from a seed, bounded by the frame. */
export function floodPoints(frame: string[], x: number, y: number): [number, number][] {
  const target = getPixel(frame, x, y);
  if (y < 0 || y >= frame.length || x < 0 || x >= frame[0].length) return [];
  const w = frame[0].length;
  const h = frame.length;
  const seen = new Uint8Array(w * h);
  const out: [number, number][] = [];
  const stack: [number, number][] = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop()!;
    if (px < 0 || px >= w || py < 0 || py >= h) continue;
    if (seen[py * w + px]) continue;
    if (frame[py][px] !== target) continue;
    seen[py * w + px] = 1;
    out.push([px, py]);
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  return out;
}

/**
 * The connected SHAPE at a seed: every pixel touching it that has something in
 * it, whatever colour that is.
 *
 * Flood fill's cousin, and deliberately not the same rule. Fill spreads over one
 * character because it is about to paint them all; this is about to pick
 * something up, and the thing you point at is an object rather than a colour. A
 * car body is a dozen characters and one shape, and the fill rule would hand back
 * the highlight and leave the paint behind.
 *
 * Empty space is not a shape: a transparent seed selects nothing. The connected
 * background is technically a region, but nobody points at the emptiness meaning
 * "that one" — so callers get an empty result and can treat the click as the
 * "nothing here" it was.
 */
export function shapePoints(frame: string[], x: number, y: number): [number, number][] {
  if (y < 0 || y >= frame.length || x < 0 || x >= frame[0].length) return [];
  if (getPixel(frame, x, y) === TRANSPARENT) return [];
  const w = frame[0].length;
  const h = frame.length;
  const seen = new Uint8Array(w * h);
  const out: [number, number][] = [];
  const stack: [number, number][] = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop()!;
    if (px < 0 || px >= w || py < 0 || py >= h) continue;
    if (seen[py * w + px]) continue;
    if (frame[py][px] === TRANSPARENT) continue;
    seen[py * w + px] = 1;
    out.push([px, py]);
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  return out;
}

// ---------- frames ----------

/**
 * Move every clip's indices through the same permutation the frames just went
 * through. Returning null from `move` drops that entry, and a clip that empties
 * is dropped with it.
 *
 * Not optional: a clip left pointing past the end of a shortened strip is a file
 * that fails validation the next time it is opened, which is the same worse
 * surprise `removeColour` avoids by erasing the pixels it orphans.
 */
function remapClips(
  clips: Record<string, number[]> | undefined,
  move: (i: number) => number | null,
): Record<string, number[]> | undefined {
  if (!clips) return undefined;
  const out: Record<string, number[]> = {};
  for (const [name, list] of Object.entries(clips)) {
    const next = list.map(move).filter((i): i is number => i !== null);
    if (next.length) out[name] = next;
  }
  return Object.keys(out).length ? out : undefined;
}

export function addFrame<T extends SpriteBody>(s: T, after = s.frames.length - 1): T {
  const at = after + 1;
  return patch(s, {
    frames: [...s.frames.slice(0, at), blankFrame(s.w, s.h), ...s.frames.slice(at)],
    // A blank frame joins no clip: it is not part of any animation until asked.
    clips: remapClips(s.clips, (i) => (i >= at ? i + 1 : i)),
  });
}

export function duplicateFrame<T extends SpriteBody>(s: T, index: number): T {
  return patch(s, {
    frames: [...s.frames.slice(0, index + 1), [...s.frames[index]], ...s.frames.slice(index + 1)],
    // The copy joins no clip either — a duplicate is a starting point, and a clip
    // that silently doubled a frame would be a hold nobody asked for.
    clips: remapClips(s.clips, (i) => (i > index ? i + 1 : i)),
  });
}

export function removeFrame<T extends SpriteBody>(s: T, index: number): T {
  if (s.frames.length <= 1) return s;
  return patch(s, {
    frames: s.frames.filter((_, i) => i !== index),
    clips: remapClips(s.clips, (i) => (i === index ? null : i > index ? i - 1 : i)),
  });
}

export function moveFrame<T extends SpriteBody>(s: T, from: number, to: number): T {
  if (from === to || from < 0 || to < 0 || from >= s.frames.length || to >= s.frames.length)
    return s;
  const frames = [...s.frames];
  const [f] = frames.splice(from, 1);
  frames.splice(to, 0, f);
  return patch(s, {
    frames,
    clips: remapClips(s.clips, (i) => {
      if (i === from) return to;
      if (from < to) return i > from && i <= to ? i - 1 : i;
      return i >= to && i < from ? i + 1 : i;
    }),
  });
}

// ---------- palette ----------

/** Characters a sprite may use, in a stable order, skipping the taken ones. */
export const PALETTE_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+*=#@%&$";

export function nextFreeChar(s: SpriteBody): string | null {
  const taken = new Set([...Object.keys(s.palette), TRANSPARENT]);
  for (const ch of PALETTE_CHARS) if (!taken.has(ch)) return ch;
  return null;
}

export function addColour<T extends SpriteBody>(s: T, hex: string): T {
  const ch = nextFreeChar(s);
  if (!ch) return s;
  return patch(s, { palette: { ...s.palette, [ch]: hex } });
}

/**
 * Drop a colour and erase every pixel that used it.
 *
 * The alternative — leaving the character in place with no colour — produces a
 * file that fails validation the moment it is reloaded, which is a worse
 * surprise than losing the pixels you asked to drop.
 */
export function removeColour<T extends SpriteBody>(s: T, ch: string): T {
  const palette = { ...s.palette };
  delete palette[ch];
  const frames = s.frames.map((f) => f.map((row) => row.split(ch).join(TRANSPARENT)));
  return patch(s, { palette, frames });
}

/** Move a colour to a different character, rewriting every pixel that used it. */
export function renameChar<T extends SpriteBody>(s: T, from: string, to: string): T {
  if (from === to || to === TRANSPARENT || to.length !== 1 || s.palette[to]) return s;
  const palette: Record<string, string> = {};
  for (const [ch, hex] of Object.entries(s.palette)) palette[ch === from ? to : ch] = hex;
  const frames = s.frames.map((f) => f.map((row) => row.split(from).join(to)));
  return patch(s, { palette, frames });
}

export const setColour = <T extends SpriteBody>(s: T, ch: string, hex: string): T =>
  patch(s, { palette: { ...s.palette, [ch]: hex } });

/**
 * Move a colour to a different place in the palette.
 *
 * The map's order is the order the editor lists swatches in AND the order
 * `toJson` writes them in, so this is an edit to the document rather than a
 * view preference — a palette grouped light-to-dark stays that way in the file
 * and in the diff.
 */
export function movePaletteChar<T extends SpriteBody>(s: T, ch: string, to: number): T {
  const chars = Object.keys(s.palette);
  const from = chars.indexOf(ch);
  if (from < 0 || from === to || to < 0 || to >= chars.length) return s;
  const next = [...chars];
  next.splice(from, 1);
  next.splice(to, 0, ch);
  return patch(s, { palette: Object.fromEntries(next.map((c) => [c, s.palette[c]])) });
}

/** Palette entries no frame uses — the editor offers to sweep these up. A part
 *  has its own palette, so this is one node's question and not the tree's. */
export function unusedChars(s: SpriteBody): string[] {
  const used = new Set<string>();
  for (const f of s.frames) for (const row of f) for (const ch of row) used.add(ch);
  return Object.keys(s.palette).filter((ch) => !used.has(ch));
}

// ---------- serialisation ----------

/**
 * Stable JSON: keys in a fixed order and one frame row per line.
 *
 * Written by hand rather than with JSON.stringify's indent, because the default
 * puts every row on its own heavily-indented line and the point of this format
 * is that a frame reads as a picture in the diff.
 */
export function toJson(s: SpriteFile): string {
  const entries: [string, string][] = [["name", q(s.name)], ...bodyEntries(s, "  ")];
  return `{\n${entries.map(([k, v]) => `  ${q(k)}: ${v}`).join(",\n")}\n}\n`;
}

const q = (v: unknown): string => JSON.stringify(v);

/** A `{ … }` whose entries sit one level in from `ind` and whose brace closes on
 *  `ind` — the shape every block below is written to. */
const mapBlock = <V>(o: Record<string, V>, ind: string, fmt: (v: V) => string): string =>
  `{\n${Object.entries(o)
    .map(([k, v]) => `${ind}  ${q(k)}: ${fmt(v)}`)
    .join(",\n")}\n${ind}}`;

const framesBlock = (frames: string[][], ind: string): string =>
  `[\n${frames
    .map((f) => `${ind}  [\n${f.map((row) => `${ind}    ${q(row)}`).join(",\n")}\n${ind}  ]`)
    .join(",\n")}\n${ind}]`;

/**
 * A node's keys, in a fixed order, with `ind` the indent its key lines sit at.
 *
 * One line per variant and per clip: they are short, and a diff of a recolour or
 * a retimed animation should read as one changed line rather than a reflowed
 * block. Frames keep one row per line at every depth, which is the whole reason
 * this writer exists instead of `JSON.stringify`'s indent.
 */
function bodyEntries(n: SpriteBody, ind: string): [string, string][] {
  const out: [string, string][] = [
    ["w", String(n.w)],
    ["h", String(n.h)],
    ["palette", mapBlock(n.palette, ind, q)],
  ];
  if (n.variants && Object.keys(n.variants).length) {
    out.push(["variants", mapBlock(n.variants, ind, q)]);
  }
  if (n.clips && Object.keys(n.clips).length) out.push(["clips", mapBlock(n.clips, ind, q)]);
  out.push(["frames", framesBlock(n.frames, ind)]);
  if (n.parts?.length) {
    out.push([
      "parts",
      `[\n${n.parts.map((p) => `${ind}  ${partBlock(p, ind + "  ")}`).join(",\n")}\n${ind}]`,
    ]);
  }
  return out;
}

function partBlock(p: Part, ind: string): string {
  const head: [string, string][] = [
    ["name", q(p.name)],
    ["x", String(p.x)],
    ["y", String(p.y)],
  ];
  if (p.behind) head.push(["behind", "true"]);
  if (p.flip) head.push(["flip", q(p.flip)]);
  // A reference is four short values; on one line a moved wheel is one changed
  // line, which is the same thing the frame rows are after.
  if (isPartRef(p)) {
    return `{ ${[...head, ["use", q(p.use)]].map(([k, v]) => `${q(k)}: ${v}`).join(", ")} }`;
  }
  const entries = [...head, ...bodyEntries(p, ind)];
  return `{\n${entries.map(([k, v]) => `${ind}  ${q(k)}: ${v}`).join(",\n")}\n${ind}}`;
}

export function fromJson(text: string): { sprite: SpriteFile } | { errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { errors: [`not JSON: ${(e as Error).message}`] };
  }
  const errors = validateSprite(parsed);
  return errors.length ? { errors } : { sprite: parsed as SpriteFile };
}
