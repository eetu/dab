// Sprites made here and never saved: each stays in the sprites list as a draft until it is
// saved or discarded. The open one is live in the editor; the rest are kept as they were left,
// so moving to another sprite loses nothing and asks nothing.

import { cloneSprite, type SpriteFile } from "dab-core";

import { editor } from "./editor.svelte";

/** A draft: its id (its name can change), the sprite as last left, and whether it has been
 *  drawn on since it was made, which is when discarding it asks first. */
export type Draft = { id: string; sprite: SpriteFile; changed: boolean };

/** The drafts, and which was opened into which document (`editor.opened`): one is open only
 *  while that document is the one in hand, so a document loaded any other way closes it rather
 *  than writing over it. */
export const drafts = $state({ list: [] as Draft[], open: null as string | null, at: -1 });

let made = 0;

/** The draft open in the editor, if the open document is one. */
export const openDraft = (): Draft | null =>
  drafts.at === editor.opened ? (drafts.list.find((d) => d.id === drafts.open) ?? null) : null;

export const openId = (): string | null => openDraft()?.id ?? null;

/** Draft `id` is the document just loaded. */
export function markOpen(id: string) {
  drafts.open = id;
  drafts.at = editor.opened;
}

/** Whether `d` has anything to lose: the open one as the editor has it now. */
export const draftChanged = (d: Draft): boolean => d.changed || (d.id === openId() && editor.dirty);

/** The open document, just made, taken in as a draft. */
export function beginDraft(changed = false) {
  const id = `${Date.now().toString(36)}-${made++}`;
  drafts.list.push({ id, sprite: cloneSprite(editor.sprite), changed });
  markOpen(id);
}

/** The open draft's copy brought up to date and set aside: before another document opens. */
export function keepOpenDraft() {
  const d = openDraft();
  if (d) {
    d.sprite = cloneSprite(editor.sprite);
    d.changed = draftChanged(d);
  }
  drafts.open = null;
}

/** A draft gone: saved to a file, or discarded. */
export function dropDraft(id: string) {
  drafts.list = drafts.list.filter((d) => d.id !== id);
  if (drafts.open === id) drafts.open = null;
}

/** The drafts as they stand, the open one as the editor has it: what a reload brings back. */
export const draftsNow = (): Draft[] => {
  const open = openId();
  return drafts.list.map((d) =>
    d.id === open ? { ...d, sprite: editor.sprite, changed: draftChanged(d) } : d,
  );
};
