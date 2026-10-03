import { TRANSPARENT } from "./format";

/**
 * A lifted block of pixels: what was there, and where each cell sat relative to
 * the block's top-left corner.
 *
 * Relative rather than absolute so the same block can be put down anywhere — a
 * move is a lift and a put-down at an offset, and a paste is a put-down of a
 * block lifted earlier. Transparent cells are carried so the block keeps its
 * shape and its size; they are gaps when it lands, not paint. See `stampCells`.
 */
export type Stamp = { w: number; h: number; cells: { dx: number; dy: number; ch: string }[] };

/** Lift the given pixels out of a frame, keeping their shape. */
export function readStamp(frame: string[], points: Iterable<readonly [number, number]>): Stamp {
  const pts = [...points].filter(
    ([x, y]) => y >= 0 && y < frame.length && x >= 0 && x < frame[y].length,
  );
  if (!pts.length) return { w: 0, h: 0, cells: [] };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return {
    w: maxX - minX + 1,
    h: maxY - minY + 1,
    cells: pts.map(([x, y]) => ({ dx: x - minX, dy: y - minY, ch: frame[y][x] })),
  };
}

/**
 * Put a block down with its top-left corner at (x, y). Cells that fall outside
 * the frame are dropped, not wrapped — a block dragged half off the edge loses
 * the half that left.
 *
 * Transparent cells in the stamp are holes, not
 * paint: a box drawn round a door takes the empty corners with it, and stamping
 * those as `.` would rub out whatever the door was laid over. Every editor with
 * a brush or a floating paste works this way — the shape covers, its gaps show
 * through. To clear a region, clear it; that is `setPixels`, not a stamp.
 */
export function stampCells(frame: string[], stamp: Stamp, x: number, y: number): string[] {
  const rows = frame.map((r) => r.split(""));
  let touched = false;
  for (const c of stamp.cells) {
    if (c.ch === TRANSPARENT) continue;
    const px = x + c.dx;
    const py = y + c.dy;
    if (py < 0 || py >= rows.length || px < 0 || px >= rows[py].length) continue;
    if (rows[py][px] === c.ch) continue;
    rows[py][px] = c.ch;
    touched = true;
  }
  return touched ? rows.map((r) => r.join("")) : frame;
}
