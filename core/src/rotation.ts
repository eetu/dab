import { type Stamp } from "./blocks";
import { channels, SAME_COLOUR } from "./colour";
import { TRANSPARENT, withAlpha } from "./format";
import { paletteMapper } from "./mapper";

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

/** Rows as columns. A horizontal hinge is a vertical one with the grid on its
 *  side, so the sampler below is written once. */
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
  const { pal, added, charFor } = paletteMapper(palette, opts.tolerance ?? SAME_COLOUR);

  const out = Array.from({ length: along }, (_, y) => {
    let row = "";
    for (let x = 0; x < across; x++) {
      if (k === 0) {
        row += TRANSPARENT;
        continue;
      }
      let R = 0;
      let G = 0;
      let B = 0;
      let A = 0;
      for (let s = 0; s < n; s++) {
        // Destination back to source: a pixel of the door as drawn covers 1/k
        // pixels of the door as it stood.
        const u = hinge + (x + (s + 0.5) / n - hinge) / k;
        const px = Math.floor(u);
        if (px < 0 || px >= across) continue;
        const ch = src[y][px];
        const hex = ch === TRANSPARENT ? undefined : pal[ch];
        if (!hex) continue;
        const [r, g, b, a8] = channels(hex);
        const a = a8 / 255;
        R += r * a;
        G += g * a;
        B += b * a;
        A += a;
      }
      const alpha = (A / n) * 255;
      if (Math.round(alpha) <= 0) {
        row += TRANSPARENT;
        continue;
      }
      const hex2 = (v: number) =>
        Math.max(0, Math.min(255, Math.round(v / A)))
          .toString(16)
          .padStart(2, "0");
      row += charFor(withAlpha(`#${hex2(R)}${hex2(G)}${hex2(B)}`, alpha));
    }
    return row;
  });

  // `out` is `along` rows of `across` characters, whichever axis this was.
  return {
    rows: axis === "y" ? out : transpose(out, across, along),
    palette: pal,
    added,
    w,
    h,
  };
}
