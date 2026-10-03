import { alphaOf } from "./format";

/**
 * A colour in OKLab, plus its opacity — used for one question only: is this the
 * same colour as one the palette already has?
 *
 * Not RGB distance, which is not what an eye does. Green carries most of the
 * perceived brightness and blue almost none, so two colours a fixed RGB step
 * apart can be indistinguishable in one part of the space and obviously
 * different in another. Rotation leans on this hard: it invents blend colours,
 * and if "near enough to one we have" is judged wrongly the palette fills with
 * duplicates nobody can tell apart — and there are only 69 characters.
 */
export type Lab = { L: number; a: number; b: number; alpha: number };

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** `#rrggbb` or `#rrggbbaa` as four 0–255 channels. */
export function channels(hex: string): [number, number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
    alphaOf(hex),
  ];
}

export function oklab(hex: string): Lab {
  const [r8, g8, b8, a8] = channels(hex);
  const r = linear(r8 / 255);
  const g = linear(g8 / 255);
  const b = linear(b8 / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    alpha: a8 / 255,
  };
}

/** How far apart two colours look. Opacity is a full axis: same red at 20% and
 *  at 100% is not the same colour, and blending edges makes plenty of both. */
export function colourGap(x: Lab, y: Lab): number {
  const dL = x.L - y.L;
  const da = x.a - y.a;
  const db = x.b - y.b;
  const dAlpha = x.alpha - y.alpha;
  return Math.sqrt(dL * dL + da * da + db * db + dAlpha * dAlpha);
}

/**
 * How close two colours must be before one is reused for the other.
 *
 * Roughly twice a just-noticeable difference. Tighter and every rotation leaves
 * a drift of colours that look identical in the palette grid; looser and a
 * rotation quietly restates the art in colours the artist did not choose.
 */
export const SAME_COLOUR = 0.04;
