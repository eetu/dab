import {
  blankFrame,
  cloneSprite,
  flattenSprite,
  type Flip,
  getPixel,
  isPartRef,
  nodeAt,
  padSprite,
  type Part,
  setPixels,
  type SpriteBody,
  type SpriteFile,
  TRANSPARENT,
  withNode,
} from "dab-core";

import { commit, settle } from "./history.svelte";
import { clearSelection, hasSelection, isSelected, selection } from "./selection.svelte";
import { editor } from "./state.svelte";
import { activeNode, frameOf, partAt, pathKey, resolvePart } from "./tree.svelte";

// A part is a placement plus a body, and both live in the parent — so adding,
// moving and removing one is an edit to the node above it. That is what keeps a
// drag of a door a single ordinary snapshot of the whole sprite.

/** Rewrite a node's part list. */
const withParts = (path: readonly string[], fn: (parts: Part[]) => Part[]) =>
  commit(withNode(editor.sprite, path, (n) => ({ ...n, parts: fn(n.parts ?? []) })));

const freeName = (parts: Part[], want: string): string => {
  const taken = new Set(parts.map((p) => p.name));
  if (!taken.has(want)) return want;
  for (let i = 2; ; i++) if (!taken.has(`${want}${i}`)) return `${want}${i}`;
};

/**
 * Add a part to the active node: a blank grid, or a reference to another sprite.
 *
 * Dropped at the node's top-left rather than centred — a part goes where its
 * subject is, and nudging from a corner is less work than finding where the
 * middle put it.
 */
export function addPart(spec: {
  use?: string;
  w?: number;
  h?: number;
  name?: string;
}): string | null {
  const node = activeNode();
  if (spec.use === editor.sprite.name) return null;
  const name = freeName(node.parts ?? [], spec.name?.trim() || spec.use || "part");
  const w = Math.max(1, spec.w ?? Math.min(8, node.w));
  const h = Math.max(1, spec.h ?? Math.min(8, node.h));
  const part: Part = spec.use
    ? { name, x: 0, y: 0, use: spec.use }
    : // The parent's palette, copied in. A lamp on a car is painted in the car's
      // colours far more often than not, and the alternative is retyping them
      // into a part that is about to be drawn against the ones it should match.
      // Copied rather than inherited: a cell's colour stays `variant?.[ch] ??
      // palette[ch]` on one node, which is the rule the whole format rests on.
      // What is not used is reported as unused, the way it always was.
      { name, x: 0, y: 0, w, h, palette: { ...node.palette }, frames: [blankFrame(w, h)] };
  withParts(editor.path, (parts) => [...parts, part]);
  return name;
}

/**
 * Lift the selection out into a part of its own.
 *
 * The way a subject actually becomes an assembly: a door is drawn into the body
 * first, because that is how you draw a car, and only then does it need to open.
 * A rough box around it beats redrawing it — the extra it catches is erased
 * inside the part afterwards, where the same pixels are still underneath.
 *
 * Copied rather than moved by default, for exactly that reason: trim a part that
 * was CUT out and the body has a rectangular hole where the trimmings were.
 * Clearing the source is the separate, deliberate step it should be.
 *
 * Every frame comes along, not just the one on screen. The selection is a region
 * of the drawing, and a body with three frames hands over a part with three.
 */
export function partFromSelection(name: string, lift = false): string | null {
  if (!hasSelection()) return null;
  const node = activeNode();
  const x0 = selection.x0;
  const y0 = selection.y0;
  const w = selection.x1 - x0 + 1;
  const h = selection.y1 - y0 + 1;
  const pts = [...selection.cells].map((k) => k.split(",").map(Number) as [number, number]);

  const frames = node.frames.map((f) =>
    Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) =>
        isSelected(x0 + x, y0 + y) ? getPixel(f, x0 + x, y0 + y) : TRANSPARENT,
      ).join(""),
    ),
  );

  const key = freeName(node.parts ?? [], name.trim() || "part");
  const part: Part = {
    name: key,
    x: x0,
    y: y0,
    w,
    h,
    // The parent's colours, as a new part always gets: this drawing came from
    // that palette and is about to be edited against it.
    palette: { ...node.palette },
    ...(node.variants ? { variants: cloneSprite(node).variants } : {}),
    frames,
  };

  commit(
    withNode(editor.sprite, editor.path, (n) => ({
      ...n,
      // Lifting clears every frame, because every frame was taken.
      frames: lift ? n.frames.map((f) => setPixels(f, pts, TRANSPARENT)) : n.frames,
      parts: [...(n.parts ?? []), part],
    })),
  );
  clearSelection();
  return key;
}

