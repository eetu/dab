import {
  ellipsePoints,
  floodPoints,
  linePoints,
  rectPoints,
  setPixels,
  TRANSPARENT,
} from "dab-core";

import { commit } from "./history.svelte";
import { clearSelection, dropFloat } from "./selection.svelte";
import { editor, type Tool } from "./state.svelte";
import { blocked, rowsNow, withFrame } from "./tree.svelte";
import { turning } from "./turn.svelte";

/** What a tool paints with — the eraser is a pencil loaded with transparent. */
const inkFor = (tool: Tool): string => (tool === "eraser" ? TRANSPARENT : editor.ink);

/** The pixels a drag would paint, for the live preview and for the commit. */
export function strokePoints(
  tool: Tool,
  from: { x: number; y: number },
  to: { x: number; y: number },
  filled: boolean,
): [number, number][] {
  switch (tool) {
    case "line":
      return linePoints(from.x, from.y, to.x, to.y);
    case "rect":
      return rectPoints(from.x, from.y, to.x, to.y, filled);
    case "ellipse":
      return ellipsePoints(from.x, from.y, to.x, to.y, filled);
    default:
      return linePoints(from.x, from.y, to.x, to.y);
  }
}

/**
 * Paint a stroke. `fresh` starts a new undo step; the rest of a drag folds into
 * it, so dragging the pencil across the sprite is one undo and not two hundred.
 */
export function paint(points: Iterable<readonly [number, number]>, fresh: boolean) {
  if (blocked()) return;
  // Drawing lets go of a floating block. Keeping the float would leave the next
  // nudge stamping onto a base taken before the stroke, which would put back
  // what was under it and rub the stroke out.
  if (fresh) dropFloat();
  const rows = rowsNow();
  const next = setPixels(rows, points, inkFor(editor.tool));
  if (next === rows) return;
  if (fresh) commit(withFrame(next));
  else {
    editor.sprite = withFrame(next);
    editor.dirty = true;
  }
}

export function fillAt(x: number, y: number) {
  const rows = rowsNow();
  paint(floodPoints(rows, x, y), true);
}

export function pickAt(x: number, y: number) {
  const ch = rowsNow()?.[y]?.[x];
  if (ch) editor.ink = ch;
}

/**
 * Arm a tool. Leaving Select lets go of the selection, baking a floating paste
 * the way any other "doing something else" does: a marquee left behind under
 * the pencil is state nobody is looking at, and the arrows and ⌫ would still
 * answer to it. The other half is in `setSelection` — anything that selects
 * arms Select — so a selection and the select tool always come together.
 *
 * Inert during a turn: the mode owns the selection it is turning.
 */
export function setTool(tool: Tool) {
  if (turning.on) return;
  if (tool !== "select") clearSelection();
  editor.tool = tool;
}
