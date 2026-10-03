import { isPartRef, levelOf, type SpriteBody } from "./format";
import { patch } from "./patch";

// A path is the list of part names from the root down. `[]` is the sprite
// itself, `["doorL"]` its door, `["doorL", "handle"]` the handle on that door.
// The editor holds one, every operation is applied through `withNode`, and a
// consumer holds each node's frame under the same path — so the same three lines
// address a part in the tool, in the file and in the game. A level is the one
// node a path reaches that is not a part: `["@far"]`, at the top only.

/** The node at a path, or null when the path names nothing — or names a `use`
 *  part, which has no body of its own to reach into. */
export function nodeAt(s: SpriteBody, path: readonly string[]): SpriteBody | null {
  const level = levelOf(path);
  if (level !== null) return s.levels?.find((l) => l.name === level) ?? null;
  let node: SpriteBody = s;
  for (const name of path) {
    const found = (node.parts ?? []).find((p) => p.name === name);
    if (!found || isPartRef(found)) return null;
    node = found;
  }
  return node;
}

/**
 * Apply a pure node transform at a path and rebuild the tree above it.
 *
 * The single mutation entry point, so every operation in core — and every
 * tool in the editor, and any server driving the same vocabulary — works on a
 * part without knowing that parts exist. A path that names nothing returns the
 * sprite unchanged rather than throwing: a stale path is a UI bug, not a reason
 * to lose the document.
 */
export function withNode<T extends SpriteBody>(
  s: T,
  path: readonly string[],
  fn: (node: SpriteBody) => SpriteBody,
): T {
  if (!path.length) return patch(s, fn(s));
  const level = levelOf(path);
  if (level !== null) {
    const levels = s.levels ?? [];
    const i = levels.findIndex((l) => l.name === level);
    if (i < 0) return s;
    const next = [...levels];
    next[i] = patch(levels[i], fn(levels[i]));
    return patch(s, { levels: next });
  }
  const parts = s.parts ?? [];
  const i = parts.findIndex((p) => p.name === path[0]);
  if (i < 0) return s;
  const target = parts[i];
  if (isPartRef(target)) return s;
  const next = [...parts];
  next[i] = withNode(target, path.slice(1), fn);
  return patch(s, { parts: next });
}

/**
 * The paths not inside another of them. A set that holds a door and the handle
 * on it moves the handle with the door already; moving both by the same step
 * would move the handle twice.
 */
export function topmost(paths: readonly (readonly string[])[]): string[][] {
  const keys = new Set(paths.map((p) => p.join("/")));
  return paths
    .filter((p) => !p.some((_, i) => i > 0 && keys.has(p.slice(0, i).join("/"))))
    .map((p) => [...p]);
}

/** Shift several parts by one step, each in its parent's pixels — which are the
 *  sprite's own, translated, so the same step is the same distance on screen. */
export function moveParts<T extends SpriteBody>(
  s: T,
  paths: readonly (readonly string[])[],
  dx: number,
  dy: number,
): T {
  let next = s;
  for (const path of topmost(paths)) {
    if (!path.length || levelOf(path) !== null) continue;
    const name = path[path.length - 1];
    next = withNode(next, path.slice(0, -1), (n) => ({
      ...n,
      parts: n.parts?.map((p) => (p.name === name ? { ...p, x: p.x + dx, y: p.y + dy } : p)),
    }));
  }
  return next;
}

/** Take several parts out at once. */
export function removeParts<T extends SpriteBody>(s: T, paths: readonly (readonly string[])[]): T {
  let next = s;
  for (const path of topmost(paths)) {
    if (!path.length || levelOf(path) !== null) continue;
    const name = path[path.length - 1];
    next = withNode(next, path.slice(0, -1), (n) => {
      const parts = n.parts?.filter((p) => p.name !== name);
      return { ...n, parts: parts?.length ? parts : undefined };
    });
  }
  return next;
}

/** The frames an animation plays, in order, or null for a name the node has not got.
 *  No silent fallback to the whole strip: that hides a typo. */
export function animationFrames(node: SpriteBody, name: string): number[] | null {
  const animation = node.animations?.[name];
  return animation ? [...animation] : null;
}

export type Box = { x: number; y: number; w: number; h: number };

/**
 * The box a node and its parts fill, in the node's own coordinates.
 *
 * Offsets may be negative and may reach past the parent's edge — a raised lamp
 * sticks out above the bonnet — so this is what the editor frames the view with
 * and what a consumer lays a sheet out with. `resolve` is passed in because core
 * has no folder; a `use` part is a leaf, so its own parts are not expanded.
 */
export function groupBox(
  node: SpriteBody,
  resolve: (name: string) => SpriteBody | null = () => null,
): Box {
  let x0 = 0;
  let y0 = 0;
  let x1 = node.w;
  let y1 = node.h;
  for (const p of node.parts ?? []) {
    const child = isPartRef(p) ? resolve(p.use) : p;
    if (!child) continue;
    const box = isPartRef(p) ? { x: 0, y: 0, w: child.w, h: child.h } : groupBox(child, resolve);
    x0 = Math.min(x0, p.x + box.x);
    y0 = Math.min(y0, p.y + box.y);
    x1 = Math.max(x1, p.x + box.x + box.w);
    y1 = Math.max(y1, p.y + box.y + box.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
