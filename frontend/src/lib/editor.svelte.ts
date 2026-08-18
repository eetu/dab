// The editor's state: the sprite being drawn, what the tools are set to, and
// the undo stack.
//
// Undo holds whole sprites rather than inverse operations. A sprite is a
// handful of strings — the biggest one in the repo is 72×18 — so a hundred of
// them costs less than the machinery for undoing a flood fill correctly, and
// nothing can drift out of sync with the document.
import {
  addColour as addColourTo,
  addFrame as addFrameTo,
  allCells,
  blankFrame,
  blankSprite,
  clipFrames,
  cloneSprite,
  duplicateFrame as duplicateFrameIn,
  ellipsePoints,
  fitRows,
  flattenSprite,
  type Flip,
  flipRows,
  floodPoints,
  getPixel,
  groupBox,
  isPartRef,
  linePoints,
  moveFrame as moveFrameIn,
  movePaletteChar as movePaletteCharIn,
  nodeAt,
  padSprite,
  type Part,
  type Placement,
  readStamp,
  rectPoints,
  removeColour as removeColourFrom,
  removeFrame as removeFrameFrom,
  renameChar as renameCharIn,
  resizeSprite,
  rotateRows,
  setColour as setColourIn,
  setPixels,
  shapePoints,
  type SpriteBody,
  type SpriteFile,
  type Stamp,
  stampCells,
  stampRows,
  TRANSPARENT,
  unusedChars,
  withNode,
} from "dab-core";
import { SvelteSet } from "svelte/reactivity";

import { closeMenu } from "./menu.svelte";

export type Tool =
  "pencil" | "eraser" | "fill" | "picker" | "line" | "rect" | "ellipse" | "select" | "move";

/** The rail, in order. `key` is the single-press shortcut, as in nib. */
export const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: "pencil", label: "Pencil", key: "b", hint: "Draw with the selected colour" },
  { id: "eraser", label: "Eraser", key: "e", hint: "Paint transparent" },
  { id: "fill", label: "Fill", key: "g", hint: "Flood the connected run" },
  {
    id: "picker",
    label: "Picker",
    key: "i",
    hint: "Take the colour under the cursor — or hold ⌥ over any other tool",
  },
  { id: "line", label: "Line", key: "l", hint: "Drag a straight run" },
  { id: "rect", label: "Rect", key: "r", hint: "Drag a box — hold Shift to fill" },
  { id: "ellipse", label: "Ellipse", key: "o", hint: "Drag a box — hold Shift to fill" },
  {
    id: "select",
    label: "Select",
    key: "m",
    hint: "Click a shape or drag a box, then drag it — arrows nudge, ⌘C/X/V, ⌫ clears",
  },
  {
    id: "move",
    label: "Move",
    key: "v",
    hint: "Drag a part into place — the whole part, not its pixels",
  },
];

const MAX_UNDO = 200;

export const editor = $state({
  sprite: blankSprite("untitled", 16, 16) as SpriteFile,
  /** The file this came from, so Save knows whether it is a new sprite. */
  file: null as string | null,
  dirty: false,
  frame: 0,
  /**
   * Which node the tools write to: part names from the root down, `[]` for the
   * sprite itself. One document, a selected node — so a part edit is an ordinary
   * edit to the sprite and the undo stack keeps holding whole sprites.
   */
  path: [] as string[],
  /**
   * Which frame every other node shows, and which are hidden while drawing.
   * Both are editor state and neither is written to the file: a part's frame is
   * the consumer's to choose, and a door that is gone is the consumer not
   * drawing it. `"follow"` tracks the active node, which is what makes drawing a
   * raise across two parts legible.
   */
  shown: {} as Record<string, number | "follow">,
  hidden: {} as Record<string, boolean>,
  tool: "pencil" as Tool,
  /** Palette character the pencil paints; `.` means transparent. */
  ink: TRANSPARENT,
  grid: true,
  onion: true,
  playing: false,
  fps: 6,
  /** The play head, driven by the preview and read by the frame strip, so both
   *  show the same frame instead of each running its own clock. */
  playhead: 0,
  /** Which palette variant the canvas and previews are showing, or null for the
   *  palette itself. A recoloured sprite has to be viewable in each of its
   *  colourways, since that is what a consumer will draw. */
  variant: null as string | null,
  /** Which named run the play head is walking, or null for the whole strip. */
  clip: null as string | null,
  status: "" as string,
  /** Whether the status is a refusal or a failure — drawn in the error colour,
   *  where an outcome ("saved car.json") stays quiet. */
  statusBad: false,
});

