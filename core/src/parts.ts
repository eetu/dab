import { blankFrame, cloneSprite, type Part, type SpriteBody, TRANSPARENT } from "./format";
import { getPixel, setPixels } from "./geometry";
import { patch } from "./patch";

// Making parts: a blank one, a borrowed one, or one lifted out of what is
// already drawn. The last is how a subject usually becomes an assembly — a door
// is drawn into the body, because that is how you draw a car, and only then
// does it need to open; an airship is drawn whole so its shading reads as one
// hull, and only then cut into the pieces that fall.

/** `want`, or `want2`, `want3`… — the first name no sibling has. */
export function freePartName(parts: readonly Part[], want: string): string {
  const taken = new Set(parts.map((p) => p.name));
  if (!taken.has(want)) return want;
  for (let i = 2; ; i++) if (!taken.has(`${want}${i}`)) return `${want}${i}`;
}

export type NewPart = {
  name?: string;
  x?: number;
  y?: number;
  /** A blank grid this size — or `use` another sprite instead. */
  w?: number;
  h?: number;
  use?: string;
};

/**
 * A new part on `node`: a blank grid at (x, y), or a reference to another
 * sprite. A blank one gets the parent's palette, copied in: a lamp on a car is
 * painted in the car's colours far more often than not. Copied rather than
 * inherited, so a cell's colour stays `variant?.[ch] ?? palette[ch]` on one
 * node — the rule the format rests on.
 */
export function addPart<T extends SpriteBody>(node: T, spec: NewPart): { node: T; name: string } {
  const parts = node.parts ?? [];
  const name = freePartName(parts, spec.name?.trim() || spec.use || "part");
  const at = { name, x: spec.x ?? 0, y: spec.y ?? 0 };
  const w = Math.max(1, spec.w ?? Math.min(8, node.w));
  const h = Math.max(1, spec.h ?? Math.min(8, node.h));
  const part: Part = spec.use
    ? { ...at, use: spec.use }
    : { ...at, w, h, palette: { ...node.palette }, frames: [blankFrame(w, h)] };
  return { node: patch(node, { parts: [...parts, part] }), name };
}

/**
 * Lift cells of `node` out into a new part, placed where they were: every
 * frame comes along, cropped to the cells' box, with whatever is not one of
 * the cells left transparent. The part gets the parent's palette and variants,
 * since the drawing came from them. `cut` clears the cells from every frame
 * of the parent — a piece that is to fall away must not leave its pixels
 * behind; without it the parent keeps them, which is what trimming a part
 * afterwards wants.
 */
export function liftPart<T extends SpriteBody>(
  node: T,
  name: string,
  cells: Iterable<readonly [number, number]>,
  opts: { cut?: boolean } = {},
): { node: T; name: string } | null {
  const pts = [...cells].filter(([x, y]) => x >= 0 && y >= 0 && x < node.w && y < node.h);
  if (!pts.length) return null;
  const inside = new Set(pts.map(([x, y]) => `${x},${y}`));
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0 + 1;
  const h = Math.max(...ys) - y0 + 1;
  const frames = node.frames.map((f) =>
    Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) =>
        inside.has(`${x0 + x},${y0 + y}`) ? getPixel(f, x0 + x, y0 + y) : TRANSPARENT,
      ).join(""),
    ),
  );
  const parts = node.parts ?? [];
  const key = freePartName(parts, name.trim() || "part");
  const part: Part = {
    name: key,
    x: x0,
    y: y0,
    w,
    h,
    palette: { ...node.palette },
    ...(node.variants ? { variants: cloneSprite(node).variants } : {}),
    frames,
  };
  return {
    node: patch(node, {
      frames: opts.cut ? node.frames.map((f) => setPixels(f, pts, TRANSPARENT)) : node.frames,
      parts: [...parts, part],
    }),
    name: key,
  };
}
