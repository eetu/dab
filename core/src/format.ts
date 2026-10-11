import { patch } from "./patch.ts";

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
   * What some of the palette's characters are made of, by name (`rubber`, `steel`): for a game
   * that burns, melts or sinks a thing by what it is. Only names; what one means is the reader's.
   * A character it does not name is made of nothing in particular. Keyed like the palette, so a
   * slice is made of what the sprite is, and a part says its own.
   */
  materials?: Record<string, string>;
  /**
   * Named runs of frame indices. Repeats are legal and mean a hold; reversing is
   * reading the list backwards, so there is no direction field and no duration —
   * a consumer's clock is its own.
   */
  animations?: Record<string, number[]>;
  /** One entry per animation frame; each is `h` rows of `w` characters. */
  frames: string[][];
  /** Children, drawn in list order after this grid — see `Part`. */
  parts?: Part[];
  /** The same subject drawn at other sizes — see `Level`. The sprite itself
   *  carries them; a part or a level does not. */
  levels?: Level[];
  /** What lies behind its own grid, a voxel deep each, front to back — see
   *  `Slice`. The sprite itself carries them; a part or a level does not. */
  slices?: Slice[];
  /** Which way its slices go from its grid: `back` (unless given), the grid its front and each
   *  slice a voxel further from the eye; or `down`, the grid its top seen from above (its first
   *  row the back, its last the front) and each slice a voxel lower. The sprite itself says. */
  stack?: "back" | "down";
};

/**
 * One layer of a sprite in depth: the subject a voxel further back than the one in
 * front of it, as seen from in front. A sprite's own grid is its front, so what a
 * flat reader draws is the face it shows; the slices are what a game reading it as
 * a thing in three dimensions puts behind (`voxelsOf`). A frame is still a moment:
 * each slice has the sprite's frames, in STEP as a level's are, so a model can
 * move. Only frames: a slice is the same grid further back, so its size, palette,
 * variants and animations are the sprite's — one palette colours the whole thing,
 * and a cell's colour is still `variant?.[ch] ?? palette[ch]`. A `name` is a label
 * for whoever draws it ("tread"); its path is still its place, `#n`. Stacked `down`
 * (`SpriteBody.stack`), a slice is the subject a voxel lower than the one above it,
 * seen from above: a duck drawn a floor at a time, the top of its head first.
 */
export type Slice = { name?: string; frames: string[][] };

/**
 * One of a sprite's other sizes: the deer across the field, where the sprite
 * itself is the deer beside the desk.
 *
 * Drawn, not scaled — up, a scaled sprite has pixels twice the scene's; down,
 * nearest-neighbour drops rows unevenly and the art shimmers as it moves. So a
 * level is a grid of its own with its own palette, kept in STEP with the
 * sprite: the same number of frames, and the sprite's animations rather than
 * any of its own, so a consumer can swap sizes mid-walk without remapping.
 * Which size to draw at which distance is the consumer's, as timing is.
 */
export type Level = SpriteBody & { name: string };

/** How a path names a level rather than a part: `["@far"]`. A part's name may
 *  not start with it. */
export const LEVEL = "@";

export const levelPath = (name: string): string[] => [`${LEVEL}${name}`];

/** The level a path addresses, by name, or null for a path into the parts. */
export const levelOf = (path: readonly string[]): string | null =>
  path.length === 1 && path[0].startsWith(LEVEL) ? path[0].slice(LEVEL.length) : null;

/** How a path names a slice: `["#1"]` the one right behind the front. A part's name
 *  may not start with it. */
export const SLICE = "#";

export const slicePath = (n: number): string[] => [`${SLICE}${n}`];

/** The slice a path addresses, 1 the one behind the front, or null for any other path. */
export const sliceOf = (path: readonly string[]): number | null => {
  if (path.length !== 1 || !path[0].startsWith(SLICE)) return null;
  const n = Number(path[0].slice(SLICE.length));
  return Number.isInteger(n) && n >= 1 ? n : null;
};

/** How deep a sprite is, in slices: its own grid and those behind it. */
export const depthOf = (s: SpriteBody): number => 1 + (s.slices?.length ?? 0);

/** Slice `n` (1 behind the front) as a body: the sprite's grid, palette, variants, materials
 *  and animations, with the slice's frames — what a tool draws on, unchanged. */
export const sliceBody = (s: SpriteBody, n: number): SpriteBody | null => {
  const slice = s.slices?.[n - 1];
  if (!slice) return null;
  const { w, h, palette, variants, materials, animations } = s;
  return { w, h, palette, variants, materials, animations, frames: slice.frames };
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

/** A palette key: one printable ASCII character, never `.`. A row is counted
 *  in characters, and a key outside ASCII is two code units or two tokens. */
export const isPaletteKey = (ch: string): boolean => /^[!-~]$/.test(ch) && ch !== TRANSPARENT;

/** A part that names another sprite rather than carrying pixels. */
export const isPartRef = (p: Part): p is Placement & { use: string } => "use" in p;

/** A part that carries its own pixels — and is therefore a sprite. */
export const isPartBody = (p: Part): p is Placement & SpriteBody => !("use" in p);

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

/** A material's name: a lowercase word, hyphens between words (`stainless-steel`). */
export const MATERIAL = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

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
    animations: s.animations
      ? Object.fromEntries(Object.entries(s.animations).map(([k, v]) => [k, [...v]]))
      : undefined,
    frames: s.frames.map((f) => [...f]),
    parts: s.parts?.map((p) => (isPartRef(p) ? { ...p } : cloneSprite(p))),
    levels: s.levels?.map((l) => cloneSprite(l)),
    slices: s.slices?.map((l) => ({ ...l, frames: l.frames.map((f) => [...f]) })),
  });
}
