import { blankSprite, isPartRef, nodeAt, type SpriteFile, TRANSPARENT } from "dab-core";
import { SvelteSet } from "svelte/reactivity";

import { closeMenu } from "../menu.svelte";
import { commit, resetHistory } from "./history.svelte";
import { endPerspective } from "./perspective.svelte";
import { dropFloat, selection } from "./selection.svelte";
import { editor } from "./state.svelte";
import { allNodes, partAt, pathKey, resolvePart } from "./tree.svelte";
import { endTurn } from "./turn.svelte";

// Opening a document, and pointing the tools at a node in it. Both end every
// state measured in the old terms — the turn, the float, the selection.

export function loadSprite(sprite: SpriteFile, file: string | null) {
  // Opening another document abandons a turn in flight. Left running, its source
  // is still the OLD sprite, and the next touch of the dial would replace what
  // was just opened with a rotated copy of what was closed. A menu describes a
  // moment, and that moment is over too.
  endTurn();
  endPerspective();
  dropFloat();
  closeMenu();
  // Per-document view state resets WITH the document. These used to survive, so
  // opening sprite B carried sprite A's variant and animation name over — and the
  // preview badge could name an animation the new sprite never had.
  editor.variant = null;
  editor.animation = null;
  editor.playing = false;
  editor.playhead = 0;
  editor.sprite = sprite;
  editor.file = file;
  editor.frame = 0;
  editor.path = [];
  editor.shown = {};
  editor.hidden = {};
  editor.picked = [];
  editor.dirty = false;
  editor.ink = Object.keys(sprite.palette)[0] ?? TRANSPARENT;
  selection.cells = new SvelteSet();
  resetHistory();
}

/**
 * Point the tools at another node.
 *
 * Everything that is measured in the old node's terms has to move with it: the
 * frame index is clamped to a strip that may be shorter, the selection is a set
 * of cells in the old node's grid, and the ink is a character in the old node's
 * palette — parts keep their own, so a `B` on the body and a `B` on the door are
 * not the same colour.
 */
export function selectNode(path: readonly string[]) {
  // A borrowed part has no body to enter, but it is still a thing you can pick
  // up: moved, mirrored, reordered, removed. Selecting and drawing-on are two
  // different questions, and only the second one it has to answer no to.
  const part = path.length ? partAt(path) : null;
  const node =
    path.length && part && isPartRef(part) ? resolvePart(part.use) : nodeAt(editor.sprite, path);
  if (!node && !(part && isPartRef(part))) return;
  endPerspective();
  dropFloat();
  selection.cells = new SvelteSet();
  editor.path = [...path];
  editor.picked = path.length && partAt(path) ? [pathKey(path)] : [];
  if (!node) return;
  editor.frame = Math.min(editor.frame, node.frames.length - 1);
  if (editor.ink !== TRANSPARENT && !(editor.ink in node.palette)) {
    editor.ink = Object.keys(node.palette)[0] ?? TRANSPARENT;
  }
}

/**
 * Add a part to the picked set, or take it out — shift-click, as in any list.
 * The one added is selected, since the tools have to point somewhere; taking
 * out the selected one hands that to the last of the rest.
 */
export function pickNode(path: readonly string[]) {
  if (!path.length || !partAt(path)) return selectNode(path);
  const key = pathKey(path);
  const rest = editor.picked.filter((k) => k !== key);
  if (rest.length === editor.picked.length) {
    selectNode(path);
    editor.picked = [...rest, key];
  } else if (rest.length) {
    selectNode(rest[rest.length - 1].split("/"));
    editor.picked = rest;
  }
}

/** Pick every part, at every depth, and select the first. */
export function pickAllParts() {
  const keys = allNodes()
    .flatMap(({ node, path }) => (node.parts ?? []).map((p) => pathKey([...path, p.name])))
    .filter((k) => partAt(k.split("/")));
  if (!keys.length) return;
  selectNode(keys[0].split("/"));
  editor.picked = keys;
}

export function newSprite(name: string, w: number, h: number) {
  loadSprite(blankSprite(name, w, h), null);
}

export function rename(name: string) {
  if (!name || name === editor.sprite.name) return;
  commit({ ...editor.sprite, name });
}
