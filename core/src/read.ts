// Reading a sprite to draw it: what a consumer needs at runtime, and nothing that edits.
//
// `layers` is THE walk — the order and the places every renderer here draws an
// assembly in (the editor's canvas, `flattenSprite`, the exports), so a game draws
// what was drawn: a node's parts marked `behind`, then its own grid, then the rest;
// a part with pixels of its own walks the same way, a `use` part or a flipped one
// is a leaf. `pixels` turns one grid's frame into packed words a canvas or a
// raster takes as they are, and `assembly` lays a whole subject into one.
//
// The one thing here no file says is a mirror of the whole subject: a deer facing
// the other way is the consumer's state, as the frame it shows is.

import { channels } from "./colour.ts";
import {
  type Flip,
  flipRows,
  isPartRef,
  type Level,
  type SpriteBody,
  TRANSPARENT,
} from "./format.ts";
import { groupBox } from "./tree.ts";

/** One grid an assembly puts down: whose, at which frame, where in the subject's
 *  own pixels (its own grid's top-left is 0, 0; parts may lie outside), mirrored how. */
export type Layer = {
  /** Part names from the subject down; the subject itself is `[]`. */
  path: string[];
  body: SpriteBody;
  frame: number;
  x: number;
  y: number;
  flip?: Flip;
};

export type LayerView = {
  /** What a `use` part draws: the sprite of that name, or null for none. */
  resolve?: (name: string) => SpriteBody | null;
  /** The frame a part shows while the subject shows `frame`. Default: parts play
   *  along, each clamped to its own strip. */
  frameOf?: (path: string[], node: SpriteBody, frame: number) => number;
  /** Nodes whose own grid is left out (a door that has come off). */
  hidden?: (path: string[]) => boolean;
  /** The whole subject mirrored, about its own grid: a walk to the left. */
  flip?: Flip;
};

/** Two mirrorings in a row: an axis mirrored twice is not mirrored. */
const compose = (a?: Flip, b?: Flip): Flip | undefined => {
  const h = (a?.includes("h") ?? false) !== (b?.includes("h") ?? false);
  const v = (a?.includes("v") ?? false) !== (b?.includes("v") ?? false);
  return h && v ? "hv" : h ? "h" : v ? "v" : undefined;
};

/** What `node` puts down at `frame`, in drawing order. */
export function layers(node: SpriteBody, frame = 0, view: LayerView = {}): Layer[] {
  const resolve = view.resolve ?? (() => null);
  const shown = (path: string[], n: SpriteBody) =>
    Math.max(0, Math.min(view.frameOf ? view.frameOf(path, n, frame) : frame, n.frames.length - 1));
  const out: Layer[] = [];
  const mirror = view.flip;
  // Mirrored, each node's parts mirror within it, and so on down.
  const walk = (n: SpriteBody, x: number, y: number, path: string[]) => {
    const parts = n.parts ?? [];
    const place = (p: (typeof parts)[number]) => {
      const sub = [...path, p.name];
      // A shared part is a leaf: its own parts, if it has any, are not expanded.
      const inner = isPartRef(p) ? resolve(p.use) : p;
      if (!inner) return;
      const px = mirror?.includes("h") ? n.w - p.x - inner.w : p.x;
      const py = mirror?.includes("v") ? n.h - p.y - inner.h : p.y;
      if (isPartRef(p) || p.flip) {
        if (view.hidden?.(sub)) return;
        out.push({
          path: sub,
          body: inner,
          frame: shown(sub, inner),
          x: x + px,
          y: y + py,
          flip: compose(mirror, p.flip),
        });
        return;
      }
      walk(inner, x + px, y + py, sub);
    };
    for (const p of parts) if (p.behind) place(p);
    if (!view.hidden?.(path))
      out.push({ path, body: n, frame: shown(path, n), x, y, flip: mirror });
    for (const p of parts) if (!p.behind) place(p);
  };
  walk(node, 0, 0, []);
  return out;
}

