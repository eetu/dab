import { colourGap, type Lab, oklab, SAME_COLOUR } from "./colour.ts";
import { PALETTE_CHARS } from "./palette.ts";

/**
 * Characters for colours nobody drew by hand — the palette side of every
 * operation that INVENTS colour (rotation's blends, flatten's glass overlaps).
 * The nearest existing entry when it looks the same (OKLab, within
 * `tolerance`), a new entry while the 69 characters last, and the nearest
 * anyway when they run out: slightly wrong beats cannot-happen.
 */
export function paletteMapper(palette: Record<string, string>, tolerance = SAME_COLOUR) {
  const pal = { ...palette };
  const added: string[] = [];
  // Both caches exist because a caller asks the same question over and over —
  // rotation samples² times per pixel, flatten once per cell of flat art.
  const labs = new Map<string, Lab>();
  const chosen = new Map<string, string>();
  const labOf = (hex: string) => {
    let l = labs.get(hex);
    if (!l) labs.set(hex, (l = oklab(hex)));
    return l;
  };
  const charFor = (hex: string): string => {
    const hit = chosen.get(hex);
    if (hit) return hit;
    const want = labOf(hex);
    let best = "";
    let gap = Infinity;
    for (const [ch, have] of Object.entries(pal)) {
      const d = colourGap(want, labOf(have));
      if (d < gap) {
        gap = d;
        best = ch;
      }
    }
    let ch = best;
    if (gap > tolerance) {
      const free = [...PALETTE_CHARS].find((c) => !(c in pal));
      if (free) {
        pal[free] = hex;
        added.push(free);
        ch = free;
      }
    }
    chosen.set(hex, ch);
    return ch;
  };
  return { pal, added, charFor };
}
