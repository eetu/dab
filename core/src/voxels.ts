// A sprite read as a thing in three dimensions: its own grid the front, its slices behind it a
// voxel further back each (see `Slice`), a pixel to a voxel. A standing tyre is its sidewall in
// front and three slices behind. This is what a game takes for a model and what the editor's 3D
// panel shows, at a frame: a frame is still a moment, and every slice moves with it.

import { sliceBody, type SpriteBody } from "./format.ts";
import { assembly, type LayerView, pixels } from "./read.ts";

/** The voxels: `w` across, `h` high, `d` deep, each a packed word as `pixels` gives one (0 empty),
 *  across a row, rows down, then from the back (`z` 0) to the front (`d - 1`). */
export type Voxels = { w: number; h: number; d: number; px: Uint32Array };

/** `node` at `frame` in depth: its front as its whole assembly (parts and all), the slices behind
 *  it on its own grid, in its colours. */
export function voxelsOf(
  node: SpriteBody,
  view: Omit<LayerView, "flip"> & { variant?: string | null; frame?: number } = {},
): Voxels {
  const frame = view.frame ?? 0;
  const front = assembly(node, frame, view);
  const behind = (node.slices ?? []).map((_, i) =>
    pixels(sliceBody(node, i + 1) as SpriteBody, frame, { variant: view.variant }),
  );
  const { w, h } = front;
  const d = 1 + behind.length;
  const px = new Uint32Array(w * h * d);
  px.set(front.px, (d - 1) * w * h);
  // Each slice on the grid's own place in the box the parts may widen, nearest the front first.
  behind.forEach((p, i) => {
    const z = d - 2 - i;
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const c = p.px[y * p.w + x];
        if (c) px[(z * h + front.y + y) * w + front.x + x] = c;
      }
  });
  return { w, h, d, px };
}

/** The word at (x, y, z), 0 outside. */
export const voxelAt = (v: Voxels, x: number, y: number, z: number): number =>
  x < 0 || y < 0 || z < 0 || x >= v.w || y >= v.h || z >= v.d ? 0 : v.px[(z * v.h + y) * v.w + x];
