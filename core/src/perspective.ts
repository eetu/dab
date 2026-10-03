import { resample } from "./sample";

// Deluxe Paint's perspective brush: a plane in front of the eye, and the brush
// laid on it wherever the pointer lands.
//
// The plane is set by three angles and a distance, and pinned to an ANCHOR in
// the frame — the point where it is at its true size. A stamp anywhere else
// finds where that pixel's line of sight meets the plane and puts the brush
// there, so one brush comes out large near the eye and small toward the
// horizon, foreshortened by the angle: the road, the floor, the side of a box.
//
// The eye looks down +z with the plane's anchor straight ahead at `distance`,
// and the focal length IS that distance — so at the anchor a facing plane is
// 1:1 whatever the distance, and the distance only says how steep it is. As it
// grows the view tends to the orthographic one a hinge turn draws.

export type Plane = {
  /** Degrees the plane leans back from facing you: 0 is the picture plane, and
   *  toward 90 it lies down like a floor, its top edge furthest away. */
  tilt: number;
  /** Degrees it swings about the vertical, right edge away — a wall receding. */
  turn: number;
  /** Degrees the brush spins on the plane before it leans, clockwise. */
  spin: number;
  /** How far the eye is from the anchor, in pixels. Near is steep, far is flat. */
  distance: number;
  /** The anchor, in frame coordinates. */
  x: number;
  y: number;
};

type Vec = [number, number, number];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Closer than this share of the distance is refused rather than projected:
 *  a point at the eye lands at infinity, and one behind it lands mirrored. */
const NEAR = 0.02;

/**
 * The plane worked out once — its axes in eye space — and the two directions
 * every question here is asked in: frame to plane, and plane to frame.
 *
 * Spin first, in the plane; then the lean back; then the swing. That order is
 * what makes the angles mean what their names say: a floor tilted 60° and
 * turned 20° is still a floor, swung, not a wall leaned over.
 */
function geometry(p: Plane) {
  const [cs, ss] = [Math.cos(rad(p.spin)), Math.sin(rad(p.spin))];
  const [ct, st] = [Math.cos(rad(p.tilt)), Math.sin(rad(p.tilt))];
  const [cu, su] = [Math.cos(rad(p.turn)), Math.sin(rad(p.turn))];
  const rot = ([x0, y0, z0]: Vec): Vec => {
    const x1 = x0 * cs - y0 * ss;
    const y1 = x0 * ss + y0 * cs;
    // Lean back: the brush's down axis (0,1,0) goes to (0, cos, −sin), so its
    // top edge moves away from the eye.
    const y2 = y1 * ct + z0 * st;
    const z2 = -y1 * st + z0 * ct;
    // Swing: its right axis (1,0,0) goes to (cos, 0, sin), right edge away.
    return [x1 * cu - z2 * su, y2, x1 * su + z2 * cu];
  };
  const u = rot([1, 0, 0]);
  const v = rot([0, 1, 0]);
  const n = rot([0, 0, 1]);
  const f = p.distance;
  const near = f * NEAR;

  /** Depth of a plane point: the eye is at 0, the anchor at `f`. */
  const depth = (s: number, t: number) => f + s * u[2] + t * v[2];

  return {
    depth,
    near,
    /** Where a frame point's line of sight meets the plane, in plane pixels
     *  from the anchor — null at the horizon or past it. */
    toPlane(x: number, y: number): [number, number] | null {
      const r: Vec = [(x - p.x) / f, (y - p.y) / f, 1];
      const nr = dot(n, r);
      if (nr <= 1e-12) return null;
      const k = (n[2] * f) / nr;
      if (k * r[2] <= near) return null;
      const d: Vec = [k * r[0], k * r[1], k * r[2] - f];
      return [dot(d, u), dot(d, v)];
    },
    /** Where a plane point appears in the frame — null too near the eye. */
    toFrame(s: number, t: number): [number, number] | null {
      const z = depth(s, t);
      if (z <= near) return null;
      return [p.x + (f * (s * u[0] + t * v[0])) / z, p.y + (f * (s * u[1] + t * v[1])) / z];
    },
  };
}

/** Plane pixels from the anchor for a frame point; null at or past the horizon. */
export const planePoint = (p: Plane, x: number, y: number) => geometry(p).toPlane(x, y);

