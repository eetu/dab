import {
  groupBox,
  isPartRef,
  nodeAt,
  type Part,
  type Placement,
  type SpriteBody,
  type SpriteFile,
  withNode,
} from "dab-core";

import { editor } from "./state.svelte";

// Every operation in the editor is applied to the node at `editor.path` through
// `withNode`, so a tool that knows nothing about parts edits one correctly. The
// only thing the tools gain is the coordinate the canvas hands them, which is
// already in the active node's own pixels.

export const pathKey = (path: readonly string[]): string => path.join("/");

/** The part at the selected path, when it is one that borrows its pixels. */
export function activeRef(): (Placement & { use: string }) | null {
  const part = editor.path.length ? partAt(editor.path) : null;
  return part && isPartRef(part) ? part : null;
}

/**
 * The node whose palette, frames and animations the panels are about.
 *
 * For a borrowed part that is the sprite it borrows — showing its own colours
 * is the truth about what is drawn there, and every operation below refuses to
 * write to it, so a read-only view is safe and a blank one would be a lie.
 */
export function activeNode(): SpriteBody {
  const ref = activeRef();
  if (ref) return resolvePart(ref.use) ?? editor.sprite;
  return nodeAt(editor.sprite, editor.path) ?? editor.sprite;
}

/** Where a node's top-left sits in the sprite's own coordinates. */
export function nodeOrigin(path: readonly string[]): { x: number; y: number } {
  let node: SpriteBody = editor.sprite;
  let x = 0;
  let y = 0;
  for (const name of path) {
    const part = (node.parts ?? []).find((p) => p.name === name);
    if (!part) break;
    x += part.x;
    y += part.y;
    // A borrowed part is a leaf: it sits somewhere, but there is nothing under
    // it to walk into.
    if (isPartRef(part)) break;
    node = part;
  }
  return { x, y };
}

/** The part at a path, and the parent that holds it. */
export function partAt(path: readonly string[]): Part | null {
  if (!path.length) return null;
  const parent = nodeAt(editor.sprite, path.slice(0, -1));
  return parent?.parts?.find((p) => p.name === path[path.length - 1]) ?? null;
}

/** Every sprite in the folder, by name — what a `use` part draws. Kept current
 *  by whoever loaded the folder; core has no folder, so this is the editor's. */
export const sheet = $state({ byName: {} as Record<string, SpriteFile> });
export const resolvePart = (name: string): SpriteFile | null => sheet.byName[name] ?? null;

/** The frame a node shows: the active one follows the frame strip, the rest sit
 *  where they were put. Clamped, because a part's strip is its own length. */
export function frameOf(
  path: readonly string[],
  node: SpriteBody,
  active: number = editor.frame,
): number {
  const want = pathKey(path) === pathKey(editor.path) ? active : (editor.shown[pathKey(path)] ?? 0);
  const i = want === "follow" ? active : want;
  return Math.max(0, Math.min(i, node.frames.length - 1));
}

/** The box the whole assembly fills, in the sprite's coordinates. Negative
 *  offsets and parts past the edge are normal, so this is what frames the view. */
export const stageBox = () => groupBox(editor.sprite, resolvePart);

/**
 * Sprites in the folder with a `use` part naming this one.
 *
 * A rename moves one file and touches nothing else, so renaming a shared part
 * turns every reference to it into a missing one. The editor is the only place
 * that has the whole folder in hand, so it is the only place that can say so —
 * and it warns rather than rewriting, because rewriting other documents from one
 * gesture is the thing this whole design is arranged to avoid.
 */
export function usedBy(name: string): string[] {
  const hits: string[] = [];
  const walk = (n: SpriteBody): boolean =>
    (n.parts ?? []).some((p) => (isPartRef(p) ? p.use === name : walk(p)));
  for (const sprite of Object.values(sheet.byName)) {
    if (sprite.name !== name && walk(sprite)) hits.push(sprite.name);
  }
  return hits.sort();
}

/** The frame of the ACTIVE node the tools are working on. */
export const frameNow = (): number => frameOf(editor.path, activeNode());
export const rowsNow = (): string[] => activeNode().frames[frameNow()];

/** Whether the node the tools point at is one of the hidden ones. Nothing may
 *  write to it: a change you cannot see is a change you did not make on purpose. */
export const activeHidden = (): boolean => !!editor.hidden[pathKey(editor.path)];

/**
 * Whether this node can be drawn on at all, and why not when it cannot.
 *
 * Two reasons, and both have to SAY so rather than swallow the stroke: a
 * hidden node would take a change you could not see, and a borrowed one would
 * take a change into a document that is not open.
 */
export function readOnly(): string | null {
  const ref = activeRef();
  if (ref) return `${editor.path.join("/")} draws ${ref.use} — open that sprite to change it`;
  if (activeHidden())
    return `${editor.path.join("/") || editor.sprite.name} is hidden — show it to draw on it`;
  return null;
}

/** Refuse, and say which of the two reasons it was. */
export function blocked(): boolean {
  const why = readOnly();
  if (why) {
    editor.status = why;
    editor.statusBad = true;
  }
  return !!why;
}

/** The sprite with one frame of the active node replaced. Every tool ends here,
 *  and none of them has to know whether it is drawing on a body or a door. */
export const withFrame = (rows: string[]): SpriteFile =>
  withNode(editor.sprite, editor.path, (n) => ({
    ...n,
    frames: n.frames.map((f, i) => (i === frameNow() ? rows : f)),
  }));

/** The node above the active one. */
export const parentNode = (): SpriteBody | null =>
  editor.path.length ? nodeAt(editor.sprite, editor.path.slice(0, -1)) : null;

/** Every node in the bundle, root first — which is also the order that decides
 *  whose colour is the one to borrow when two disagree. */
export function allNodes(): { path: string[]; node: SpriteBody }[] {
  const out: { path: string[]; node: SpriteBody }[] = [];
  const walk = (n: SpriteBody, path: string[]) => {
    out.push({ path, node: n });
    for (const p of n.parts ?? []) if (!isPartRef(p)) walk(p, [...path, p.name]);
  };
  walk(editor.sprite, []);
  return out;
}
