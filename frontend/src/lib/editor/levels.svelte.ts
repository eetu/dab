import {
  addLevel as addLevelTo,
  deriveLevel,
  flattenSprite,
  levelOf,
  levelPath,
  removeLevel as removeLevelFrom,
  renameLevel as renameLevelIn,
  type SpriteBody,
} from "dab-core";

import { commit, settle } from "./history.svelte";
import { editor } from "./state.svelte";
import { resolvePart, stageNode } from "./tree.svelte";

// Levels of detail: the sprite drawn again at other sizes — core's levels.ts
// says what one is. Made here by deriving from the size you are on, and drawn
// over from there; a level is reached like a node, `["@far"]`, so every tool
// works on it unchanged.

/**
 * What a new level starts from: the level on screen, or the sprite. A sprite
 * with parts is flattened first — a level stands for the whole subject, and the
 * deer across the field has its antlers on.
 */
function source(): SpriteBody {
  const node = stageNode();
  if (!node.parts?.length) return node;
  const flat = flattenSprite(node, { resolve: resolvePart });
  return { w: flat.w, h: flat.h, palette: flat.palette, frames: flat.frames };
}

/** Add a level at `w × h`, derived from the size on screen. Returns its name,
 *  or null — with the reason said — when the name is taken or unusable. */
export function addLevel(name: string, w: number, h: number): string | null {
  const key = name.trim();
  const next = addLevelTo(editor.sprite, deriveLevel(source(), key, Math.round(w), Math.round(h)));
  if (next === editor.sprite) {
    editor.status = key ? `there is already a level called ${key}` : "a level needs a name";
    editor.statusBad = true;
    return null;
  }
  commit(next);
  editor.status = `${key} · ${Math.round(w)}×${Math.round(h)} — derived, to draw over`;
  return key;
}

export function removeLevel(name: string) {
  const next = removeLevelFrom(editor.sprite, name);
  if (next === editor.sprite) return;
  commit(next);
  settle();
}

/** Rename a level, and everything held under its path with it. */
export function renameLevel(from: string, to: string) {
  const next = renameLevelIn(editor.sprite, from, to);
  if (next === editor.sprite) return;
  commit(next);
  const [was, now] = [levelPath(from)[0], levelPath(to.trim())[0]];
  if (editor.shown[was] !== undefined) {
    editor.shown[now] = editor.shown[was];
    delete editor.shown[was];
  }
  if (editor.hidden[was]) {
    editor.hidden[now] = true;
    delete editor.hidden[was];
  }
  if (levelOf(editor.path) === from) editor.path = levelPath(to.trim());
}
