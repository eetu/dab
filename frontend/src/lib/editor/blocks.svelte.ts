import {
  allCells,
  type Flip,
  flipRows,
  readStamp,
  setPixels,
  stampCells,
  stampRows,
  TRANSPARENT,
} from "dab-core";
import { SvelteSet } from "svelte/reactivity";

import { commit, commitNode, undoEdit } from "./history.svelte";
import {
  clipboard,
  dropFloat,
  floating,
  hasSelection,
  heldFloat,
  holdFloat,
  selection,
  setSelection,
} from "./selection.svelte";
import { editor } from "./state.svelte";
import { activeNode, blocked, frameNow, rowsNow, withFrame } from "./tree.svelte";

// What is done WITH a selection: move, wipe, copy, cut, paste, flip. Apart from
// selection.svelte.ts because undo has to let go of a float — so the selection
// sits below history, and the verbs that commit sit above it.

/**
 * Take a floating paste back out — what Escape means while one floats.
 *
 * The paste and every shove of it are one undo entry, so cancelling IS undo,
 * plus letting go of the marquee that was tracking it. This is what makes
 * Escape mean CANCEL on both floating states (a turn, a paste) instead of
 * quietly baking one and cancelling the other.
 */
export function cancelPaste() {
  if (!floating.on) return;
  dropFloat();
  undoEdit();
  selection.cells = new SvelteSet();
}

/**
 * Shift the selection by a whole number of cells. The first call in a run lifts
 * and takes the single undo snapshot; the rest ride on it. A pasted block
 * arrives already floating, over a base that still has everything it covers.
 */
export function nudgeSelection(dx: number, dy: number) {
  if (!hasSelection() || blocked() || (dx === 0 && dy === 0)) return;
  let float = heldFloat();
  // A float lifted on another frame is baked there; this frame lifts its own.
  if (float && float.frame !== frameNow()) {
    dropFloat();
    float = null;
  }
  const rows = rowsNow();
  if (!float) {
    const pts = [...selection.cells].map((k) => k.split(",").map(Number) as [number, number]);
    const stamp = readStamp(rows, pts);
    const base = setPixels(rows, pts, TRANSPARENT);
    commit(withFrame(base));
    float = holdFloat({ stamp, base, x: selection.x0, y: selection.y0, frame: frameNow() });
  }
  float.x += dx;
  float.y += dy;
  editor.sprite = withFrame(stampCells(float.base, float.stamp, float.x, float.y));
  editor.dirty = true;
  // The marquee travels with the pixels.
  const moved = [...selection.cells].map((k) => {
    const [x, y] = k.split(",").map(Number);
    return [x + dx, y + dy] as [number, number];
  });
  const flash = selection.flash;
  setSelection(moved);
  selection.flash = flash; // a move is not a fresh pick; don't re-flash it
}

/** Wipe the selected cells. */
export function deleteSelection() {
  if (!hasSelection() || blocked()) return;
  dropFloat();
  const rows = rowsNow();
  const pts = [...selection.cells].map((k) => k.split(",").map(Number) as [number, number]);
  const next = setPixels(rows, pts, TRANSPARENT);
  if (next !== rows) commit(withFrame(next));
}

/** What copy and cut take: the selection, or the whole frame when nothing is
 *  selected — copying the last frame onto the next is the commonest copy in an
 *  animation, and it should not need ⌘A first. */
function copyTarget(): { pts: [number, number][]; what: string } {
  if (hasSelection()) {
    const pts = [...selection.cells].map((k) => k.split(",").map(Number) as [number, number]);
    return { pts, what: `${selection.x1 - selection.x0 + 1}×${selection.y1 - selection.y0 + 1}` };
  }
  const { w, h } = activeNode();
  return { pts: allCells(w, h), what: `frame ${frameNow() + 1}` };
}

/** Copy the selection, or the whole frame. False when there was nothing to take:
 *  stamps are matte, so a block of nothing would paste as nothing. */