/** A part's body, as a sprite that could stand on its own. */
export function spriteFromPart(path: readonly string[], name: string): SpriteFile | null {
  const part = partAt(path);
  if (!part || isPartRef(part)) return null;
  const { name: _n, x: _x, y: _y, behind: _b, flip: _f, ...body } = part;
  return cloneSprite({ ...body, name });
}

/**
 * Give a `use` part its own copy of the pixels it borrows.
 *
 * The way back out of sharing: the wheel stops following the folder's and
 * becomes this sprite's to bend. Placement, `behind` and `flip` stay.
 */
export function inlinePart(path: readonly string[]): boolean {
  const part = partAt(path);
  if (!part || !isPartRef(part)) return false;
  const source = resolvePart(part.use);
  if (!source) return false;
  const { name: _n, ...body } = cloneSprite(source);
  const key = path[path.length - 1];
  commit(
    withNode(editor.sprite, path.slice(0, -1), (n) => ({
      ...n,
      parts: (n.parts ?? []).map((p) =>
        p.name === key
          ? ({
              ...body,
              name: p.name,
              x: p.x,
              y: p.y,
              ...(p.behind ? { behind: true } : {}),
              ...(p.flip ? { flip: p.flip } : {}),
            } as Part)
          : p,
      ),
    })),
  );
  return true;
}

/**
 * Point a part at a sprite in the folder instead of carrying its own pixels.
 *
 * What turns one wheel into two: detach it, and every further copy is a
 * reference to the same drawing rather than a second one to keep in step.
 */
export function usePartInstead(path: readonly string[], use: string) {
  if (!path.length || use === editor.sprite.name) return;
  const key = path[path.length - 1];
  commit(
    withNode(editor.sprite, path.slice(0, -1), (n) => ({
      ...n,
      parts: (n.parts ?? []).map((p) =>
        p.name === key
          ? ({
              name: p.name,
              x: p.x,
              y: p.y,
              ...(p.behind ? { behind: true } : {}),
              ...(p.flip ? { flip: p.flip } : {}),
              use,
            } as Part)
          : p,
      ),
    })),
  );
  settle();
}

export function removePart(path: readonly string[]) {
  if (!path.length) return;
  const name = path[path.length - 1];
  withParts(path.slice(0, -1), (parts) => parts.filter((p) => p.name !== name));
  settle();
}

/**
 * Another one of these.
 *
 * A borrowed part is copied as a REFERENCE — which is the whole point of
 * borrowing, and the second wheel: both draw the one sprite, so fixing it once
 * fixes both. A part with its own pixels is copied as its own pixels, deeply,
 * because two independent drawings is what having your own pixels means.
 */
export function duplicatePart(path: readonly string[]) {
  if (!path.length) return;
  const part = partAt(path);
  if (!part) return;
  withParts(path.slice(0, -1), (parts) => {
    // Not cloneSprite for a reference: it has no frames to clone, and asking it
    // for some is how duplicating a borrowed part used to throw.
    const copy = (isPartRef(part) ? { ...part } : { ...cloneSprite(part as SpriteBody) }) as Part;
    copy.name = freeName(parts, part.name);
    const i = parts.findIndex((p) => p.name === part.name);
    return [...parts.slice(0, i + 1), copy, ...parts.slice(i + 1)];
  });
}

/** Reorder among siblings — the list is the draw order. */
export function movePart(path: readonly string[], to: number) {
  if (!path.length) return;
  const name = path[path.length - 1];
  withParts(path.slice(0, -1), (parts) => {
    const from = parts.findIndex((p) => p.name === name);
    if (from < 0 || to < 0 || to >= parts.length || from === to) return parts;
    const next = [...parts];
    const [p] = next.splice(from, 1);
    next.splice(to, 0, p);
    return next;
  });
}