/** The frame point a plane point appears at; null too near the eye to draw. */
export const framePoint = (p: Plane, s: number, t: number) => geometry(p).toFrame(s, t);

export type Projected = {
  rows: string[];
  palette: Record<string, string>;
  /** Characters the palette gained — the cost, shown before it is paid. */
  added: string[];
  /** Where the result's top-left sits in the frame. */
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * The brush laid on the plane, centred where the line of sight through `at`
 * meets it, as the frame sees it.
 *
 * The result is a block like any stamp: transparent cells are gaps when it is
 * put down. Null when there is nothing sensible to draw — `at` at or above the
 * horizon, a corner of the brush too near the eye, or a result more than
 * `limit` pixels a side, which is what a brush stamped just under the horizon
 * of a steep plane becomes.
 *
 * `samples` is the smoothing dial `resample` describes.
 */
export function projectRows(
  rows: string[],
  palette: Record<string, string>,
  plane: Plane,
  at: { x: number; y: number },
  opts: { samples?: number; tolerance?: number; limit?: number } = {},
): Projected | null {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  if (!w || !h || !(plane.distance > 0)) return null;
  const geo = geometry(plane);
  const anchor = geo.toPlane(at.x, at.y);
  if (!anchor) return null;
  const [s0, t0] = anchor;
  // A rectangle on a plane in front of the eye projects to a convex quad, so
  // its corners bound it.
  const corners = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ].map(([bx, by]) => geo.toFrame(s0 + bx - w / 2, t0 + by - h / 2));
  if (corners.some((c) => !c)) return null;
  const xs = corners.map((c) => c![0]);
  const ys = corners.map((c) => c![1]);
  // A thousandth of slack: a corner a hair past a pixel edge — the near side of
  // an almost-flat plane is a few millionths wider — reaches no sample point in
  // that pixel, and would otherwise buy an empty row on each side.
  const x0 = Math.floor(Math.min(...xs) + 1e-3);
  const y0 = Math.floor(Math.min(...ys) + 1e-3);
  const W = Math.ceil(Math.max(...xs) - 1e-3) - x0;
  const H = Math.ceil(Math.max(...ys) - 1e-3) - y0;
  const limit = opts.limit ?? 512;
  if (W < 1 || H < 1 || W > limit || H > limit) return null;

  const n = Math.max(1, Math.round(opts.samples ?? 1));
  const r = resample(
    rows,
    palette,
    W,
    H,
    (dx, dy) => {
      const q = geo.toPlane(x0 + dx, y0 + dy);
      return q && [q[0] - s0 + w / 2, q[1] - t0 + h / 2];
    },
    { nx: n, ny: n, tolerance: opts.tolerance },
  );
  return { ...r, x: x0, y: y0, w: W, h: H };
}

/**
 * The plane's grid, as frame-space segments `[x0, y0, x1, y1]`: a line every
 * `step` plane pixels, out to `reach` from the anchor each way.
 *
 * A projected line is still straight, so each is two points — cut back where
 * it would pass too near the eye, which is the half of a floor's grid behind
 * the viewer.
 */
export function planeGrid(
  plane: Plane,
  step: number,
  reach: number,
): [number, number, number, number][] {
  if (!(plane.distance > 0) || !(step > 0)) return [];
  const geo = geometry(plane);
  const out: [number, number, number, number][] = [];
  const segment = (a: [number, number], b: [number, number]) => {
    const za = geo.depth(...a);
    const zb = geo.depth(...b);
    const floor = geo.near * 1.01;
    if (za <= floor && zb <= floor) return;
    const cut = (p: [number, number], q: [number, number], zp: number, zq: number) => {
      const k = (floor - zp) / (zq - zp);
      return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k] as [number, number];
    };
    if (za <= floor) a = cut(a, b, za, zb);
    if (zb <= floor) b = cut(b, a, zb, za);
    const pa = geo.toFrame(...a);
    const pb = geo.toFrame(...b);
    if (pa && pb) out.push([pa[0], pa[1], pb[0], pb[1]]);
  };
  const k = Math.floor(reach / step);
  for (let i = -k; i <= k; i++) {
    segment([i * step, -reach], [i * step, reach]);
    segment([-reach, i * step], [reach, i * step]);
  }
  return out;
}
