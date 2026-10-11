// The 3D view's picture: a sprite's voxels (`voxelsOf`, its frames as slices back to front) seen
// from any side, square on, with no perspective. Each pixel is a ray into the grid, stopped by
// the first voxel it meets; that voxel's face is lit by a light over the viewer's left
// shoulder, so a top, a side and a front read apart in one colour. One ray a pixel, so the
// edges stay hard, as the art's own.

import type { Voxels } from "dab-core";

/** Where the view is looking from: turned about the subject's height (yaw, its right side
 *  coming toward you) and raised over it (pitch), radians. 0, 0 is square in front. */
export type Orbit = { yaw: number; pitch: number };

/** A picture of `v` at `scale` pixels a voxel needs this many pixels a side, so any turn fits. */
export const sideOf = (v: Voxels, scale: number): number =>
  Math.max(1, Math.ceil(Math.hypot(v.w, v.h, v.d) * scale));

/** The light, toward it: up, left and toward the viewer of the unturned subject. */
const LIGHT = (() => {
  const [x, y, z] = [-0.45, 0.75, 0.5];
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
})();
/** How lit a face turned from the light is, and one facing it. */
const SHADOW = 0.55;
const SUN = 1;

/** `v` from `orbit`, `side` pixels square at `scale` pixels a voxel; what no voxel covers is
 *  clear. */
export function renderVoxels(v: Voxels, orbit: Orbit, side: number, scale: number): ImageData {
  const out = new ImageData(side, side);
  if (!v.w || !v.h || !v.d) return out;
  const { yaw, pitch } = orbit;
  // Toward the viewer, the view's right and its up, in the subject's frame (x right, y up, z
  // toward the unturned viewer).
  const e = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const r = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const u = [e[1] * r[2] - e[2] * r[1], e[2] * r[0] - e[0] * r[2], e[0] * r[1] - e[1] * r[0]];
  // In the grid's own cells (x across, y down the rows, z from the back slice), a ray goes the
  // other way from `e`.
  const dir = [-e[0], e[1], -e[2]];
  const far = Math.hypot(v.w, v.h, v.d);
  const size = [v.w, v.h, v.d];
  const step = dir.map((c) => (c > 0 ? 1 : c < 0 ? -1 : 0));
  const reach = dir.map((c) => (c ? Math.abs(1 / c) : Number.POSITIVE_INFINITY));
  for (let py = 0; py < side; py++)
    for (let px = 0; px < side; px++) {
      const sx = (px + 0.5 - side / 2) / scale;
      const sy = (side / 2 - py - 0.5) / scale;
      // Its start, out past the subject toward the viewer, in grid cells.
      const wx = e[0] * far + r[0] * sx + u[0] * sy;
      const wy = e[1] * far + r[1] * sx + u[1] * sy;
      const wz = e[2] * far + r[2] * sx + u[2] * sy;
      const o = [wx + v.w / 2, v.h / 2 - wy, wz + v.d / 2];
      // Into the grid's box: the latest of the three entries, the earliest of the exits.
      let [enter, leave, axis] = [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, 0];
      for (let a = 0; a < 3; a++) {
        if (!dir[a]) {
          if (o[a] < 0 || o[a] > size[a]) enter = Number.POSITIVE_INFINITY;
          continue;
        }
        const t0 = (0 - o[a]) / dir[a];
        const t1 = (size[a] - o[a]) / dir[a];
        const [lo, hi] = t0 < t1 ? [t0, t1] : [t1, t0];
        if (lo > enter) [enter, axis] = [lo, a];
        leave = Math.min(leave, hi);
      }
      if (!(enter < leave)) continue;
      // Cell by cell along it (Amanatides & Woo), from where it comes in.
      const p = o.map((c, a) => c + dir[a] * (enter + 1e-7));
      const cell = p.map((c, a) => Math.min(size[a] - 1, Math.max(0, Math.floor(c))));
      const next = cell.map((c, a) =>
        step[a] ? enter + ((step[a] > 0 ? c + 1 : c) - p[a]) / dir[a] : Number.POSITIVE_INFINITY,
      );
      for (;;) {
        const word = v.px[(cell[2] * v.h + cell[1]) * v.w + cell[0]];
        if (word >>> 24) {
          // The face it came in by, turned back into the subject's frame (rows run down).
          const n = [0, 0, 0];
          n[axis] = -step[axis];
          const lit = Math.max(0, n[0] * LIGHT[0] - n[1] * LIGHT[1] + n[2] * LIGHT[2]);
          const k = SHADOW + (SUN - SHADOW) * lit;
          const i = 4 * (py * side + px);
          out.data[i] = (word & 255) * k;
          out.data[i + 1] = ((word >>> 8) & 255) * k;
          out.data[i + 2] = ((word >>> 16) & 255) * k;
          out.data[i + 3] = 255;
          break;
        }
        axis = next[0] < next[1] ? (next[0] < next[2] ? 0 : 2) : next[1] < next[2] ? 1 : 2;
        if (next[axis] > leave) break;
        cell[axis] += step[axis];
        next[axis] += reach[axis];
        if (cell[axis] < 0 || cell[axis] >= size[axis]) break;
      }
    }
  return out;
}
