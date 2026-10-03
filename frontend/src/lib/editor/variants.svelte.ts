import { isPartRef, type SpriteBody, withNode } from "dab-core";

import { commitNode } from "./history.svelte";
import { editor } from "./state.svelte";
import { activeNode, blocked } from "./tree.svelte";

// A variant is alternate colours for some of the palette's characters, so one
// drawing can be recoloured without being redrawn. It overrides what it names and
// inherits the rest — which is why recolouring a two-tone sign means naming two
// colours, not repainting it.

/** Replace the whole variant map, dropping it entirely when it empties. */
function setVariants(variants: Record<string, Record<string, string>>) {
  const names = Object.keys(variants);
  commitNode((n) => ({ ...n, variants: names.length ? variants : undefined }));
  // Keep the preview on something that still exists. A variant name is matched
  // across nodes, so this only clears when the ACTIVE node was the last to have
  // it — another part may still be drawn in a colourway of the same name.
  if (editor.variant && !names.includes(editor.variant) && !anyNodeHasVariant(editor.variant)) {
    editor.variant = null;
  }
}

/** Whether anything in the assembly still offers a look by this name. */
function anyNodeHasVariant(name: string): boolean {
  const walk = (n: SpriteBody): boolean =>
    !!n.variants?.[name] || (n.parts ?? []).some((p) => !isPartRef(p) && walk(p));
  return walk(editor.sprite);
}

/** Start a variant from the palette as it stands, so it can be edited down to
 *  the few characters that actually differ. */
export function addVariant(name: string) {
  const key = name.trim();
  const node = activeNode();
  if (!key || node.variants?.[key]) return;
  setVariants({ ...(node.variants ?? {}), [key]: { ...node.palette } });
  editor.variant = key;
}

export function renameVariant(from: string, to: string) {
  const key = to.trim();
  const existing = activeNode().variants;
  if (!key || !existing?.[from] || existing[key]) return;
  // Read the selection BEFORE the write: setVariants drops a selection whose name
  // has gone, and under a rename the old name always has.
  const wasShowing = editor.variant === from;
  // Rebuilt in order rather than deleted and re-added: the map's order is the
  // order the editor and a consumer list them in.
  setVariants(
    Object.fromEntries(Object.entries(existing).map(([k, v]) => (k === from ? [key, v] : [k, v]))),
  );
  if (wasShowing) editor.variant = key;
}

export function removeVariant(name: string) {
  const existing = activeNode().variants;
  if (!existing?.[name]) return;
  setVariants(Object.fromEntries(Object.entries(existing).filter(([k]) => k !== name)));
}

/** A copy to diverge from — the usual way a third colourway starts is as a
 *  tweak to the second. */
export function duplicateVariant(name: string) {
  const existing = activeNode().variants;
  const source = existing?.[name];
  if (!source) return;
  let copy = `${name} 2`;
  for (let i = 3; existing[copy]; i++) copy = `${name} ${i}`;
  setVariants({ ...existing, [copy]: { ...source } });
  editor.variant = copy;
}

/** Set one character's colour inside a variant. `fresh` as in `setColour`: the
 *  native colour input streams values through a sweep, and only the first may
 *  open an undo entry. */
export function setVariantColour(name: string, ch: string, hex: string, fresh = true) {
  const existing = activeNode().variants?.[name];
  if (!existing) return;
  const next = { ...activeNode().variants, [name]: { ...existing, [ch]: hex } };
  if (fresh) return setVariants(next);
  if (blocked()) return;
  editor.sprite = withNode(editor.sprite, editor.path, (n) => ({ ...n, variants: next }));
  editor.dirty = true;
}

/** Drop a character from a variant, so it falls back to the palette's colour. */
export function clearVariantColour(name: string, ch: string) {
  const existing = activeNode().variants?.[name];
  if (!existing || !(ch in existing)) return;
  const next = { ...existing };
  delete next[ch];
  setVariants({ ...activeNode().variants, [name]: next });
}
