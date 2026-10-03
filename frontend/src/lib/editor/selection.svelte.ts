import { charPoints, rectPoints, shapePoints, type Stamp, TRANSPARENT } from "dab-core";
import { SvelteSet } from "svelte/reactivity";

import { editor } from "./state.svelte";
import { activeNode, frameNow, rowsNow } from "./tree.svelte";

// A selection is a set of cells, not a rectangle: clicking a shape selects the
// connected run under the cursor, which is rarely box-shaped. The bounds come
// along for the marquee to draw and for a paste to know where the block sits.
//
// Moving is a LIFT and a PUT-DOWN. On the first pixel of travel the selected
// cells are cleared from the frame and kept as a stamp; every later step puts
// that stamp down on the cleared frame at a new offset. So the undo stack gets
// one entry for a whole drag — the state before the block moved — and the frame
// is never a half-moved mess.

const key = (x: number, y: number) => `${x},${y}`;

export const selection = $state({
  /** "x,y" of every selected cell. Empty means no selection. */
  cells: new SvelteSet<string>(),
  x0: 0,
  y0: 0,
  x1: 0,
  y1: 0,
  /** Ticks up on every fresh selection: the canvas flashes what just got picked,
   *  because a one-pixel dashed outline is easy to miss on a dense sprite. */
  flash: 0,
});

type Float = { stamp: Stamp; base: string[]; x: number; y: number; frame: number };

/** The lifted block mid-move, the frame it was lifted out of, and which frame
 *  of the strip that was — a base re-stamped onto another frame overwrites it. */
let float: Float | null = null;

export const heldFloat = (): Float | null => float;

/** Float a block that has just been put down: the next nudge re-stamps it over
 *  `base` instead of opening another undo entry. */
export function holdFloat(next: Float): Float {
  float = next;
  return next;
}

/**
 * Whether the float is a PASTE, rather than a lift.
 *
 * Only a paste is sitting over art that is not its own — a move and a turn both
 * carry a base the block was lifted out of, so there is nothing underneath them
 * to lose. So only a paste has anything to say, and it is the only one that
 * changes how the marquee looks.
 */
export const floating = $state({ on: false, frame: 0 });

/** Whether a paste floats on the frame being looked at. Stepping away leaves it
 *  floating on its own frame, and the cue goes with it: the chip and the accent
 *  ants are about what is on screen. */
export const pasteFloating = () => floating.on && floating.frame === frameNow();

/** What was copied, and where its top-left sat — where a paste lands when
 *  nothing is selected, so a frame copied onto the next one lines up. */
export const clipboard = $state({ stamp: null as Stamp | null, x: 0, y: 0 });

export const hasSelection = () => selection.cells.size > 0;
export const isSelected = (x: number, y: number) => selection.cells.has(key(x, y));

export function setSelection(points: Iterable<readonly [number, number]>) {
  const cells = new SvelteSet<string>();
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    cells.add(key(x, y));
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  selection.cells = cells;
  if (cells.size) {
    editor.tool = "select";
    selection.x0 = x0;
    selection.y0 = y0;
    selection.x1 = x1;
    selection.y1 = y1;
    selection.flash++;
  }
}

/**
 * Clicking picks the whole connected SHAPE under it, whatever colours are in it:
 * what you point at is an object, not a colour. Fill's one-character rule would
 * hand back a highlight and leave the body it sits on behind.
 *
 * A click on empty space drops the selection instead of selecting the emptiness.
 * Nobody clicks the background meaning "select that", and every editor with a
 * marquee already reads a click on nothing as "never mind".
 */
export function selectShapeAt(x: number, y: number) {
  dropFloat();
  const pts = shapePoints(rowsNow(), x, y);
  if (!pts.length) {
    selection.cells = new SvelteSet();
    return;
  }
  setSelection(pts);
}

/** Every cell of one character on the frame being drawn, connected or not —
 *  the scattered highlight a shape click cannot reach. Nothing for empty, the
 *  way a click on nothing selects nothing. */
export function selectColour(ch: string) {
  dropFloat();
  const pts = charPoints(rowsNow(), ch);
  if (!pts.length) {
    selection.cells = new SvelteSet();
    return;
  }
  setSelection(pts);
}

export const selectColourAt = (x: number, y: number) =>
  selectColour(rowsNow()[y]?.[x] ?? TRANSPARENT);

export function selectBox(
  from: { x: number; y: number },
  to: { x: number; y: number },
  opaqueOnly = false,
) {
  dropFloat();
  const rows = rowsNow();
  const pts = rectPoints(from.x, from.y, to.x, to.y, true).filter(
    ([x, y]) => !opaqueOnly || (rows[y]?.[x] ?? TRANSPARENT) !== TRANSPARENT,
  );
  setSelection(pts);
}

export function selectAll() {
  dropFloat();
  const { w, h } = activeNode();
  setSelection(rectPoints(0, 0, w - 1, h - 1, true));
}

export function clearSelection() {
  dropFloat();
  selection.cells = new SvelteSet();
}

/**
 * Let go of the block being moved, and bake it. The pixels are already in the
 * frame either way — the float only holds the frame to re-stamp onto, so the
 * NEXT step can move the block again without stacking a fresh undo entry per
 * pixel of travel, and (after a paste) without the first step having eaten what
 * it landed on.
 *
 * Which is why this is the moment a paste stops being undoable by moving it:
 * deselect, select something else, or draw, and what it covered is gone.
 */
export function dropFloat() {
  float = null;
  floating.on = false;
}

/** Bake a floating paste where it sits, and stop saying so. The marquee stays:
 *  letting go of the float is not letting go of what is selected. */
export const dropPaste = dropFloat;

/**
 * The gesture in progress on the canvas, if any, and how to abandon it.
 *
 * Registered by the canvas while a marquee, stroke or part-drag is live, so the
 * app-level Escape can abort a drag without owning its state. First rung of the
 * Escape ladder: abort the drag → cancel the float → deselect.
 */
export const gesture = $state({ abort: null as (() => void) | null });
