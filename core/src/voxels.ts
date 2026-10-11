// A sprite read as a thing in three dimensions: its own grid the front, its slices behind it a
// voxel further back each (see `Slice`), a pixel to a voxel; or, stacked down, its grid the top
// seen from above and its slices below it a voxel lower each. A standing tyre is its sidewall in
// front and three slices behind; a duck, its head's top and the floors under it. Either way the
// voxels come out the right way up, so what reads them need not know how they were drawn. This
// is what a game takes for a model and what the editor's 3D panel shows, at a frame: a frame is
// still a moment, and every slice moves with it. Each voxel is made of what its character is
// (`SpriteBody.materials`), for a game that burns or sinks a thing by it.

import { type Flip, flipRows, sliceBody, type SpriteBody, TRANSPARENT } from "./format.ts";
import { assembly, layers, type LayerView, pixels } from "./read.ts";

/** The voxels: `w` across, `h` high, `d` deep, each a packed word as `pixels` gives one (0 empty),
 *  across a row, rows down, then from the back (`z` 0) to the front (`d - 1`); and what each is
 *  made of, in the same order: an index into `materials` plus one, 0 for nothing named. */
export type Voxels = {
  w: number;
  h: number;
  d: number;
  px: Uint32Array;
  made?: Uint8Array;
  materials?: readonly string[];
};

/** `body`'s grid at `frame`, mirrored by `flip`, a cell at a time: 0 where nothing is drawn, 1
 *  where what is drawn is made of nothing named, and 2 on for a material, its index in `names`
 *  (which takes in each new one) plus two. */
const madeOf = (body: SpriteBody, frame: number, flip: Flip | undefined, names: string[]) => {
  const out = new Uint8Array(body.w * body.h);
  const rows = flipRows(body.frames[frame] ?? body.frames[0] ?? [], flip);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length && x < body.w; x++) {
      const ch = row[x];
      if (ch === TRANSPARENT) continue;
      const name = body.materials?.[ch];
      if (!name) {
        out[y * body.w + x] = 1;
        continue;
      }
      let k = names.indexOf(name);
      if (k < 0) k = names.push(name) - 1;
      out[y * body.w + x] = k + 2;
    }
  });
  return out;
};

/** `node` at `frame` in depth: its front as its whole assembly (parts and all), the slices behind
 *  it on its own grid, in its colours. */
export function voxelsOf(
  node: SpriteBody,
  view: Omit<LayerView, "flip"> & { variant?: string | null; frame?: number } = {},
): Voxels {
  const frame = view.frame ?? 0;
  const front = assembly(node, frame, view);
  const { w, h } = front;
  // What the front is made of, laid out as its colours are: the last layer drawn at a cell says.
  const materials: string[] = [];
  const frontMade = new Uint8Array(w * h);
  for (const l of layers(node, frame, view)) {
    const cells = madeOf(l.body, l.frame, l.flip, materials);
    for (let y = 0; y < l.body.h; y++) {
      const gy = front.y + l.y + y;
      if (gy < 0 || gy >= h) continue;
      for (let x = 0; x < l.body.w; x++) {
        const c = cells[y * l.body.w + x];
        const gx = front.x + l.x + x;
        if (c && gx >= 0 && gx < w) frontMade[gy * w + gx] = c - 1;
      }
    }
  }
  const behind = (node.slices ?? []).map((_, i) => {
    const body = sliceBody(node, i + 1) as SpriteBody;
    return {
      ...pixels(body, frame, { variant: view.variant }),
      made: madeOf(body, frame, undefined, materials),
    };
  });
  if (node.stack === "down") {
    // A floor a height, the grid at the top; each floor's rows run from the back to the front.
    const high = 1 + behind.length;
    const px = new Uint32Array(w * high * h);
    const made = new Uint8Array(w * high * h);
    for (let row = 0; row < h; row++)
      for (let x = 0; x < w; x++) {
        px[row * high * w + x] = front.px[row * w + x];
        made[row * high * w + x] = frontMade[row * w + x];
      }
    behind.forEach((p, i) => {
      for (let y = 0; y < p.h; y++)
        for (let x = 0; x < p.w; x++) {
          const c = p.px[y * p.w + x];
          if (!c) continue;
          const k = ((front.y + y) * high + i + 1) * w + front.x + x;
          px[k] = c;
          made[k] = Math.max(0, p.made[y * p.w + x] - 1);
        }
    });
    return { w, h: high, d: h, px, made, materials };
  }
  const d = 1 + behind.length;
  const px = new Uint32Array(w * h * d);
  const made = new Uint8Array(w * h * d);
  px.set(front.px, (d - 1) * w * h);
  made.set(frontMade, (d - 1) * w * h);
  // Each slice on the grid's own place in the box the parts may widen, nearest the front first.
  behind.forEach((p, i) => {
    const z = d - 2 - i;
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const c = p.px[y * p.w + x];
        if (!c) continue;
        const k = (z * h + front.y + y) * w + front.x + x;
        px[k] = c;
        made[k] = Math.max(0, p.made[y * p.w + x] - 1);
      }
  });
  return { w, h, d, px, made, materials };
}

/** What the voxel at (x, y, z) is made of, by name; null where nothing is named or none lies. */
export const materialAt = (v: Voxels, x: number, y: number, z: number): string | null => {
  if (x < 0 || y < 0 || z < 0 || x >= v.w || y >= v.h || z >= v.d) return null;
  const k = v.made?.[(z * v.h + y) * v.w + x] ?? 0;
  return k ? (v.materials?.[k - 1] ?? null) : null;
};

/** The word at (x, y, z), 0 outside. */
export const voxelAt = (v: Voxels, x: number, y: number, z: number): number =>
  x < 0 || y < 0 || z < 0 || x >= v.w || y >= v.h || z >= v.d ? 0 : v.px[(z * v.h + y) * v.w + x];
