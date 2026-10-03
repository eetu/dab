import { channels, SAME_COLOUR } from "./colour";
import { TRANSPARENT, withAlpha } from "./format";
import { paletteMapper } from "./mapper";

/** Where a point of the result comes from in the source grid, or null for
 *  nowhere — what a transform IS, as far as the sampler is concerned. */
export type BackMap = (x: number, y: number) => readonly [number, number] | null;

/**
 * The sampler every transform shares: a `W × H` result, each pixel built from
 * `nx × ny` points mapped back into the source by `back`.
 *
 * Indexed art cannot interpolate: there is no character between `A` and `B`.
 * So either every result pixel takes exactly one source pixel — crisp, jagged,
 * palette untouched — or the blends it wants become real palette entries. The
 * sample counts are that dial. At 1 it is nearest-neighbour and nothing is
 * added; above that the samples are averaged and whatever comes out is matched
 * against the palette, reusing an entry when one is near enough and allocating
 * when none is. Which is why a second transform costs less than the first: it
 * is matching against a palette the first one already taught the blends to.
 *
 * Blending is in sRGB, not linear light. Linear is the physically correct
 * answer for photographs and the wrong one here — hand-placed pixel-art
 * antialiasing is chosen in sRGB, so a generated blend has to sit in the same
 * space as the ones an artist would have put there by hand. It is premultiplied
 * by opacity, so an edge against nothing fades to transparent rather than
 * toward some guessed background — that guess is what makes a transformed
 * sprite look right in the editor and wrong in the game.
 */
export function resample(
  src: string[],
  palette: Record<string, string>,
  W: number,
  H: number,
  back: BackMap,
  opts: { nx: number; ny: number; tolerance?: number; cover?: boolean },
): { rows: string[]; palette: Record<string, string>; added: string[] } {
  const h = src.length;
  const w = src[0]?.length ?? 0;
  const { nx, ny } = opts;
  const { pal, added, charFor } = paletteMapper(palette, opts.tolerance ?? SAME_COLOUR);

  // `cover` is crisp without the misses: a pixel takes the commonest character
  // among its samples that land on paint, and stays empty only when none do.
  // Nearest-neighbour asks one point per pixel, so a stripe thinner than a
  // pixel falls between the points and is gone — where a hand-drawn road
  // receding narrows to a line. Nothing is blended, so nothing is added.
  const cover = (x: number, y: number): string => {
    const count = new Map<string, number>();
    for (let sy = 0; sy < ny; sy++) {
      for (let sx = 0; sx < nx; sx++) {
        const p = back(x + (sx + 0.5) / nx, y + (sy + 0.5) / ny);
        if (!p) continue;
        const px = Math.floor(p[0]);
        const py = Math.floor(p[1]);
        if (py < 0 || py >= h || px < 0 || px >= w) continue;
        const ch = src[py][px];
        if (ch !== TRANSPARENT && pal[ch]) count.set(ch, (count.get(ch) ?? 0) + 1);
      }
    }
    let best = TRANSPARENT;
    let most = 0;
    for (const [ch, n] of count) if (n > most) [best, most] = [ch, n];
    return best;
  };

  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = "";
    for (let x = 0; x < W; x++) {
      if (opts.cover) {
        row += cover(x, y);
        continue;
      }
      let R = 0;
      let G = 0;
      let B = 0;
      let A = 0;
      for (let sy = 0; sy < ny; sy++) {
        for (let sx = 0; sx < nx; sx++) {
          const p = back(x + (sx + 0.5) / nx, y + (sy + 0.5) / ny);
          if (!p) continue;
          const px = Math.floor(p[0]);
          const py = Math.floor(p[1]);
          if (py < 0 || py >= h || px < 0 || px >= w) continue;
          const ch = src[py][px];
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
      const alpha = (A / (nx * ny)) * 255;
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
    rows.push(row);
  }
  return { rows, palette: pal, added };
}