/** Change one part's placement — where it sits, which way round, which side of
 *  its parent it draws on. `fresh` starts a new undo step, so a whole drag folds
 *  into one the way a stroke does. */
/** Arrow-key travel for the selected part. A run of presses inside half a
 *  second rides one undo entry, the way a drag's pixels ride one snapshot —
 *  holding an arrow is one gesture, not forty. */
let nudging: ReturnType<typeof setTimeout> | null = null;
export function nudgePart(dx: number, dy: number) {
  const part = partAt(editor.path);
  if (!part) return;
  const fresh = nudging === null;
  if (nudging) clearTimeout(nudging);
  nudging = setTimeout(() => (nudging = null), 500);
  placePart(editor.path, { x: part.x + dx, y: part.y + dy }, fresh);
}

export function placePart(path: readonly string[], next: Partial<Part>, fresh = true) {
  if (!path.length) return;
  const name = path[path.length - 1];
  const parent = path.slice(0, -1);
  const apply = (s: SpriteFile) =>
    withNode(s, parent, (n) => ({
      ...n,
      parts: (n.parts ?? []).map((p) => (p.name === name ? ({ ...p, ...next } as Part) : p)),
    }));
  if (fresh) commit(apply(editor.sprite));
  else {
    editor.sprite = apply(editor.sprite);
    editor.dirty = true;
  }
}

export function renamePart(path: readonly string[], to: string) {
  const name = to.trim();
  if (!path.length || !name) return;
  const was = path[path.length - 1];
  const parent = nodeAt(editor.sprite, path.slice(0, -1));
  if (!parent || name === was || parent.parts?.some((p) => p.name === name)) return;
  placePart(path, { name });
  // The path and every key held under it move with the name.
  const oldKey = pathKey(path);
  const newKey = pathKey([...path.slice(0, -1), name]);
  if (editor.shown[oldKey] !== undefined) {
    editor.shown[newKey] = editor.shown[oldKey];
    delete editor.shown[oldKey];
  }
  if (editor.hidden[oldKey]) {
    editor.hidden[newKey] = true;
    delete editor.hidden[oldKey];
  }
  if (pathKey(editor.path) === oldKey) editor.path = [...path.slice(0, -1), name];
}

export const setPartFlip = (path: readonly string[], flip: Flip | null) =>
  placePart(path, { flip: flip ?? undefined });
export const setPartBehind = (path: readonly string[], behind: boolean) =>
  placePart(path, { behind: behind || undefined });

/**
 * Grow a node by a margin and pull its placement back by the same, so nothing on
 * screen moves.
 *
 * The answer to a part that needs a pixel outside its canvas. Never automatic: a
 * resize crops or pads, and that belongs behind a press.
 */
export function padNode(path: readonly string[], l: number, t: number, r: number, b: number) {
  const node = nodeAt(editor.sprite, path);
  if (!node || (!l && !t && !r && !b)) return;
  if (node.w + l + r < 1 || node.h + t + b < 1) return;
  let next = withNode(editor.sprite, path, (n) => padSprite(n, l, t, r, b));
  const part = partAt(path);
  if (part) {
    const name = path[path.length - 1];
    next = withNode(next, path.slice(0, -1), (n) => ({
      ...n,
      parts: (n.parts ?? []).map((p) => (p.name === name ? { ...p, x: p.x - l, y: p.y - t } : p)),
    }));
  }
  commit(next);
}

// ---------- flatten ----------

/**
 * The active node's assembly baked flat, exactly as the canvas shows it —
 * parts at their shown frames, hidden eyes honoured, glass blended. Variants
 * stay behind: they are skins over the base, and the bake is of the base.
 */
export function flattenedNode(name: string): { sprite: SpriteFile; added: number } | null {
  const node = activeNode();
  if (!node.parts?.length) return null;
  const flat = flattenSprite(node, {
    resolve: resolvePart,
    frameOf: (path, n, f) => frameOf([...editor.path, ...path], n, f),
    hidden: (path) => !!editor.hidden[pathKey([...editor.path, ...path])],
  });
  return {
    sprite: { name, w: flat.w, h: flat.h, palette: flat.palette, frames: flat.frames },
    added: flat.added.length,
  };
}