/** The frame an animation shows at `step` (a count of frames played, any integer
 *  or fraction, negative too), looping. A name the node has not got is an error:
 *  a silent frame 0 hides a typo. */
export function frameAt(node: SpriteBody, animation: string, step: number): number {
  const run = node.animations?.[animation];
  if (!run) throw new Error(`no animation "${animation}"`);
  if (!run.length) return 0;
  const n = run.length;
  return run[((Math.floor(step) % n) + n) % n];
}

/** A level by name, or the sprite itself for none: the subject at another size. */
export function levelNamed(sprite: SpriteBody, name: string | null | undefined): SpriteBody {
  if (!name) return sprite;
  const level = sprite.levels?.find((l: Level) => l.name === name);
  if (!level) throw new Error(`no level "${name}"`);
  return level;
}

/** A packed colour, the ImageData word on a little-endian machine: 0xAABBGGRR.
 *  0 is nothing. */
export const wordOf = (hex: string): number => {
  const [r, g, b, a] = channels(hex);
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
};

/** One grid's frame as packed words, `w × h`, row by row. */
export type Pixels = { w: number; h: number; px: Uint32Array };

/** A node's own grid at `frame`, in `variant` (matched by name, as everywhere),
 *  mirrored by `flip`: nothing of its parts. */
export function pixels(
  node: SpriteBody,
  frame = 0,
  { variant, flip }: { variant?: string | null; flip?: Flip } = {},
): Pixels {
  const words = new Map<string, number>();
  const over = (variant && node.variants?.[variant]) || {};
  for (const [ch, hex] of Object.entries(node.palette)) words.set(ch, wordOf(over[ch] ?? hex));
  const rows = flipRows(node.frames[frame] ?? node.frames[0] ?? [], flip);
  const px = new Uint32Array(node.w * node.h);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length && x < node.w; x++) {
      const ch = row[x];
      if (ch !== TRANSPARENT) px[y * node.w + x] = words.get(ch) ?? 0;
    }
  });
  return { w: node.w, h: node.h, px };
}

/** `src` over `dst`, source-over in sRGB, the way a canvas composites: opaque wins,
 *  glass over paint is the colour seen through it. */
const overWord = (dst: number, src: number): number => {
  const sa = src >>> 24;
  if (sa === 255 || !dst) return src;
  if (sa === 0) return dst;
  const da = dst >>> 24;
  const oa = sa + (da * (255 - sa)) / 255;
  const ch = (shift: number) => {
    const s = (src >>> shift) & 255;
    const d = (dst >>> shift) & 255;
    return Math.round((s * sa + (d * da * (255 - sa)) / 255) / oa) & 255;
  };
  return ((Math.round(oa) << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)) >>> 0;
};

/** A whole subject at `frame` laid into one grid: its box (which may reach
 *  outside its own grid: `x`, `y` is where the grid's top-left is in it), each
 *  layer composited over what is under it. */
export function assembly(
  node: SpriteBody,
  frame = 0,
  view: LayerView & { variant?: string | null } = {},
): Pixels & { x: number; y: number } {
  const box = groupBox(node, view.resolve);
  const out = new Uint32Array(box.w * box.h);
  // Mirrored, the box mirrors with the subject: what reached out to the left reaches right.
  const ox = view.flip?.includes("h") ? box.x + box.w - node.w : -box.x;
  const oy = view.flip?.includes("v") ? box.y + box.h - node.h : -box.y;
  for (const l of layers(node, frame, view)) {
    const p = pixels(l.body, l.frame, { variant: view.variant, flip: l.flip });
    for (let y = 0; y < p.h; y++) {
      const gy = oy + l.y + y;
      if (gy < 0 || gy >= box.h) continue;
      for (let x = 0; x < p.w; x++) {
        const c = p.px[y * p.w + x];
        if (!c) continue;
        const gx = ox + l.x + x;
        if (gx < 0 || gx >= box.w) continue;
        const i = gy * box.w + gx;
        out[i] = overWord(out[i], c);
      }
    }
  }
  return { w: box.w, h: box.h, x: ox, y: oy, px: out };
}
