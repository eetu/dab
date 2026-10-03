import {
  addCycle as addCycleTo,
  type Cycle,
  cyclesOf,
  phaseName,
  removeCycle as removeCycleFrom,
  renameCycle as renameCycleIn,
  reverseCycle as reverseCycleIn,
  type SpriteBody,
} from "dab-core";

import { commitNode } from "./history.svelte";
import { editor } from "./state.svelte";
import { activeNode, allNodes, blocked } from "./tree.svelte";

// Colour cycling: a run of palette entries rotated, written as one variant per
// phase (core's cycles.ts says how). Made here from a run of swatches, and
// played on the play head that walks the frames — one clock, so a cycle and an
// animation step together, the way a consumer that has both will step them.

/**
 * The cycle the canvas is showing: the one `editor.variant` is a phase of.
 *
 * The active node is asked first. A variant name is matched across nodes, so a
 * part can cycle under its body's name, and the node being edited is the one
 * whose phases the panel is about.
 */
export function cycleShowing(): Cycle | null {
  const v = editor.variant;
  if (!v) return null;
  for (const node of [activeNode(), ...allNodes().map((x) => x.node)]) {
    const c = cyclesOf(node).find((x) => x.phases.includes(v));
    if (c) return c;
  }
  return null;
}

/** The variant on screen: while playing, the showing cycle's phase under the
 *  play head, counted from the one picked — so stopping puts back the phase you
 *  were looking at, as it puts back the frame you were drawing. */
export function shownVariant(): string | null {
  const c = editor.playing ? cycleShowing() : null;
  if (!c || !editor.variant) return editor.variant;
  const from = c.phases.indexOf(editor.variant);
  return c.phases[(from + editor.playhead) % c.phases.length];
}

/** Whether any node still offers a look by this name. */
const offered = (variant: string) => allNodes().some(({ node }) => node.variants?.[variant]);

/** A name that says what the cycle turns, until it is given a better one. */
function freshName(node: SpriteBody, chars: string[]): string {
  const base = `cycle ${chars[0]}–${chars[chars.length - 1]}`;
  const taken = (name: string) => chars.some((_, k) => node.variants?.[phaseName(name, k)]);
  let name = base;
  for (let i = 2; taken(name); i++) name = `${base} ${i}`;
  return name;
}

/**
 * Cycle a run of the active node's colours, and show it.
 *
 * Shown on its first phase rather than played: playing is a mode, and the
 * status says P is the way in — the same hand-off a generated turn makes.
 */
export function addCycle(chars: string[]): string | null {
  if (blocked()) return null;
  if (chars.length < 2) {
    editor.status = "a cycle turns two colours or more — shift-click to take a run";
    editor.statusBad = true;
    return null;
  }
  const node = activeNode();
  const name = freshName(node, chars);
  if (addCycleTo(node, name, chars) === node) {
    editor.status = `${chars.join(" ")} cannot cycle — each has to be a colour in this palette, once`;
    editor.statusBad = true;
    return null;
  }
  commitNode((n) => addCycleTo(n, name, chars));
  editor.variant = phaseName(name, 0);
  editor.status = `${name} · ${chars.length} phases — P plays it`;
  return name;
}

export function removeCycle(name: string) {
  commitNode((n) => removeCycleFrom(n, name));
  if (editor.variant && !offered(editor.variant)) editor.variant = null;
}

/** Rename every phase; the one on screen follows, so the view does not drop. */
export function renameCycle(from: string, to: string) {
  const showing = cycleShowing();
  const k = showing?.name === from ? showing.phases.indexOf(editor.variant!) : -1;
  const node = activeNode();
  if (renameCycleIn(node, from, to) === node) return;
  commitNode((n) => renameCycleIn(n, from, to));
  if (k >= 0) editor.variant = phaseName(to.trim(), k);
}

export const reverseCycle = (name: string) => commitNode((n) => reverseCycleIn(n, name));
