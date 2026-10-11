import {
  COLOUR,
  isPaletteKey,
  LEVEL,
  MATERIAL,
  MAX_PART_DEPTH,
  type Placement,
  SLICE,
  type SpriteBody,
  type SpriteFile,
  TRANSPARENT,
} from "./format.ts";

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
      if (ch === TRANSPARENT) say("`.` is transparent and cannot carry a colour");
      else if (!isPaletteKey(ch)) {
        say(`palette key ${JSON.stringify(ch)} is not one printable ASCII character`);
      }
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
  // Materials name what characters the palette has are made of, as variants recolour them.
  if (sp.materials !== undefined) {
    if (!sp.materials || typeof sp.materials !== "object" || Array.isArray(sp.materials)) {
      say("materials must be an object of character → material");
    } else {
      for (const [ch, name] of Object.entries(sp.materials)) {
        if (typeof name !== "string" || !MATERIAL.test(name)) {
          say(`${ch} is made of ${JSON.stringify(name)}, which is not a lowercase word`);
        }
        if (!(ch in (sp.palette ?? {}))) {
          say(`materials name ${ch}, which the palette does not have`);
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
  // An animation that points past the end of the strip is a file that fails to load
  // the next time it is opened, which is why every frame operation remaps them.
  if (sp.animations !== undefined) {
    if (typeof sp.animations !== "object" || Array.isArray(sp.animations)) {
      say("animations must be an object of name → list of frame indices");
    } else {
      const count = Array.isArray(sp.frames) ? sp.frames.length : 0;
      for (const [name, list] of Object.entries(sp.animations)) {
        if (!name) say("an animation has no name");
        if (!Array.isArray(list) || list.length === 0) {
          say(`animation ${name} is not a non-empty list of frame indices`);
          continue;
        }
        for (const i of list) {
          if (!Number.isInteger(i) || i < 0 || i >= count) {
            say(`animation ${name} names frame ${i}, which the sprite has not got`);
          }
        }
      }
    }
  }
  if (sp.parts !== undefined) validateParts(sp.parts, where, depth, rootName, errors);
  if (sp.levels !== undefined) {
    if (where) say("only the sprite itself has levels");
    else validateLevels(sp.levels, sp, rootName, errors);
  }
  if (sp.slices !== undefined) {
    if (where) say("only the sprite itself has slices");
    else validateSlices(sp.slices, sp, rootName, errors);
  }
  if (sp.stack !== undefined) {
    if (where) say("only the sprite itself says which way its slices stack");
    else if (sp.stack !== "back" && sp.stack !== "down") say("stack is back or down");
  }
}

/**
 * A slice's rules: frames and perhaps a name, as many frames as the sprite has, each
 * the sprite's size in the sprite's colours — its size, palette, variants and
 * animations are the sprite's.
 */
function validateSlices(
  slices: unknown,
  root: Partial<SpriteBody>,
  rootName: string,
  errors: string[],
): void {
  if (!Array.isArray(slices)) {
    errors.push("slices must be a list");
    return;
  }
  const count = Array.isArray(root.frames) ? root.frames.length : 0;
  slices.forEach((raw, i) => {
    const at = `slice ${i + 1}`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push(`${at} is not an object`);
      return;
    }
    const l = raw as { name?: unknown; frames?: unknown };
    const extra = Object.keys(l).filter((k) => k !== "frames" && k !== "name");
    if (extra.length)
      errors.push(
        `${at}: carries only a name and frames — its ${extra.join(", ")} are the sprite's`,
      );
    if (l.name !== undefined && (typeof l.name !== "string" || !l.name.trim()))
      errors.push(`${at}: a name is some text, or no name at all`);
    if (Array.isArray(l.frames) && l.frames.length !== count) {
      errors.push(`${at}: has ${l.frames.length} frames, the sprite has ${count}`);
    }
    const body = { w: root.w, h: root.h, palette: root.palette, frames: l.frames };
    validateBody(body as Partial<SpriteBody>, at, 1, rootName, errors);
  });
}

/**
 * A level's rules: a body like any other, with a name, and in step with the
 * sprite — the same frame count, and no animations or parts of its own, since
 * it plays the sprite's animations and stands for the whole subject.
 */
function validateLevels(
  levels: unknown,
  root: Partial<SpriteBody>,
  rootName: string,
  errors: string[],
): void {
  if (!Array.isArray(levels)) {
    errors.push("levels must be a list");
    return;
  }
  const count = Array.isArray(root.frames) ? root.frames.length : 0;
  const seen = new Set<string>();
  levels.forEach((raw, i) => {
    const l = raw as Partial<SpriteBody & { name: unknown }>;
    if (!l || typeof l !== "object" || Array.isArray(l)) {
      errors.push(`level ${i} is not an object`);
      return;
    }
    if (typeof l.name !== "string" || !l.name || l.name.includes("/")) {
      errors.push(`level ${i} needs a name, without a /`);
      return;
    }
    const at = `level ${l.name}`;
    if (seen.has(l.name)) errors.push(`two levels are called ${l.name}`);
    seen.add(l.name);
    if (l.animations !== undefined)
      errors.push(`${at}: plays the sprite's animations, not its own`);
    if (l.parts !== undefined) errors.push(`${at}: cannot carry parts`);
    if (Array.isArray(l.frames) && l.frames.length !== count) {
      errors.push(`${at}: has ${l.frames.length} frames, the sprite has ${count}`);
    }
    validateBody(l, at, 1, rootName, errors);
  });
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
    if (p.name.startsWith(LEVEL))
      there(`a part's name cannot start with ${LEVEL} — that names a level`);
    if (p.name.startsWith(SLICE))
      there(`a part's name cannot start with ${SLICE} — that names a slice`);
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
