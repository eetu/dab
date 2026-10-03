import {
  allCells,
  type Plane,
  type Projected,
  projectRows,
  readStamp,
  stampCells,
  stampRows,
} from "dab-core";

import { closeMenu } from "../menu.svelte";
import { commitNode } from "./history.svelte";
import { clearSelection, clipboard, dropFloat } from "./selection.svelte";
import { editor } from "./state.svelte";
import { activeNode, blocked, frameNow } from "./tree.svelte";
import { turning } from "./turn.svelte";

// The perspective brush: the clipboard laid on a plane and stamped where you
// click — Deluxe Paint's Perspective mode. Core's perspective.ts has the
// geometry; this is the mode around it.
//
// A MODE, as a turn is: it owns the surface while it is up, the tools are inert
// behind it, and the plane is set on a bar over the canvas and an anchor on the
// art. Unlike a turn there is nothing to Apply. Each click is a finished stamp
// and its own undo entry, because stamping a road is twenty clicks and taking
// back the last one should not take back the other nineteen.
//
// Every stamp samples the brush as it was copied, never an earlier stamp —
// which is the pristine-source rule a turn follows, here for free.

export const perspective = $state({
  on: false,
  /** Degrees leaned back: toward 90 a floor, toward −90 a ceiling. */
  tilt: 60,
  /** Degrees swung about the vertical: a wall receding to one side. */
  turn: 0,
  /** Degrees the brush spins on the plane, clockwise. */
  spin: 0,
  /** Eye to anchor, in pixels: near is steep, far is flat. */
  distance: 32,
  /** The anchor, in the ACTIVE node's cells: where the plane is 1:1. */
  x: 0,
  y: 0,
  /** Sub-samples per axis; 1 is crisp and costs no colours. */
  smooth: 1,
  /** The cell under the pointer, set by the canvas — what the preview and the
   *  bar's cost are about. */
  at: null as { x: number; y: number } | null,
});

/** The plane as core takes it. */
export const plane = (): Plane => ({
  tilt: perspective.tilt,
  turn: perspective.turn,
  spin: perspective.spin,
  distance: perspective.distance,
  x: perspective.x,
  y: perspective.y,
});

/** The brush's rows: the clipboard as a solid grid, gaps and all. */
export const brush = (): string[] | null =>
  clipboard.stamp?.cells.length ? stampRows(clipboard.stamp) : null;

/**
 * Pick the brush up. Refused, with the reason, when there is no brush to pick
 * up or nothing to put it down on; the plane keeps the angles it was last left
 * at, and its anchor starts on the middle of the node being drawn.
 */
export function beginPerspective() {
  if (perspective.on || turning.on || blocked()) return;
  if (!brush()) {
    editor.status = "the brush is the clipboard — copy something first";
    editor.statusBad = true;
    return;
  }
  closeMenu();
  dropFloat();
  clearSelection();
  editor.playing = false;
  const node = activeNode();
  perspective.x = node.w / 2;
  perspective.y = node.h / 2;
  perspective.at = null;
  perspective.on = true;
}

/** Change the plane. Angles stop short of edge-on, where there is no plane to
 *  look at, and the eye stays a few pixels off it. */
export function setPlane(next: Partial<Omit<Plane, "x" | "y">> & { smooth?: number }) {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  if (next.tilt !== undefined) perspective.tilt = clamp(Math.round(next.tilt), -85, 85);
  if (next.turn !== undefined) perspective.turn = clamp(Math.round(next.turn), -85, 85);
  if (next.spin !== undefined) perspective.spin = clamp(Math.round(next.spin), -180, 180);
  if (next.distance !== undefined) perspective.distance = clamp(next.distance, 4, 2048);
  if (next.smooth !== undefined) perspective.smooth = clamp(Math.round(next.smooth), 1, 4);
}

/** Move the anchor, in the active node's cells — half-cells, so a brush with an
 *  even side can still be centred on a pixel boundary. */
export function setAnchor(x: number, y: number) {
  perspective.x = Math.round(x * 2) / 2;
  perspective.y = Math.round(y * 2) / 2;
}

/**
 * The brush as it would land on the cell, or null where there is no plane —
 * the cell's line of sight at or past the horizon, or the brush too near the
 * eye to draw. Centred on the cell, so at the anchor of a facing plane a stamp
 * is a paste.
 */
export function perspectiveAt(cell: { x: number; y: number }): Projected | null {
  const rows = brush();
  if (!perspective.on || !rows) return null;
  const w = rows[0].length;
  const h = rows.length;
  const at = { x: cell.x + (w % 2) / 2, y: cell.y + (h % 2) / 2 };
  return projectRows(rows, activeNode().palette, plane(), at, { samples: perspective.smooth });
}

/** Put the brush down on the cell: one stamp, one undo entry. Its gaps are
 *  gaps, as a paste's are, and the blends it needed join the palette. */
export function stampPerspective(cell: { x: number; y: number }) {
  const r = perspectiveAt(cell);
  if (!r) {
    editor.status = "past the horizon — there is no plane there to stamp on";
    editor.statusBad = true;
    return;
  }
  // Far enough off, the brush is thinner than a pixel and falls between the
  // pixel centres a crisp stamp samples at. Say so, rather than commit an undo
  // entry that changed nothing.
  if (r.rows.every((row) => !/[^.]/.test(row))) {
    editor.status = "the brush is under a pixel there — nearer, or smooth it";
    editor.statusBad = true;
    return;
  }
  const at = frameNow();
  const stamp = readStamp(r.rows, allCells(r.w, r.h));
  commitNode((n) => ({
    ...n,
    palette: r.palette,
    frames: n.frames.map((f, i) => (i === at ? stampCells(f, stamp, r.x, r.y) : f)),
  }));
  if (r.added.length) {
    editor.status = `+${r.added.length} colour${r.added.length > 1 ? "s" : ""}`;
    editor.statusBad = false;
  }
}

/** Put the brush away. The stamps are already in the document. */
export function endPerspective() {
  perspective.on = false;
  perspective.at = null;
}
