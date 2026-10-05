import { TRANSPARENT } from "./format.ts";

// Carrying an edit from one frame to the others: a spot added to the deer in
// frame 0 belongs on every frame of the walk, but the deer bobs and strides,
// so it is not at the same cells in each. The edit is carried as cells — what
// each was and what it became — and lands on a frame at the offset where what
// surrounded it is found again, and only where that frame still has what the
// edit replaced. A cell the frame has moved on from is reported, never
// overwritten: a leg swung across the flank is the frame's, not the edit's.

const at = (rows: readonly string[], x: number, y: number): string => rows[y]?.[x] ?? TRANSPARENT;

/** One changed cell: where, what it was, what it is now. */
export type CellEdit = { x: number; y: number; was: string; now: string };

/** The cells that differ between two copies of a frame. */
export function frameEdits(before: readonly string[], after: readonly string[]): CellEdit[] {
  const out: CellEdit[] = [];
  const h = Math.max(before.length, after.length);
  for (let y = 0; y < h; y++) {
    const w = Math.max(before[y]?.length ?? 0, after[y]?.length ?? 0);
    for (let x = 0; x < w; x++) {
      const was = before[y]?.[x] ?? TRANSPARENT;
      const now = after[y]?.[x] ?? TRANSPARENT;
      if (was !== now) out.push({ x, y, was, now });
    }
  }
  return out;
}

/**
 * Where `edits` — made on `base`, the frame as it was — fit `target` best:
 * the offset at which most of what surrounded them is found again. Only drawn
 * cells are compared, since empty air matches everywhere and says nothing.
 * Ties go to the smaller move.
 */
export function bestOffset(
  base: readonly string[],
  edits: readonly CellEdit[],
  target: readonly string[],
  radius = 4,
): { dx: number; dy: number; matched: number; of: number } {
  const around = new Set<string>();
  for (const e of edits) {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) around.add(`${e.x + i},${e.y + j}`);
  }
  const context = [...around]
    .map((k) => k.split(",").map(Number) as [number, number])
    .map(([x, y]) => ({ x, y, ch: at(base, x, y) }))
    .filter((c) => c.ch !== TRANSPARENT);
  let best = { dx: 0, dy: 0, matched: -1, of: context.length };
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      let matched = 0;
      for (const c of context) if (at(target, c.x + dx, c.y + dy) === c.ch) matched++;
      const nearer = Math.abs(dx) + Math.abs(dy) < Math.abs(best.dx) + Math.abs(best.dy);
      if (matched > best.matched || (matched === best.matched && nearer)) {
        best = { dx, dy, matched, of: context.length };
      }
    }
  }
  return best;
}

export type Carried = {
  rows: string[];
  /** Edits that landed, in the target's cells. */
  placed: CellEdit[];
  /** Edits that fell off the grid. */
  off: number;
  /** Cells where the target has something other than what the edit replaced. */
  mismatched: { x: number; y: number; has: string; want: string }[];
};

/**
 * Put `edits` down on `target`, moved by (dx, dy). With `match` (the default)
 * an edit lands only where the target still has what the edit replaced;
 * without it, everywhere it falls on the grid.
 */
export function carryEdits(
  target: readonly string[],
  edits: readonly CellEdit[],
  dx: number,
  dy: number,
  opts: { match?: boolean } = {},
): Carried {
  const match = opts.match ?? true;
  const rows = target.map((r) => r.split(""));
  const out: Carried = { rows: [...target], placed: [], off: 0, mismatched: [] };
  for (const e of edits) {
    const x = e.x + dx;
    const y = e.y + dy;
    if (y < 0 || y >= rows.length || x < 0 || x >= rows[y].length) {
      out.off++;
      continue;
    }
    const has = rows[y][x];
    if (has === e.now) continue;
    if (match && has !== e.was) {
      out.mismatched.push({ x, y, has, want: e.was });
      continue;
    }
    rows[y][x] = e.now;
    out.placed.push({ x, y, was: has, now: e.now });
  }
  out.rows = rows.map((r) => r.join(""));
  return out;
}
