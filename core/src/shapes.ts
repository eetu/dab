import { TRANSPARENT } from "./format.ts";
import { getPixel } from "./geometry.ts";

/** Bresenham. Integer steps only — a float line rounds to an uneven stair. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  let x = Math.round(x0);
  let y = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - x);
  const dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1;
  const sy = y < ey ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x, y]);
    if (x === ex && y === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

export function rectPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean,
): [number, number][] {
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);
  const pts: [number, number][] = [];
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      if (filled || y === ya || y === yb || x === xa || x === xb) pts.push([x, y]);
    }
  }
  return pts;
}

/** Midpoint ellipse inscribed in the dragged box, so a square drag is a circle. */
export function ellipsePoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean,
): [number, number][] {
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);
  const cx = (xa + xb) / 2;
  const cy = (ya + yb) / 2;
  const rx = (xb - xa) / 2 + 0.001;
  const ry = (yb - ya) / 2 + 0.001;
  const pts: [number, number][] = [];
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const d = nx * nx + ny * ny;
      if (filled ? d <= 1 : d <= 1 && !insideRing(x, y, cx, cy, rx, ry)) pts.push([x, y]);
    }
  }
  return pts;
}

/** True when every 4-neighbour is also inside — i.e. not on the outline. */
function insideRing(x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean {
  const inside = (px: number, py: number) => {
    const nx = (px - cx) / rx;
    const ny = (py - cy) / ry;
    return nx * nx + ny * ny <= 1;
  };
  return inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1);
}

/** 4-connected flood fill from a seed, bounded by the frame. */
export function floodPoints(frame: string[], x: number, y: number): [number, number][] {
  const target = getPixel(frame, x, y);
  if (y < 0 || y >= frame.length || x < 0 || x >= frame[0].length) return [];
  const w = frame[0].length;
  const h = frame.length;
  const seen = new Uint8Array(w * h);
  const out: [number, number][] = [];
  const stack: [number, number][] = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop()!;
    if (px < 0 || px >= w || py < 0 || py >= h) continue;
    if (seen[py * w + px]) continue;
    if (frame[py][px] !== target) continue;
    seen[py * w + px] = 1;
    out.push([px, py]);
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  return out;
}

/**
 * The connected SHAPE at a seed: every pixel touching it that has something in
 * it, whatever colour that is.
 *
 * Flood fill's cousin, and deliberately not the same rule. Fill spreads over one
 * character because it is about to paint them all; this is about to pick
 * something up, and the thing you point at is an object rather than a colour. A
 * car body is a dozen characters and one shape, and the fill rule would hand back
 * the highlight and leave the paint behind.
 *
 * Empty space is not a shape: a transparent seed selects nothing. The connected
 * background is technically a region, but nobody points at the emptiness meaning
 * "that one" — so callers get an empty result and can treat the click as the
 * "nothing here" it was.
 */
export function shapePoints(frame: string[], x: number, y: number): [number, number][] {
  if (y < 0 || y >= frame.length || x < 0 || x >= frame[0].length) return [];
  if (getPixel(frame, x, y) === TRANSPARENT) return [];
  const w = frame[0].length;
  const h = frame.length;
  const seen = new Uint8Array(w * h);
  const out: [number, number][] = [];
  const stack: [number, number][] = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop()!;
    if (px < 0 || px >= w || py < 0 || py >= h) continue;
    if (seen[py * w + px]) continue;
    if (frame[py][px] === TRANSPARENT) continue;
    seen[py * w + px] = 1;
    out.push([px, py]);
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  return out;
}

/**
 * Every cell of one character, connected or not — what Deluxe Paint's stencil
 * grew from. Fill and shape select both stop at the edge of a run; this is for
 * "every red", the highlight scattered over the whole body. The transparent
 * character selects nothing: emptiness is not a colour.
 */
export function charPoints(frame: string[], ch: string): [number, number][] {
  if (ch === TRANSPARENT) return [];
  const out: [number, number][] = [];
  frame.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === ch) out.push([x, y]);
  });
  return out;
}
