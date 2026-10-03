import { type Level, type SpriteBody } from "./format";
import { patch } from "./patch";
import { resample } from "./sample";

// Levels of detail: one subject drawn at more than one size (see `Level`).
//
// A new level is DERIVED from one that exists and then drawn over — never the
// final art, but it saves drawing the silhouette again. Neither direction adds
// a colour: down is the coverage sampler, so an antler a pixel wide stays a
// pixel rather than falling between samples; up is Scale2x/Scale3x, which
// rounds diagonals instead of doubling the staircase.

/** Scale2x (EPX): each pixel becomes four, a corner taking a neighbour's
 *  character where two neighbours agree and the others do not — a diagonal
 *  edge stays one diagonal instead of a staircase of 2×2 steps. */
export function scale2x(rows: string[]): string[] {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const at = (x: number, y: number) =>
    rows[Math.max(0, Math.min(h - 1, y))][Math.max(0, Math.min(w - 1, x))];
  const out: string[] = [];
  for (let y = 0; y < h; y++) {
    let top = "";
    let bottom = "";
    for (let x = 0; x < w; x++) {
      const p = at(x, y);
      const a = at(x, y - 1);
      const b = at(x + 1, y);
      const c = at(x - 1, y);
      const d = at(x, y + 1);
      top += (c === a && c !== d && a !== b ? a : p) + (a === b && a !== c && b !== d ? b : p);
      bottom += (d === c && d !== b && c !== a ? c : p) + (b === d && b !== a && d !== c ? d : p);
    }
    out.push(top, bottom);
  }
  return out;
}

/** Scale3x: the same idea at three, for the factors two cannot reach. */
export function scale3x(rows: string[]): string[] {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const at = (x: number, y: number) =>
    rows[Math.max(0, Math.min(h - 1, y))][Math.max(0, Math.min(w - 1, x))];
  const out: string[] = [];
  for (let y = 0; y < h; y++) {
    const r = ["", "", ""];
    for (let x = 0; x < w; x++) {
      const [A, B, C] = [at(x - 1, y - 1), at(x, y - 1), at(x + 1, y - 1)];
      const [D, E, F] = [at(x - 1, y), at(x, y), at(x + 1, y)];
      const [G, H, I] = [at(x - 1, y + 1), at(x, y + 1), at(x + 1, y + 1)];
      const db = D === B && B !== F && D !== H;
      const bf = B === F && B !== D && F !== H;
      const dh = D === H && D !== B && H !== F;
      const hf = H === F && D !== H && B !== F;
      r[0] += (db ? D : E) + ((db && E !== C) || (bf && E !== A) ? B : E) + (bf ? F : E);
      r[1] +=
        ((db && E !== G) || (dh && E !== A) ? D : E) +
        E +
        ((bf && E !== I) || (hf && E !== C) ? F : E);
      r[2] += (dh ? D : E) + ((dh && E !== I) || (hf && E !== G) ? H : E) + (hf ? F : E);
    }
    out.push(...r);
  }
  return out;
}

/**
 * A grid at another size, for drawing over. Up is Scale2x and Scale3x — as
 * many as reach the size, smallest first — and whatever overshoots is brought
 * down; down is the coverage sampler. No colour is added either way.
 */
export function scaleRows(
  rows: string[],
  palette: Record<string, string>,
  W: number,
  H: number,
): string[] {
  let src = rows;
  const need = Math.max(W / (rows[0]?.length || 1), H / (rows.length || 1));
  for (let k = 1; k < need - 1e-9;) {
    // Three only where two would fall short and three need not overshoot by
    // much: four is two twos, not a three and a two.
    const left = need / k;
    const step = left > 2 && left <= 3 ? 3 : 2;
    src = step === 3 ? scale3x(src) : scale2x(src);
    k *= step;
  }
  const w = src[0]?.length ?? 0;
  const h = src.length;
  if (w === W && h === H) return src;
  return resample(src, palette, W, H, (dx, dy) => [(dx * w) / W, (dy * h) / H], {
    nx: 4,
    ny: 4,
    cover: true,
  }).rows;
}

/** A new level at `w × h` from a body that exists: every frame scaled, the
 *  palette and variants as they are, since the characters are the same ones. */
export function deriveLevel(from: SpriteBody, name: string, w: number, h: number): Level {
  return {
    name,
    w,
    h,
    palette: { ...from.palette },
    ...(from.variants
      ? {
          variants: Object.fromEntries(
            Object.entries(from.variants).map(([k, v]) => [k, { ...v }]),
          ),
        }
      : {}),
    frames: from.frames.map((f) => scaleRows(f, from.palette, w, h)),
  };
}

/** Add a level to a sprite. Unchanged for a name that is taken or unusable,
 *  or a level out of step — the validator's rules, refused at the door. */
export function addLevel<T extends SpriteBody>(s: T, level: Level): T {
  const name = level.name.trim();
  if (!name || name.includes("/") || s.levels?.some((l) => l.name === name)) return s;
  if (level.frames.length !== s.frames.length || level.parts || level.animations) return s;
  return patch(s, { levels: [...(s.levels ?? []), { ...level, name }] });
}

export function removeLevel<T extends SpriteBody>(s: T, name: string): T {
  const levels = (s.levels ?? []).filter((l) => l.name !== name);
  if (levels.length === (s.levels?.length ?? 0)) return s;
  return patch(s, { levels: levels.length ? levels : undefined });
}

export function renameLevel<T extends SpriteBody>(s: T, from: string, to: string): T {
  const name = to.trim();
  if (!name || name.includes("/") || name === from) return s;
  if (!s.levels?.some((l) => l.name === from) || s.levels.some((l) => l.name === name)) return s;
  return patch(s, { levels: s.levels.map((l) => (l.name === from ? { ...l, name } : l)) });
}
