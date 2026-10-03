import { cloneSprite, nodeAt, type SpriteBody, type SpriteFile, withNode } from "dab-core";

import { dropFloat } from "./selection.svelte";
import { editor } from "./state.svelte";
import { activeNode, blocked, partAt, sharedPath } from "./tree.svelte";

// The undo stack, and the commit every edit goes through.
//
// Undo holds whole sprites rather than inverse operations. A sprite is a
// handful of strings — the biggest one in the repo is 72×18 — so a hundred of
// them costs less than the machinery for undoing a flood fill correctly, and
// nothing can drift out of sync with the document.

const MAX_UNDO = 200;

let undo: SpriteFile[] = [];
let redo: SpriteFile[] = [];

export const canUndo = () => undo.length > 0;
export const canRedo = () => redo.length > 0;
/** Rune-visible counts, so the toolbar's disabled state actually updates. */
export const history = $state({ undo: 0, redo: 0 });

const syncHistory = () => {
  history.undo = undo.length;
  history.redo = redo.length;
};

/** A new document starts with nothing behind it. */
export function resetHistory() {
  undo = [];
  redo = [];
  syncHistory();
}

/** Snapshot before a change. Every mutation in the editor goes through this. */
export function commit(next: SpriteFile) {
  commitOver(cloneSprite(editor.sprite), next);
}

/**
 * Land on `next`, with `was` as what undo goes back to.
 *
 * For a mode that has been previewing uncommitted states — rotation redraws the
 * document at every angle — where the state to take back is the one from before
 * the mode opened, not the last thing shown.
 */
export function commitOver(was: SpriteFile, next: SpriteFile) {
  // A successful edit retires whatever the status bar was still saying — a
  // message describes a moment, and this is a new one.
  editor.status = "";
  editor.statusBad = false;
  undo.push(was);
  if (undo.length > MAX_UNDO) undo = undo.slice(-MAX_UNDO);
  redo = [];
  editor.sprite = next;
  editor.dirty = true;
  syncHistory();
}

/** Commit a change to the ACTIVE node — the shape almost every edit takes. */
export const commitNode = (fn: (node: SpriteBody) => SpriteBody) => {
  // withNode is already a no-op on a borrowed path, which would make every
  // palette and frame edit quietly do nothing. Say so instead.
  if (blocked()) return;
  commit(withNode(editor.sprite, editor.path, fn));
};

/** Commit a frame or animation edit: to the sprite when a level is being
 *  drawn, since a level has the sprite's frames in step and its animations. */
export const commitShared = (fn: (node: SpriteBody) => SpriteBody) => {
  if (blocked()) return;
  commit(withNode(editor.sprite, sharedPath(), fn));
};

/**
 * Put the cursor somewhere that still exists.
 *
 * Undo can take back the part that is being edited, and a frame operation can
 * shorten the strip under the frame index. Both leave the editor pointed at
 * nothing, which draws as an empty canvas that looks like lost work.
 */
export function settle() {
  while (editor.path.length && !nodeAt(editor.sprite, editor.path)) editor.path.pop();
  editor.frame = Math.max(0, Math.min(editor.frame, activeNode().frames.length - 1));
  // Shown/hidden are keyed by part NAME, and undo cannot replay the key rewrite
  // a rename did beside its snapshot — so after undo the map can hold keys no
  // part answers to. Orphans are dropped: a stale key is worse than a lost
  // toggle, because it comes back to life on the next part given that name.
  for (const key of Object.keys(editor.shown)) {
    if (key && !nodeAt(editor.sprite, key.split("/"))) delete editor.shown[key];
  }
  for (const key of Object.keys(editor.hidden)) {
    if (key && !nodeAt(editor.sprite, key.split("/"))) delete editor.hidden[key];
  }
  // A frame operation can remap a animation out of existence while the preview is
  // showing it — the badge would keep naming an animation the node no longer has.
  if (editor.animation && !activeNode().animations?.[editor.animation]) editor.animation = null;
  editor.picked = editor.picked.filter((k) => partAt(k.split("/")));
}

export function undoEdit() {
  const prev = undo.pop();
  if (!prev) return;
  // A float re-stamps its base on the next nudge, and that base is from before
  // the undo — keeping it would quietly put back what was just taken back.
  dropFloat();
  redo.push(cloneSprite(editor.sprite));
  editor.sprite = prev;
  editor.dirty = true;
  settle();
  syncHistory();
}

export function redoEdit() {
  const next = redo.pop();
  if (!next) return;
  dropFloat();
  undo.push(cloneSprite(editor.sprite));
  editor.sprite = next;
  editor.dirty = true;
  settle();
  syncHistory();
}