// ---------- the tree ----------
//
// Every operation below is applied to the node at `editor.path` through
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
 * The node whose palette, frames and clips the panels are about.
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

/** Snapshot before a change. Every mutation below goes through this. */
function commit(next: SpriteFile) {
  commitOver(cloneSprite(editor.sprite), next);
}

/**
 * Land on `next`, with `was` as what undo goes back to.
 *
 * For a mode that has been previewing uncommitted states — rotation redraws the
 * document at every angle — where the state to take back is the one from before
 * the mode opened, not the last thing shown.
 */
function commitOver(was: SpriteFile, next: SpriteFile) {
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
const commitNode = (fn: (node: SpriteBody) => SpriteBody) => {
  // withNode is already a no-op on a borrowed path, which would make every
  // palette and frame edit quietly do nothing. Say so instead.
  if (blocked()) return;
  commit(withNode(editor.sprite, editor.path, fn));
};

/**
 * Put the cursor somewhere that still exists.
 *
 * Undo can take back the part that is being edited, and a frame operation can
 * shorten the strip under the frame index. Both leave the editor pointed at
 * nothing, which draws as an empty canvas that looks like lost work.
 */
function settle() {
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
  // A frame operation can remap a clip out of existence while the preview is
  // showing it — the badge would keep naming a clip the node no longer has.
  if (editor.clip && !activeNode().clips?.[editor.clip]) editor.clip = null;
}

export function undoEdit() {
  const prev = undo.pop();
  if (!prev) return;
  redo.push(cloneSprite(editor.sprite));
  editor.sprite = prev;
  editor.dirty = true;
  settle();
  syncHistory();
}

export function redoEdit() {
  const next = redo.pop();
  if (!next) return;
  undo.push(cloneSprite(editor.sprite));
  editor.sprite = next;
  editor.dirty = true;
  settle();
  syncHistory();
}

export function loadSprite(sprite: SpriteFile, file: string | null) {
  // Opening another document abandons a turn in flight. Left running, its source
  // is still the OLD sprite, and the next touch of the dial would replace what
  // was just opened with a rotated copy of what was closed. A menu describes a
  // moment, and that moment is over too.
  endTurn();
  dropFloat();
  closeMenu();
  // Per-document view state resets WITH the document. These used to survive, so
  // opening sprite B carried sprite A's variant and clip name over — and the
  // preview badge could name a clip the new sprite never had.
  editor.variant = null;
  editor.clip = null;
  editor.playing = false;
  editor.playhead = 0;
  editor.sprite = sprite;
  editor.file = file;
  editor.frame = 0;
  editor.path = [];
  editor.shown = {};
  editor.hidden = {};
  editor.dirty = false;
  editor.ink = Object.keys(sprite.palette)[0] ?? TRANSPARENT;
  selection.cells = new SvelteSet();
  undo = [];
  redo = [];
  syncHistory();
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
  dropFloat();
  selection.cells = new SvelteSet();
  editor.path = [...path];
  if (!node) return;
  editor.frame = Math.min(editor.frame, node.frames.length - 1);
  if (editor.ink !== TRANSPARENT && !(editor.ink in node.palette)) {
    editor.ink = Object.keys(node.palette)[0] ?? TRANSPARENT;
  }
}

export function newSprite(name: string, w: number, h: number) {
  loadSprite(blankSprite(name, w, h), null);
}

// ---------- drawing ----------

/** What a tool paints with — the eraser is a pencil loaded with transparent. */
const inkFor = (tool: Tool): string => (tool === "eraser" ? TRANSPARENT : editor.ink);

/** The frame of the ACTIVE node the tools are working on. */
const frameNow = (): number => frameOf(editor.path, activeNode());
const rowsNow = (): string[] => activeNode().frames[frameNow()];

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
function blocked(): boolean {
  const why = readOnly();
  if (why) {
    editor.status = why;
    editor.statusBad = true;
  }
  return !!why;
}

/** The sprite with one frame of the active node replaced. Every tool ends here,
 *  and none of them has to know whether it is drawing on a body or a door. */
const withFrame = (rows: string[]): SpriteFile =>
  withNode(editor.sprite, editor.path, (n) => ({
    ...n,
    frames: n.frames.map((f, i) => (i === frameNow() ? rows : f)),
  }));

/** The pixels a drag would paint, for the live preview and for the commit. */
export function strokePoints(
  tool: Tool,
  from: { x: number; y: number },
  to: { x: number; y: number },
  filled: boolean,
): [number, number][] {
  switch (tool) {
    case "line":
      return linePoints(from.x, from.y, to.x, to.y);
    case "rect":
      return rectPoints(from.x, from.y, to.x, to.y, filled);
    case "ellipse":
      return ellipsePoints(from.x, from.y, to.x, to.y, filled);
    default:
      return linePoints(from.x, from.y, to.x, to.y);
  }
}

/**
 * Paint a stroke. `fresh` starts a new undo step; the rest of a drag folds into
 * it, so dragging the pencil across the sprite is one undo and not two hundred.
 */
export function paint(points: Iterable<readonly [number, number]>, fresh: boolean) {
  if (blocked()) return;
  // Drawing lets go of a floating block. Keeping the float would leave the next
  // nudge stamping onto a base taken before the stroke, which would put back
  // what was under it and rub the stroke out.
  if (fresh) dropFloat();
  const rows = rowsNow();
  const next = setPixels(rows, points, inkFor(editor.tool));
  if (next === rows) return;
  if (fresh) commit(withFrame(next));
  else {
    editor.sprite = withFrame(next);
    editor.dirty = true;
  }
}

export function fillAt(x: number, y: number) {
  const rows = rowsNow();
  paint(floodPoints(rows, x, y), true);
}

export function pickAt(x: number, y: number) {
  const ch = rowsNow()?.[y]?.[x];
  if (ch) editor.ink = ch;
}

// ---------- selection ----------
//
// A selection is a set of cells, not a rectangle: clicking a shape selects the
// connected run under the cursor, which is rarely box-shaped. The bounds come
// along for the marquee to draw and for a paste to know where the block sits.
//
// Moving is a LIFT and a PUT-DOWN. On the first pixel of travel the selected
// cells are cleared from the frame and kept as a stamp; every later step puts
// that stamp down on the cleared frame at a new offset. So the undo stack gets
// one entry for a whole drag — the state before the block moved — and the frame
// is never a half-moved mess.

const key = (x: number, y: number) => `${x},${y}`;

export const selection = $state({
  /** "x,y" of every selected cell. Empty means no selection. */
  cells: new SvelteSet<string>(),
  x0: 0,
  y0: 0,
  x1: 0,
  y1: 0,
  /** Ticks up on every fresh selection: the canvas flashes what just got picked,
   *  because a one-pixel dashed outline is easy to miss on a dense sprite. */
  flash: 0,
});

/** The lifted block mid-move, and the frame it was lifted out of. */
let float: { stamp: Stamp; base: string[]; x: number; y: number } | null = null;

/**
 * Whether the float is a PASTE, rather than a lift.
 *
 * Only a paste is sitting over art that is not its own — a move and a turn both
 * carry a base the block was lifted out of, so there is nothing underneath them
 * to lose. So only a paste has anything to say, and it is the only one that
 * changes how the marquee looks.
 */
export const floating = $state({ on: false });
export const clipboard = $state({ stamp: null as Stamp | null });

export const hasSelection = () => selection.cells.size > 0;
export const isSelected = (x: number, y: number) => selection.cells.has(key(x, y));

function setSelection(points: Iterable<readonly [number, number]>) {
  const cells = new SvelteSet<string>();
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    cells.add(key(x, y));
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  selection.cells = cells;
  if (cells.size) {
    selection.x0 = x0;
    selection.y0 = y0;
    selection.x1 = x1;
    selection.y1 = y1;
    selection.flash++;
  }
}

/**
 * Clicking picks the whole connected SHAPE under it, whatever colours are in it:
 * what you point at is an object, not a colour. Fill's one-character rule would
 * hand back a highlight and leave the body it sits on behind.
 *
 * A click on empty space drops the selection instead of selecting the emptiness.
 * Nobody clicks the background meaning "select that", and every editor with a
 * marquee already reads a click on nothing as "never mind".
 */
export function selectShapeAt(x: number, y: number) {
  dropFloat();
  const pts = shapePoints(rowsNow(), x, y);
  if (!pts.length) {
    selection.cells = new SvelteSet();
    return;
  }
  setSelection(pts);
}

export function selectBox(
  from: { x: number; y: number },
  to: { x: number; y: number },
  opaqueOnly = false,
) {
  dropFloat();
  const rows = rowsNow();
  const pts = rectPoints(from.x, from.y, to.x, to.y, true).filter(
    ([x, y]) => !opaqueOnly || (rows[y]?.[x] ?? TRANSPARENT) !== TRANSPARENT,
  );
  setSelection(pts);
}

export function selectAll() {
  dropFloat();
  const { w, h } = activeNode();
  setSelection(rectPoints(0, 0, w - 1, h - 1, true));
}

export function clearSelection() {
  dropFloat();
  selection.cells = new SvelteSet();
}

/**
 * Let go of the block being moved, and bake it. The pixels are already in the
 * frame either way — the float only holds the frame to re-stamp onto, so the
 * NEXT step can move the block again without stacking a fresh undo entry per
 * pixel of travel, and (after a paste) without the first step having eaten what
 * it landed on.
 *
 * Which is why this is the moment a paste stops being undoable by moving it:
 * deselect, select something else, or draw, and what it covered is gone.
 */
function dropFloat() {
  float = null;
  floating.on = false;
}

/** Bake a floating paste where it sits, and stop saying so. The marquee stays:
 *  letting go of the float is not letting go of what is selected. */
export const dropPaste = dropFloat;

/**
 * Take a floating paste back out — what Escape means while one floats.
 *
 * The paste and every shove of it are one undo entry, so cancelling IS undo,
 * plus letting go of the marquee that was tracking it. This is what makes
 * Escape mean CANCEL on both floating states (a turn, a paste) instead of
 * quietly baking one and cancelling the other.
 */
export function cancelPaste() {
  if (!floating.on) return;
  dropFloat();
  undoEdit();
  selection.cells = new SvelteSet();
}

/**
 * The gesture in progress on the canvas, if any, and how to abandon it.
 *
 * Registered by the canvas while a marquee, stroke or part-drag is live, so the
 * app-level Escape can abort a drag without owning its state. First rung of the
 * Escape ladder: abort the drag → cancel the float → deselect.
 */
export const gesture = $state({ abort: null as (() => void) | null });

/**
 * Shift the selection by a whole number of cells. The first call in a run lifts
 * and takes the single undo snapshot; the rest ride on it. A pasted block
 * arrives already floating, over a base that still has everything it covers.
 */
export function nudgeSelection(dx: number, dy: number) {
  if (!hasSelection() || blocked() || (dx === 0 && dy === 0)) return;
  const rows = rowsNow();
  if (!float) {
    const pts = [...selection.cells].map((k) => k.split(",").map(Number) as [number, number]);
    const stamp = readStamp(rows, pts);
    const base = setPixels(rows, pts, TRANSPARENT);
    commit(withFrame(base));
    float = { stamp, base, x: selection.x0, y: selection.y0 };
  }
  float.x += dx;
  float.y += dy;
  editor.sprite = withFrame(stampCells(float.base, float.stamp, float.x, float.y));
  editor.dirty = true;
  // The marquee travels with the pixels.
  const moved = [...selection.cells].map((k) => {
    const [x, y] = k.split(",").map(Number);
    return [x + dx, y + dy] as [number, number];
  });
  const flash = selection.flash;
  setSelection(moved);
  selection.flash = flash; // a move is not a fresh pick; don't re-flash it
}

/** Wipe the selected cells. */
export function deleteSelection() {
  if (!hasSelection() || blocked()) return;
  dropFloat();
  const rows = rowsNow();
  const pts = [...selection.cells].map((k) => k.split(",").map(Number) as [number, number]);
  const next = setPixels(rows, pts, TRANSPARENT);
  if (next !== rows) commit(withFrame(next));
}

export function copySelection() {
  if (!hasSelection()) return;
  const rows = rowsNow();
  const pts = [...selection.cells].map((k) => k.split(",").map(Number) as [number, number]);
  clipboard.stamp = readStamp(rows, pts);
}

export function cutSelection() {
  copySelection();
  deleteSelection();
}

/**
 * Put the clipboard down at the top-left of the current selection, or where it
 * was cut from if nothing is selected, and select it — so a paste lands ready
 * to be dragged into place.
 *
 * A paste FLOATS: the frame it lands on is kept as the float's base, so nudging
 * it puts back whatever it was covering a step ago. The pixels underneath are
 * only really gone once the float is dropped — deselect, select something else,
 * or draw. That is the floating selection every editor with a marquee has, and
 * it is what makes "land it, then shove it into place" safe: what you dragged
 * over is not yours and must survive being passed over.
 *
 * Moving your OWN selection is different and stays a lift: those pixels were
 * picked up, so the hole they leave is the point.
 */
export function pasteClipboard(at?: { x: number; y: number }) {
  const stamp = clipboard.stamp;
  if (!stamp?.cells.length || blocked()) return;
  dropFloat();
  const x = at?.x ?? (hasSelection() ? selection.x0 : 0);
  const y = at?.y ?? (hasSelection() ? selection.y0 : 0);
  const rows = rowsNow();
  // One undo entry covers the paste and wherever it is shoved to afterwards.
  commit(withFrame(stampCells(rows, stamp, x, y)));
  float = { stamp, base: rows, x, y };
  floating.on = true;
  setSelection(stamp.cells.map((c) => [x + c.dx, y + c.dy] as [number, number]));
}

// ---------- flip ----------

/**
 * Mirror the selection in place, floating the result the way a MOVE floats:
 * these are your own pixels over their own hole, so there is nothing under
 * them to lose — the flip can be shoved into place on the same undo entry,
 * and one undo takes the whole thing back.
 *
 * The one transform the format calls free, finally applicable to pixels: it was
 * draw-time only (a part's `flip`), so the editor could MIRROR a wheel forever
 * and never flip the drawing of one.
 */
export function flipSelection(dir: Flip) {
  if (!hasSelection() || blocked()) return;
  dropFloat();
  const rows = rowsNow();
  const pts = [...selection.cells].map((k) => k.split(",").map(Number) as [number, number]);
  const stamp = readStamp(rows, pts);
  const flipped = readStamp(flipRows(stampRows(stamp), dir), allCells(stamp.w, stamp.h));
  const base = setPixels(rows, pts, TRANSPARENT);
  const x = selection.x0;
  const y = selection.y0;
  commit(withFrame(stampCells(base, flipped, x, y)));
  float = { stamp: flipped, base, x, y };
  setSelection(
    flipped.cells
      .filter((c) => c.ch !== TRANSPARENT)
      .map((c) => [x + c.dx, y + c.dy] as [number, number]),
  );
}

/**
 * Mirror every frame of the node being edited.
 *
 * Refused when the node carries parts: their placements would stay put while
 * the pixels under them mirrored, which is the subtree arithmetic this repo
 * keeps out of scope — the parts are flipped one by one instead.
 */
export function flipNode(dir: Flip): boolean {
  const node = activeNode();
  if (node.parts?.length) return false;
  commitNode((n) => ({ ...n, frames: n.frames.map((f) => flipRows(f, dir)) }));
  return true;
}

// ---------- rotation ----------

/**
 * Rotation is a MODE, not an operation.
 *
 * Every other tool here answers in one gesture, but nobody knows what angle they
 * want until they see it, and at anything other than a quarter turn the answer
 * costs palette entries — of which the format has 69 in total. So it previews
 * live against the real canvas, says what it would cost before it costs it, and
 * ends in Apply or Cancel. A dialog would be the wrong shape: whether a rotated
 * door looks right depends on the car it is sitting on, so the canvas has to
 * stay where it is.
 */
export const turning = $state({
  on: false,
  /** Degrees clockwise. */
  angle: 0,
  /** Sub-samples per axis. 1 is nearest neighbour: jagged, and free. */
  smooth: 1,
  /** The whole node, rather than what is selected. */
  whole: false,
  /** Colours applying right now would add — the number that matters. */
  added: 0,
  /** The centre it turns about, in the ACTIVE node's pixels — where the canvas
   *  hangs the rotation handle — and how far out the handle sits. */
  cx: 0,
  cy: 0,
  r: 4,
});

/**
 * What is being turned, kept as it was before the mode opened.
 *
 * Every angle re-samples THIS, never the last preview. Rotating an already
 * rotated grid blends the blends, and the palette never stops growing: turning
 * one wheel five times costs 9, 4, 4, 1, 4 colours and climbing, where turning
 * the original to five angles costs 9, 3, 2, 0, 0 and settles. Same reason a
 * drag back to 0° has to come out pixel-identical to where it started.
 */
let source: {
  rows: string[];
  palette: Record<string, string>;
  before: SpriteFile;
  wasDirty: boolean;
  /** The frame with the block lifted out — a selection only. */
  base: string[] | null;
  /** The selection as it stood, so Cancel puts the marquee back too. */
  cells: [number, number][] | null;
  x: number;
  y: number;
  w: number;
  h: number;
} | null = null;

/** Open the mode on the selection, or on the whole active node. */
export function beginTurn(whole: boolean) {
  // Opening a second turn over an unfinished one would take the preview as its
  // pristine source, and there would be no way back to the art.
  if (turning.on || blocked()) return;
  if (!whole && !hasSelection()) return;
  // A parted node does not turn: its parts would sit still while the grid spun
  // under them — the same reason flipNode refuses. Flatten first.
  if (whole && activeNode().parts?.length) return;
  // Its items would act on a preview, and it would sit over the dial.
  closeMenu();
  dropFloat();
  const node = activeNode();
  const rows = rowsNow();
  const before = cloneSprite(editor.sprite);
  const common = { palette: node.palette, before, wasDirty: editor.dirty };
  if (whole) {
    source = { ...common, rows, base: null, cells: null, x: 0, y: 0, w: node.w, h: node.h };
  } else {
    const pts = [...selection.cells].map((k) => k.split(",").map(Number) as [number, number]);
    const stamp = readStamp(rows, pts);
    source = {
      ...common,
      rows: stampRows(stamp),
      base: setPixels(rows, pts, TRANSPARENT),
      cells: pts,
      x: selection.x0,
      y: selection.y0,
      w: stamp.w,
      h: stamp.h,
    };
  }
  turning.on = true;
  turning.whole = whole;
  turning.angle = 0;
  turning.added = 0;
  turning.cx = source.x + source.w / 2;
  turning.cy = source.y + source.h / 2;
  turning.r = Math.max(source.w, source.h) / 2 + 2;
  showTurn();
}

export function setTurn(angle: number, smooth = turning.smooth) {
  if (!turning.on) return;
  turning.angle = angle;
  turning.smooth = Math.max(1, Math.min(4, Math.round(smooth)));
  showTurn();
}

/** Redraw the preview. Nothing here commits: the document is rebuilt from the
 *  pristine `before` every time, so cancelling is just letting go. */
function showTurn() {
  if (!source || !turning.on) return;
  const r = rotateRows(source.rows, source.palette, turning.angle, {
    samples: turning.smooth,
    grow: true,
  });
  turning.added = r.added.length;
  const at = frameNow();
  const withRows = (host: SpriteFile, rows: string[], size?: { w: number; h: number }) =>
    withNode(host, editor.path, (n) => ({
      ...n,
      ...(size ?? {}),
      palette: r.palette,
      frames: n.frames.map((f, i) => (i === at ? rows : f)),
    }));

  if (!turning.whole) {
    // A block turns about its own centre, and overhangs where it has to: it is
    // floating, so nothing is LOST off an edge until it is baked — the same
    // bargain every transform tool makes. What the frame cannot hold is only
    // out of sight; shove the float after Apply and it comes back.
    const x = source.x + Math.round((source.w - r.w) / 2);
    const y = source.y + Math.round((source.h - r.h) / 2);
    const stamp = readStamp(r.rows, allCells(r.w, r.h));
    editor.sprite = withRows(source.before, stampCells(source.base!, stamp, x, y));
    // The marquee follows the turned art — a transform box that sat on the old
    // bounds read as the rotation being clipped to them.
    const flash = selection.flash;
    setSelection(
      stamp.cells
        .filter((c) => c.ch !== TRANSPARENT)
        .map((c) => [x + c.dx, y + c.dy] as [number, number]),
    );
    selection.flash = flash; // a dial move is not a fresh pick
    return;
  }

  // A whole node GROWS to hold the turn, and never shrinks: the other frames are
  // only padded, never cropped, so turning frame 2 cannot quietly trim frame 1.
  const W = Math.max(source.w, r.w);
  const H = Math.max(source.h, r.h);
  const grown = withNode(source.before, editor.path, (n) => resizeSprite(n, W, H, "center"));
  let next = withRows(grown, fitRows(r.rows, r.w, r.h, W, H), { w: W, h: H });
  // A part turns about its CENTRE, so its placement walks back as the box grows
  // — anchor the corner instead and the art orbits it, wandering around the
  // parent as W and H breathe with the angle. The root needs no such walk: its
  // box IS the stage, and the canvas centres that.
  const dx = Math.round((W - source.w) / 2);
  const dy = Math.round((H - source.h) / 2);
  if (editor.path.length && (dx || dy)) {
    const name = editor.path[editor.path.length - 1];
    next = withNode(next, editor.path.slice(0, -1), (n) => ({
      ...n,
      parts: n.parts?.map((p) => (p.name === name ? { ...p, x: p.x - dx, y: p.y - dy } : p)),
    }));
  }
  editor.sprite = next;
}

/** Put the turn down. One undo entry covers the whole session at the dial. */
export function applyTurn() {
  if (!source || !turning.on) return;
  const next = editor.sprite;
  const { base, x, y, w, h, before } = source;
  commitOver(before, next);
  if (base) {
    // Hand it to the float, so a turn can be shoved into place without a second
    // undo entry — and so the hole it was lifted from stays open until it lands.
    const r = rotateRows(source.rows, source.palette, turning.angle, {
      samples: turning.smooth,
      grow: true,
    });
    const bx = x + Math.round((w - r.w) / 2);
    const by = y + Math.round((h - r.h) / 2);
    const stamp = readStamp(r.rows, allCells(r.w, r.h));
    float = { stamp, base, x: bx, y: by };
    setSelection(
      stamp.cells
        .filter((c) => c.ch !== TRANSPARENT)
        .map((c) => [bx + c.dx, by + c.dy] as [number, number]),
    );
  }
  const added = turning.added;
  endTurn();
  // The aftermath, said out loud. A second spin of the same pixels replaces the
  // last spin's blends and orphans them — the palette menu can sweep those, but
  // only if you know they are there.
  const dead = unusedChars(activeNode()).length;
  editor.status =
    `rotated${added ? ` — ${added} colour${added > 1 ? "s" : ""} added` : ""}` +
    (dead ? ` · ${dead} unused (the palette's ⋯ removes them)` : "");
  editor.statusBad = false;
}

/** Let go without keeping any of it. */
export function cancelTurn() {
  if (!source) return;
  editor.sprite = source.before;
  editor.dirty = source.wasDirty;
  // The marquee too: it followed the preview, and cancelling means all of it.
  if (source.cells) {
    const flash = selection.flash;
    setSelection(source.cells);
    selection.flash = flash;
  }
  endTurn();
}

function endTurn() {
  source = null;
  turning.on = false;
  turning.angle = 0;
  turning.added = 0;
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

// ---------- document ----------

export function rename(name: string) {
  if (!name || name === editor.sprite.name) return;
  commit({ ...editor.sprite, name });
}

// ---------- palette variants ----------
//
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

// Each takes the frame to act on, defaulting to the one being edited: the
// header buttons act on "this frame", a thumbnail's menu on the one under the
// cursor, and both are the same verb.
export const addFrame = (at: number = frameNow()) => commitNode((n) => addFrameTo(n, at));
export const duplicateFrame = (at: number = frameNow()) =>
  commitNode((n) => duplicateFrameIn(n, at));
export function removeFrame(at: number = frameNow()) {
  if (activeNode().frames.length <= 1) return;
  commitNode((n) => removeFrameFrom(n, at));
  settle();
}
export function moveFrame(from: number, to: number) {
  const node = activeNode();
  if (from === to || to < 0 || to >= node.frames.length) return;
  commitNode((n) => moveFrameIn(n, from, to));
  editor.frame = to;
}

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
  commitNode((n) => dead.reduce((m, ch) => removeColourFrom(m, ch), n));
  if (dead.includes(editor.ink)) editor.ink = TRANSPARENT;
  return dead.length;
}

export const addColour = (hex: string) => commitNode((n) => addColourTo(n, hex));
export function removeColour(ch: string) {
  commitNode((n) => removeColourFrom(n, ch));
  if (editor.ink === ch) editor.ink = TRANSPARENT;
}
/** Set a colour. `fresh` opens the undo entry; a picker drag streams the rest
 *  through it live, so a sweep across a hundred hues is ONE edit — the same
 *  rule a paint stroke follows, and what stops one drag flushing the stack. */
export function setColour(ch: string, hex: string, fresh = true) {
  if (blocked()) return;
  if (fresh) return commitNode((n) => setColourIn(n, ch, hex));
  editor.sprite = withNode(editor.sprite, editor.path, (n) => setColourIn(n, ch, hex));
  editor.dirty = true;
}

/** Reorder the palette. The order is the file's — what `toJson` writes and what
 *  the swatches list in — so this is an edit, not a view preference. */
export const movePaletteChar = (ch: string, to: number) =>
  commitNode((n) => movePaletteCharIn(n, ch, to));
export function renameChar(from: string, to: string) {
  const node = activeNode();
  if (renameCharIn(node, from, to) === node) return;
  commitNode((n) => renameCharIn(n, from, to));
  if (editor.ink === from) editor.ink = to;
}

// ---------- clips ----------
//
// A clip is a named run of frame indices on one node. A strip that is an
// animation in one place and a set of states in another can then say which is
// which, and a consumer can ask for "swing" instead of remembering that the door
// opens over frames 0 to 2.

/** The frames the play head walks: the selected clip, or the whole strip. */
export const clipRun = (node: SpriteBody = activeNode()): number[] =>
  (editor.clip ? clipFrames(node, editor.clip) : null) ?? node.frames.map((_, i) => i);

function setClips(clips: Record<string, number[]>) {
  const names = Object.keys(clips);
  commitNode((n) => ({ ...n, clips: names.length ? clips : undefined }));
  if (editor.clip && !names.includes(editor.clip)) editor.clip = null;
}

/** A new clip starts as the frame you are on — one frame is a state, which is
 *  the commonest kind of clip there is. */
export function addClip(name: string) {
  const key = name.trim();
  const node = activeNode();
  if (!key || node.clips?.[key]) return;
  setClips({ ...(node.clips ?? {}), [key]: [frameNow()] });
  editor.clip = key;
}

export function renameClip(from: string, to: string) {
  const key = to.trim();
  const existing = activeNode().clips;
  if (!key || !existing?.[from] || existing[key]) return;
  const wasPlaying = editor.clip === from;
  // Rebuilt in order rather than deleted and re-added: the map's order is the
  // order the editor and a consumer list them in.
  setClips(
    Object.fromEntries(Object.entries(existing).map(([k, v]) => (k === from ? [key, v] : [k, v]))),
  );
  if (wasPlaying) editor.clip = key;
}

export function removeClip(name: string) {
  const existing = activeNode().clips;
  if (!existing?.[name]) return;
  setClips(Object.fromEntries(Object.entries(existing).filter(([k]) => k !== name)));
}

/** Reorder the clips. The map's order is the file's, and the file's order is
 *  what the editor and every consumer list them in — an edit, not a view. */
export function moveClip(name: string, to: number) {
  const entries = Object.entries(activeNode().clips ?? {});
  const from = entries.findIndex(([k]) => k === name);
  if (from < 0 || to < 0 || to >= entries.length || from === to) return;
  const next = [...entries];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  setClips(Object.fromEntries(next));
}

/** Replace a clip's run. An empty run drops the clip: a name that plays nothing
 *  is a name that means nothing. */
export function setClipFrames(name: string, frames: number[]) {
  const existing = activeNode().clips;
  if (!existing?.[name]) return;
  if (!frames.length) return removeClip(name);
  setClips({ ...existing, [name]: frames });
}

/** Put a frame at the end of a clip — the one you are on unless said otherwise.
 *  Repeats are legal and mean a hold, so appending twice is how a pause is
 *  written. */
export function appendToClip(name: string, at: number = frameNow()) {
  const list = activeNode().clips?.[name];
  if (list) setClipFrames(name, [...list, at]);
}

// ---------- parts ----------
//
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

/** The node above the active one. */
export const parentNode = (): SpriteBody | null =>
  editor.path.length ? nodeAt(editor.sprite, editor.path.slice(0, -1)) : null;

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
        : { ...n, palette: { ...n.palette, [ch]: hex } },
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
      pathKey(path) === me ? n : { ...n, palette: { ...n.palette, ...mine } },
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
