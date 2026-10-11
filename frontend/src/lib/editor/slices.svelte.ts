import {
  addSlice as addSliceTo,
  removeSlice as removeSliceFrom,
  renameSlice as renameSliceIn,
  sliceOf,
  slicePath,
  stackSlices as stackSlicesIn,
} from "dab-core";

import { commit, settle } from "./history.svelte";
import { editor } from "./state.svelte";

// Slices: the sprite in depth — core's format.ts says what one is. A new one is a copy of the
// one in front of it, drawn over from there; a slice is reached like a node, `["#1"]`, so every
// tool works on it unchanged.

/** A slice right behind slice `after` (0 the front, the sprite's own grid), a copy of it,
 *  and drawn on next. */
export function addSlice(after = editor.sprite.slices?.length ?? 0) {
  commit(addSliceTo(editor.sprite, after));
  editor.path = slicePath(after + 1);
  editor.status = `slice ${after + 1} — a copy of the one in front, to draw over`;
}

/** Slice `n` called `to`; an empty name takes it off and it is `#n` again. */
export function renameSlice(n: number, to: string) {
  const next = renameSliceIn(editor.sprite, n, to);
  if (next === editor.sprite) return;
  commit(next);
}

/** Its slices going `way` from its grid: back from the front, or down from the top. */
export function stackSlices(way: "back" | "down") {
  const next = stackSlicesIn(editor.sprite, way);
  if (next === editor.sprite) return;
  commit(next);
  editor.status =
    way === "down"
      ? "the grid the top, each slice a voxel lower"
      : "the grid the front, each slice a voxel further back";
}

/** Slice `n` taken out; drawing on it, the front is drawn on next. */
export function removeSlice(n: number) {
  const next = removeSliceFrom(editor.sprite, n);
  if (next === editor.sprite) return;
  commit(next);
  if (sliceOf(editor.path) !== null) editor.path = [];
  settle();
}