export function copySelection(): boolean {
  const { pts, what } = copyTarget();
  const rows = rowsNow();
  if (pts.every(([x, y]) => (rows[y]?.[x] ?? TRANSPARENT) === TRANSPARENT)) {
    editor.status = `nothing to copy — ${hasSelection() ? "the selection" : what} is empty`;
    editor.statusBad = true;
    return false;
  }
  clipboard.stamp = readStamp(rows, pts);
  clipboard.x = Math.min(...pts.map(([x]) => x));
  clipboard.y = Math.min(...pts.map(([, y]) => y));
  editor.status = `copied ${what}`;
  editor.statusBad = false;
  return true;
}

/** Copy, then wipe what was copied — the selection, or the whole frame. */
export function cutSelection() {
  if (blocked()) return;
  const { pts, what } = copyTarget();
  if (!copySelection()) return;
  dropFloat();
  const rows = rowsNow();
  commit(withFrame(setPixels(rows, pts, TRANSPARENT)));
  editor.status = `cut ${what}`;
}

/**
 * Put the clipboard down at the top-left of the current selection, or where it
 * was copied from if nothing is selected, and select it — so a paste lands ready
 * to be dragged into place.
 *
 * A paste FLOATS: the frame it lands on is kept as the float's base, so nudging
 * it puts back whatever it was covering a step ago. The pixels underneath are
 * only really gone once the float is dropped — deselect, select something else,
 * or draw. That is the floating selection every editor with a marquee has, and
 * it is what makes "land it, then shove it into place" safe: what you dragged
 * over is not yours and must survive being passed over.
 *
 * Moving your OWN selection is different and stays a lift: those pixels were
 * picked up, so the hole they leave is the point.
 */
export function pasteClipboard(at?: { x: number; y: number }) {
  const stamp = clipboard.stamp;
  if (!stamp?.cells.length || blocked()) return;
  dropFloat();
  const x = at?.x ?? (hasSelection() ? selection.x0 : clipboard.x);
  const y = at?.y ?? (hasSelection() ? selection.y0 : clipboard.y);
  const rows = rowsNow();
  // One undo entry covers the paste and wherever it is shoved to afterwards.
  commit(withFrame(stampCells(rows, stamp, x, y)));
  holdFloat({ stamp, base: rows, x, y, frame: frameNow() });
  floating.on = true;
  floating.frame = frameNow();
  setSelection(stamp.cells.map((c) => [x + c.dx, y + c.dy] as [number, number]));
}

// ---------- flip ----------

/**
 * Mirror the selection in place, floating the result the way a MOVE floats:
 * these are your own pixels over their own hole, so there is nothing under
 * them to lose — the flip can be shoved into place on the same undo entry,
 * and one undo takes the whole thing back.
 *
 * The one transform the format calls free, finally applicable to pixels: it was
 * draw-time only (a part's `flip`), so the editor could MIRROR a wheel forever
 * and never flip the drawing of one.
 */
export function flipSelection(dir: Flip) {
  if (!hasSelection() || blocked()) return;
  dropFloat();
  const rows = rowsNow();
  const pts = [...selection.cells].map((k) => k.split(",").map(Number) as [number, number]);
  const stamp = readStamp(rows, pts);
  const flipped = readStamp(flipRows(stampRows(stamp), dir), allCells(stamp.w, stamp.h));
  const base = setPixels(rows, pts, TRANSPARENT);
  const x = selection.x0;
  const y = selection.y0;
  commit(withFrame(stampCells(base, flipped, x, y)));
  holdFloat({ stamp: flipped, base, x, y, frame: frameNow() });
  setSelection(
    flipped.cells
      .filter((c) => c.ch !== TRANSPARENT)
      .map((c) => [x + c.dx, y + c.dy] as [number, number]),
  );
}

/**
 * Mirror every frame of the node being edited.
 *
 * Refused when the node carries parts: their placements would stay put while
 * the pixels under them mirrored, which is the subtree arithmetic this repo
 * keeps out of scope — the parts are flipped one by one instead.
 */
export function flipNode(dir: Flip): boolean {
  const node = activeNode();
  if (node.parts?.length) return false;
  commitNode((n) => ({ ...n, frames: n.frames.map((f) => flipRows(f, dir)) }));
  return true;
}
