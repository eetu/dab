import {
  addColour as addColourTo,
  addColours as addColoursTo,
  cyclesOf,
  isPaletteKey,
  isPartRef,
  movePaletteChar as movePaletteCharIn,
  type Part,
  refreshCycles,
  removeColour as removeColourFrom,
  renameChar as renameCharIn,
  setColour as setColourIn,
  type SpriteBody,
  type SpriteFile,
  TRANSPARENT,
  unusedChars,
  withNode,
} from "dab-core";

import { commit, commitNode } from "./history.svelte";
import { editor } from "./state.svelte";
import { activeNode, allNodes, blocked, pathKey } from "./tree.svelte";

/**
 * Drop every palette entry no frame uses — one edit, one undo.
 *
 * What this exists for: smooth rotations invent blend colours, and re-rotating
 * an already-rotated part replaces the last spin's blends with new ones. Three
 * spins leave dozens of dimmed entries no pixel answers to, in a palette that
 * only has 69 characters to spend.
 */
export function removeUnusedColours(): number {
  const node = activeNode();
  const dead = unusedChars(node);
  if (!dead.length || blocked()) return 0;
  commitNode((n) =>
    refreshCycles(
      dead.reduce((m, ch) => removeColourFrom(m, ch), n),
      cyclesOf(n),
    ),
  );
  if (dead.includes(editor.ink)) editor.ink = TRANSPARENT;
  return dead.length;
}

export const addColour = (hex: string) => commitNode((n) => addColourTo(n, hex));

/**
 * Colours from a palette file, onto the next free characters — one undo
 * entry, and the count said: what came in, and what did not (already here, or
 * past the last character).
 */
export function importColours(hexes: string[], from: string) {
  if (blocked()) return;
  if (!hexes.length) {
    editor.status = `no colours in ${from}`;
    editor.statusBad = true;
    return;
  }
  const { added, skipped } = addColoursTo(activeNode(), hexes);
  if (added.length) commitNode((n) => addColoursTo(n, hexes).sprite);
  editor.status =
    `+${added.length} colour${added.length === 1 ? "" : "s"} from ${from}` +
    (skipped ? ` — ${skipped} already here or past the last character` : "");
  editor.statusBad = !added.length;
}
export function removeColour(ch: string) {
  commitNode((n) => refreshCycles(removeColourFrom(n, ch), cyclesOf(n)));
  if (editor.ink === ch) editor.ink = TRANSPARENT;
}
/** Set a colour. `fresh` opens the undo entry; a picker drag streams the rest
 *  through it live, so a sweep across a hundred hues is ONE edit — the same
 *  rule a paint stroke follows, and what stops one drag flushing the stack. */
export function setColour(ch: string, hex: string, fresh = true) {
  if (blocked()) return;
  // A cycle holds colours, not references, so its phases follow the edit.
  const edit = (n: SpriteBody) => refreshCycles(setColourIn(n, ch, hex));
  if (fresh) return commitNode(edit);
  editor.sprite = withNode(editor.sprite, editor.path, edit);
  editor.dirty = true;
}

/** Reorder the palette. The order is the file's — what `toJson` writes and what
 *  the swatches list in — so this is an edit, not a view preference. */
export const movePaletteChar = (ch: string, to: number) =>
  commitNode((n) => movePaletteCharIn(n, ch, to));
export function renameChar(from: string, to: string) {
  const node = activeNode();
  if (renameCharIn(node, from, to) === node) {
    if (to !== from && !isPaletteKey(to)) {
      editor.status = `${JSON.stringify(to)} cannot be a key — one printable ASCII character, not .`;
      editor.statusBad = true;
    }
    return;
  }
  commitNode((n) => renameCharIn(n, from, to));
  if (editor.ink === from) editor.ink = to;
}

// ---------- colours across the bundle ----------
//
// Palettes are local to a node, which is what keeps a part independently
// drawable and keeps a cell's colour one line. In the file that is right. While
// DRAWING it is a chore: a body and its doors are painted in the same colours,
// so a colour added to one is wanted by the rest, and adding it by hand to each
// is both tedious and a place for two slightly different reds to appear.
//
// So the sharing lives here, in the tool, as an explicit push and pull rather
// than as inheritance. Nothing about the format changes; what changes is that
// you press a button instead of retyping a hex.

