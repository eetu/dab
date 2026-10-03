import { animationFrames, type SpriteBody } from "dab-core";

import { cycleShowing } from "./cycles.svelte";
import { commitShared } from "./history.svelte";
import { editor } from "./state.svelte";
import { activeNode, frameNow } from "./tree.svelte";

// An animation is a named run of frame indices on one node. A strip that is an
// animation in one place and a set of states in another can then say which is
// which, and a consumer can ask for "swing" instead of remembering that the door
// opens over frames 0 to 2.

/** The frames the play head walks: the selected animation, or the whole strip. */
export const animationRun = (node: SpriteBody = activeNode()): number[] =>
  (editor.animation ? animationFrames(node, editor.animation) : null) ??
  node.frames.map((_, i) => i);

// ---------- playback ----------
//
// The SURFACE plays: the canvas draws the run while the play head walks it, and
// the strip follows. One frame number, derived in one place, so a second window
// cannot be showing a different one — which is what a separate preview pane was
// always one bug away from.

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Steps until everything on screen is back where it started: the run's frames
 *  and the showing cycle's phases, advancing together on the one play head. */
export function playLength(node: SpriteBody = activeNode()): number {
  const frames = animationRun(node).length;
  const phases = cycleShowing()?.phases.length ?? 1;
  return (frames * phases) / gcd(frames, phases);
}

/** Whether there is anything to play: one frame is a picture, not an animation
 *  — unless its colours cycle, which is the point of cycling them. */
export const canPlay = (node: SpriteBody = activeNode()): boolean => playLength(node) > 1;

/** The frame on screen: the play head while playing, the frame being edited
 *  otherwise — so stopping puts you back where you were drawing. */
export function shownFrame(node: SpriteBody = activeNode()): number {
  if (!editor.playing) return editor.frame;
  const run = animationRun(node);
  return run[editor.playhead % run.length] ?? editor.frame;
}

/** Start or stop. Playing is a MODE the surface is in, so it refuses to start
 *  on a single frame rather than running an interval that changes nothing. */
export function setPlaying(on: boolean): void {
  editor.playing = on && canPlay();
  if (!editor.playing) editor.playhead = 0;
}

/** Back to the start of the run. Stopped, that means the frame you are editing
 *  goes back too — otherwise rewind would move a play head nobody can see. */
export function rewind(): void {
  editor.playhead = 0;
  if (!editor.playing) editor.frame = animationRun()[0] ?? 0;
}

function setAnimations(animations: Record<string, number[]>) {
  const names = Object.keys(animations);
  commitShared((n) => ({ ...n, animations: names.length ? animations : undefined }));
  if (editor.animation && !names.includes(editor.animation)) editor.animation = null;
}

/** A new animation starts as the frame you are on — one frame is a state, which is
 *  the commonest kind of animation there is. */
export function addAnimation(name: string) {
  const key = name.trim();
  const node = activeNode();
  if (!key || node.animations?.[key]) return;
  setAnimations({ ...(node.animations ?? {}), [key]: [frameNow()] });
  editor.animation = key;
}

export function renameAnimation(from: string, to: string) {
  const key = to.trim();
  const existing = activeNode().animations;
  if (!key || !existing?.[from] || existing[key]) return;
  const wasPlaying = editor.animation === from;
  // Rebuilt in order rather than deleted and re-added: the map's order is the
  // order the editor and a consumer list them in.
  setAnimations(
    Object.fromEntries(Object.entries(existing).map(([k, v]) => (k === from ? [key, v] : [k, v]))),
  );
  if (wasPlaying) editor.animation = key;
}

export function removeAnimation(name: string) {
  const existing = activeNode().animations;
  if (!existing?.[name]) return;
  setAnimations(Object.fromEntries(Object.entries(existing).filter(([k]) => k !== name)));
}

/** Reorder the animations. The map's order is the file's, and the file's order is
 *  what the editor and every consumer list them in — an edit, not a view. */
export function moveAnimation(name: string, to: number) {
  const entries = Object.entries(activeNode().animations ?? {});
  const from = entries.findIndex(([k]) => k === name);
  if (from < 0 || to < 0 || to >= entries.length || from === to) return;
  const next = [...entries];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  setAnimations(Object.fromEntries(next));
}

/** Replace an animation's run. An empty run drops the animation: a name that plays nothing
 *  is a name that means nothing. */
export function setAnimationFrames(name: string, frames: number[]) {
  const existing = activeNode().animations;
  if (!existing?.[name]) return;
  if (!frames.length) return removeAnimation(name);
  setAnimations({ ...existing, [name]: frames });
}

/** Put a frame at the end of an animation — the one you are on unless said otherwise.
 *  Repeats are legal and mean a hold, so appending twice is how a pause is
 *  written. */
export function appendToAnimation(name: string, at: number = frameNow()) {
  const list = activeNode().animations?.[name];
  if (list) setAnimationFrames(name, [...list, at]);
}
