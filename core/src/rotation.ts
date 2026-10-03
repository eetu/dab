import { type Stamp } from "./blocks";
import { TRANSPARENT } from "./format";
import { resample } from "./sample";

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
 * `samples` is the smoothing dial, as `resample` describes: 1 is crisp and
 * free, above that each pixel is averaged over samples² points.
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
  const r = resample(
    rows,
    palette,
    W,
    H,
    (dx, dy) => {
      const u = dx - W / 2;
      const v = dy - H / 2;
      return [u * cos + v * sin + w / 2, -u * sin + v * cos + h / 2];
    },
    { nx: n, ny: n, tolerance: opts.tolerance },
  );
  return { ...r, w: W, h: H };
}

/** Rows as columns. A horizontal hinge is a vertical one with the grid on its
 *  side, so its back-map is written once. */
const transpose = (rows: string[], w: number, h: number): string[] =>
  Array.from({ length: w }, (_, x) => Array.from({ length: h }, (_, y) => rows[y][x]).join(""));

/**
 * Swing a grid about a hinge LINE, as an orthographic view shows it.
 *
 * A car door opening toward the viewer does not turn in the picture plane: its
 * face turns out of it, and a side view shows that face foreshortened — the
 * same art, `cos θ` as wide, pinned where it is hinged. So one axis compresses
 * and the other is untouched, which is what makes this a different operation
 * from `rotateRows` rather than a special case of it.
 *
 * Sign does not matter: swinging toward the viewer and away from it project to
 * the same silhouette. Which FACE you then see is art, not geometry, and that
 * is the artist's to draw over the result.
 *
 * The grid keeps its size. A door gets narrower, never bigger, so there is
 * nothing to grow to hold — unlike a turn in the plane, which needs the corners.
 *
 * `samples` is the same dial as rotation's: 1 takes exactly one source pixel per
 * destination pixel, so it drops columns and invents nothing, and above that the
 * columns that land together are averaged and matched against the palette —
 * reusing an entry when one is near enough, allocating when none is.
 */
export function hingeRows(
  rows: string[],
  palette: Record<string, string>,
  degrees: number,
  opts: { axis?: "y" | "x"; hinge?: number; samples?: number; tolerance?: number } = {},
): Rotation {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  if (!w || !h) return { rows, palette, added: [], w, h };

  const axis = opts.axis ?? "y";
  const src = axis === "y" ? rows : transpose(rows, w, h);
  // Along the hinge's normal, and across it: the sampler only knows these.
  const across = axis === "y" ? w : h;
  const along = axis === "y" ? h : w;
  const hinge = Math.max(0, Math.min(across, opts.hinge ?? 0));
  // Past a quarter turn the face is edge-on and then facing away — the same
  // silhouette back again, which is the artist's to draw, not the sampler's.
  const k = Math.max(0, Math.cos((Math.min(90, Math.abs(degrees)) * Math.PI) / 180));
  if (k === 1) return { rows, palette, added: [], w, h };

  const n = Math.max(1, Math.round(opts.samples ?? 1));
  // Destination back to source: a pixel of the door as drawn covers 1/k pixels
  // of the door as it stood. Edge-on, it covers nothing at all.
  const r = resample(
    src,
    palette,
    across,
    along,
    (dx, dy) => (k === 0 ? null : [hinge + (dx - hinge) / k, dy]),
    { nx: n, ny: 1, tolerance: opts.tolerance },
  );
  const out = r.rows;

  // `out` is `along` rows of `across` characters, whichever axis this was.
  return {
    rows: axis === "y" ? out : transpose(out, across, along),
    palette: r.palette,
    added: r.added,
    w,
    h,
  };
}