/** Rewrite every node in the tree. `use` parts are left alone: their pixels and
 *  their palette belong to another document. */
function mapNodes(
  node: SpriteBody,
  fn: (n: SpriteBody, path: string[]) => SpriteBody,
  path: string[] = [],
): SpriteBody {
  const self = fn(node, path);
  if (!self.parts?.length) return self;
  return {
    ...self,
    parts: self.parts.map((p) => (isPartRef(p) ? p : (mapNodes(p, fn, [...path, p.name]) as Part))),
  };
}

const labelFor = (path: readonly string[]) =>
  path.length ? path[path.length - 1] : editor.sprite.name;

/** Colours defined somewhere in the bundle that the active node has not got,
 *  with the node they came from. Root first, so the body's red is the one
 *  offered when two nodes disagree. */
export function paletteElsewhere(): { ch: string; hex: string; from: string }[] {
  const me = pathKey(editor.path);
  const mine = activeNode().palette;
  const seen: Record<string, { ch: string; hex: string; from: string }> = {};
  for (const { path, node } of allNodes()) {
    if (pathKey(path) === me) continue;
    for (const [ch, hex] of Object.entries(node.palette)) {
      if (ch in mine || ch in seen) continue;
      seen[ch] = { ch, hex, from: labelFor(path) };
    }
  }
  return Object.values(seen);
}

/** Take every colour the bundle has and this node has not. Additive: what this
 *  node already uses keeps the colour it has, so this is safe to press twice. */
export function adoptFromBundle() {
  const add = paletteElsewhere();
  if (!add.length) return;
  commitNode((n) => ({
    ...n,
    palette: { ...n.palette, ...Object.fromEntries(add.map((c) => [c.ch, c.hex])) },
  }));
}

/** Nodes that would change if this node's `ch` were pushed to all of them —
 *  the ones missing it, and the ones holding a different colour under it. */
export function pushTargets(ch: string): string[] {
  const hex = activeNode().palette[ch];
  const me = pathKey(editor.path);
  if (!hex) return [];
  return allNodes()
    .filter(({ path, node }) => pathKey(path) !== me && node.palette[ch] !== hex)
    .map(({ path }) => labelFor(path));
}

/**
 * Send one colour to every other node: added where it is missing, corrected
 * where it is a different colour under the same character.
 *
 * The answer to "the body has a new red and four parts need it". Correcting as
 * well as adding is the point — a character meaning two colours in one subject
 * is the drift this is here to end, not something to leave behind.
 */
export function pushColour(ch: string) {
  const hex = activeNode().palette[ch];
  const me = pathKey(editor.path);
  if (!hex || !pushTargets(ch).length) return;
  commit(
    mapNodes(editor.sprite, (n, path) =>
      pathKey(path) === me || n.palette[ch] === hex
        ? n
        : refreshCycles({ ...n, palette: { ...n.palette, [ch]: hex } }),
    ) as SpriteFile,
  );
}

/** Every character this node has, pushed at once. */
export function pushPalette() {
  const mine = activeNode().palette;
  const me = pathKey(editor.path);
  const changes = allNodes().some(
    ({ path, node }) =>
      pathKey(path) !== me && Object.entries(mine).some(([ch, hex]) => node.palette[ch] !== hex),
  );
  if (!changes) return;
  commit(
    mapNodes(editor.sprite, (n, path) =>
      pathKey(path) === me ? n : refreshCycles({ ...n, palette: { ...n.palette, ...mine } }),
    ) as SpriteFile,
  );
}

/**
 * Characters that mean one colour here and a different one elsewhere in the
 * bundle.
 *
 * The price of local palettes: `B` can be one red on the body and another on
 * the door with nothing to say so until the two are looked at side by side.
 */
export function clashingChars(): { ch: string; theirs: string; where: string }[] {
  const me = pathKey(editor.path);
  const mine = activeNode().palette;
  const named: Record<string, { ch: string; theirs: string; where: string }> = {};
  for (const { path, node } of allNodes()) {
    if (pathKey(path) === me) continue;
    for (const [ch, hex] of Object.entries(node.palette)) {
      if (ch in named || !mine[ch] || mine[ch] === hex) continue;
      named[ch] = { ch, theirs: hex, where: labelFor(path) };
    }
  }
  return Object.values(named);
}
