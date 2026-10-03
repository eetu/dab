import {
  addFrame as addFrameTo,
  duplicateFrame as duplicateFrameIn,
  moveFrame as moveFrameIn,
  removeFrame as removeFrameFrom,
} from "dab-core";

import { commitShared, settle } from "./history.svelte";
import { editor } from "./state.svelte";
import { activeNode, frameNow } from "./tree.svelte";

// Each takes the frame to act on, defaulting to the one being edited: the
// header buttons act on "this frame", a thumbnail's menu on the one under the
// cursor, and both are the same verb.
/**
 * A new frame, and the cursor moves onto it.
 *
 * Adding a frame and staying on the old one is a click that appears to do
 * nothing — and worse after Duplicate, where the copy is identical to what you
 * are still looking at, so the strip grew and the canvas did not change. The
 * next thing anyone does with a new frame is draw on it.
 */
export const addFrame = (at: number = frameNow()) => {
  commitShared((n) => addFrameTo(n, at));
  editor.frame = Math.min(at + 1, activeNode().frames.length - 1);
};
export const duplicateFrame = (at: number = frameNow()) => {
  commitShared((n) => duplicateFrameIn(n, at));
  editor.frame = Math.min(at + 1, activeNode().frames.length - 1);
};
export function removeFrame(at: number = frameNow()) {
  if (activeNode().frames.length <= 1) return;
  commitShared((n) => removeFrameFrom(n, at));
  settle();
}
export function moveFrame(from: number, to: number) {
  const node = activeNode();
  if (from === to || to < 0 || to >= node.frames.length) return;
  commitShared((n) => moveFrameIn(n, from, to));
  editor.frame = to;
}
