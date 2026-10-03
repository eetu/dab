import {
  allCells,
  cloneSprite,
  fitRows,
  hingeRows,
  insertFrames,
  levelOf,
  nodeAt,
  readStamp,
  resizeSprite,
  rotateRows,
  setPixels,
  type SpriteFile,
  stampCells,
  stampRows,
  TRANSPARENT,
  unusedChars,
  withNode,
} from "dab-core";
import { SvelteMap } from "svelte/reactivity";

import { closeMenu } from "../menu.svelte";
import { commitOver } from "./history.svelte";
import { dropFloat, hasSelection, holdFloat, selection, setSelection } from "./selection.svelte";
import { editor } from "./state.svelte";
import { activeNode, blocked, frameNow, rowsNow } from "./tree.svelte";

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
/** Which way the art turns. `z` is the picture plane — a wheel spinning. `y`
 *  and `x` are HINGES, out of the plane: a door swinging open, a bonnet lifting.
 *  Those foreshorten rather than rotate, which is a different sampler. */
export type Axis = "z" | "y" | "x";

export const turning = $state({
  on: false,
  /** Degrees clockwise for `z`, degrees open for a hinge. */
  angle: 0,
  axis: "z" as Axis,
  /** The hinge line, in the ACTIVE node's pixels: a column for `y`, a row for
   *  `x`. Meaningless for `z`, which turns about a centre instead. */
  hinge: 0,
  /** How many frames Apply writes, stepping from where the art is now to the
   *  angle on the dial. 1 is a single turn, which is what this mode always was. */
  frames: 1,
  /** The frames this session has given an angle to — what the strip marks, so
   *  walking back along it says which ones are already turned. */
  marked: [] as number[],
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
  // One mode at a time: a turn previews on the frame you are editing, and the
  // play head would keep replacing it with the next one.
  editor.playing = false;
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
  turning.axis = "z";
  turning.frames = 1;
  turning.marked = [];
  dials = new SvelteMap();
  // The near edge of what is turning: a door is hinged at one of its sides, and
  // that is where the handle starts. Dragged from there.
  turning.hinge = source.x;
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

/** Swap axes. The angle goes back to zero: 60° about a hinge and 60° in the
 *  plane are different pictures, and carrying the number over shows one while
 *  the dial says the other. */
export function setAxis(axis: Axis) {
  if (!turning.on || !source) return;
  turning.axis = axis;
  turning.angle = 0;
  turning.hinge = axis === "x" ? source.y : source.x;
  showTurn();
}

/** Where the hinge line sits, in the active node's pixels. Clamped to the box
 *  it is hinging: a hinge outside the art turns it inside out. */
export function setHinge(at: number) {
  if (!turning.on || !source) return;
  const lo = turning.axis === "x" ? source.y : source.x;
  const hi = lo + (turning.axis === "x" ? source.h : source.w);
  turning.hinge = Math.max(lo, Math.min(hi, Math.round(at)));
  showTurn();
}

/** How many frames Apply writes. A run turns the WHOLE node: a selection is
 *  floating, and there is no sense in which a float has frames of its own. */
export function setTurnFrames(n: number) {
  if (!turning.on) return;
  // Nor does a level: a run inserts frames, and the other sizes would only
  // get copies — the run belongs on the sprite, where every size steps with it.
  const runs = turning.whole && levelOf(editor.path) === null;
  turning.frames = runs ? Math.max(1, Math.min(24, Math.round(n))) : 1;
  showTurn();
}

/**
 * One angle, sampled from a pristine source against a given palette.
 *
 * The axis picks the sampler, and they are different operations rather than one
 * with a flag: `z` turns the art in the picture plane and needs the corners the
 * box did not have, while a hinge foreshortens it about a line and never needs
 * a pixel more than it started with.
 */
const sampleTurn = (
  angle: number,
  palette: Record<string, string>,
  rows = source!.rows,
  // The bar's own dial by default, one frame's remembered dial when a session
  // is redrawing the others.
  dial: Dial = turning,
) => {
  const s = source!;
  if (dial.axis === "z") {
    return rotateRows(rows, palette, angle, { samples: dial.smooth, grow: true });
  }
  return hingeRows(rows, palette, angle, {
    axis: dial.axis,
    // The block's own coordinates: a selection's hinge is a column of the node.
    hinge: dial.hinge - (dial.axis === "x" ? s.y : s.x),
    samples: dial.smooth,
  });
};

/**
 * A turn is a session over FRAMES, not one shot at one of them.
 *
 * A door swings over the four frames it is drawn on, and the angles are not the
 * same four. So the mode stays open while you walk the strip: each frame keeps
 * the dial it was left at, the preview shows all of them at once, and Apply puts
 * the whole session down as one undo entry. What is remembered is the DIAL, not
 * the pixels — every frame re-samples the pristine art at every redraw, which is
 * the same rule one frame always followed, now said in the plural.
 */
type Dial = { angle: number; axis: Axis; hinge: number; smooth: number };
let dials = new SvelteMap<number, Dial>();

/** The dial for the frame being edited, created at zero the first time it is
 *  visited — visiting a frame is not yet turning it. */
function dialNow(): Dial {
  const at = frameNow();
  let d = dials.get(at);
  if (!d) {
    d = { angle: 0, axis: turning.axis, hinge: turning.hinge, smooth: turning.smooth };
    dials.set(at, d);
  }
  return d;
}

/** Keep the bar and the dial for this frame in step, both ways. */
function syncDial() {
  const d = dialNow();
  d.angle = turning.angle;
  d.axis = turning.axis;
  d.hinge = turning.hinge;
  d.smooth = turning.smooth;
  turning.marked = [...dials].filter(([, v]) => v.angle !== 0).map(([i]) => i);
}

/**
 * Move the session to another frame, keeping what the others were left at.
 *
 * The strip calls this instead of setting `editor.frame`, because the mode owns
 * the surface while it is open: a bare frame change would leave the preview of
 * one frame's turn drawn on another's art.
 */
export function turnFrame(at: number) {
  if (!turning.on || !turning.whole || turning.frames > 1) return;
  const node = activeNode();
  if (at < 0 || at >= node.frames.length) return;
  syncDial();
  editor.frame = at;
  const d = dialNow();
  turning.angle = d.angle;
  turning.axis = d.axis;
  turning.hinge = d.hinge;
  turning.smooth = d.smooth;
  showTurn();
}

/** The angles a run would write, in order — the dial is the LAST of them, and
 *  the frame you are on is the first, which is why it is not in the list. */
const runAngles = () =>
  Array.from({ length: turning.frames }, (_, i) => (turning.angle * (i + 1)) / turning.frames);

/** Every step of a run, each sampled from the pristine source against the
 *  palette the step before it grew. That threading is the whole economy of the
 *  thing: step two asks for blends step one already paid for. */
function runSteps() {
  let palette = source!.palette;
  return runAngles().map((deg) => {
    const r = sampleTurn(deg, palette);
    palette = r.palette;
    return r;
  });
}

/** Redraw the preview. Nothing here commits: the document is rebuilt from the
 *  pristine `before` every time, so cancelling is just letting go. */
function showTurn() {
  if (!source || !turning.on) return;
  syncDial();
  if (turning.whole && turning.frames === 1) return showTurnedFrames();
  const r = sampleTurn(turning.angle, source.palette);
  // What the whole run would cost, not what this one frame costs: the number is
  // there to be read before Apply, and Apply writes the run.
  turning.added =
    turning.frames > 1
      ? Object.keys(runSteps()[turning.frames - 1].palette).length -
        Object.keys(source.palette).length
      : r.added.length;
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

/**
 * The preview of a whole-node session: every frame that has been given an angle,
 * each sampled from the art it started as.
 *
 * The palette is threaded through the frames in order, so the second frame of a
 * swing asks for blends the first one already paid for — the same economy a run
 * of generated frames gets, for the same reason.
 */
function showTurnedFrames() {
  const s = source!;
  const pristine = nodeAt(s.before, editor.path)?.frames ?? [];
  let palette = s.palette;
  // A plain record, not a Map: this one is built and read inside this call, so
  // nothing about it needs to be reactive.
  const turned: Record<number, { rows: string[]; w: number; h: number }> = {};
  for (const [at, d] of [...dials].sort(([a], [b]) => a - b)) {
    const rows = pristine[at];
    if (!rows || d.angle === 0) continue;
    const r = sampleTurn(d.angle, palette, rows, d);
    palette = r.palette;
    turned[at] = { rows: r.rows, w: r.w, h: r.h };
  }
  turning.added = Object.keys(palette).length - Object.keys(s.palette).length;

  // The box holds the widest turn of the lot, and every other frame is padded
  // into it — never cropped, so turning frame 2 cannot trim frame 1.
  const all = Object.values(turned);
  const W = Math.max(s.w, ...all.map((t) => t.w));
  const H = Math.max(s.h, ...all.map((t) => t.h));
  let next = withNode(s.before, editor.path, (n) => ({
    ...resizeSprite(n, W, H, "center"),
    palette,
    frames: n.frames.map((f, i) => {
      const t = turned[i];
      return t ? fitRows(t.rows, t.w, t.h, W, H) : fitRows(f, n.w, n.h, W, H);
    }),
  }));
  // A part keeps its CENTRE as the box grows, or the art orbits its own corner.
  const dx = Math.round((W - s.w) / 2);
  const dy = Math.round((H - s.h) / 2);
  if (editor.path.length && (dx || dy)) {
    const name = editor.path[editor.path.length - 1];
    next = withNode(next, editor.path.slice(0, -1), (n) => ({
      ...n,
      parts: n.parts?.map((p) => (p.name === name ? { ...p, x: p.x - dx, y: p.y - dy } : p)),
    }));
  }
  editor.sprite = next;
}

/**
 * Write the turn as a RUN of frames: the art where it stands, then one frame
 * per step up to the dial, with an animation naming them.
 *
 * The frames are the point of the mode for a door or a wheel — closed to open in
 * four, rather than four turns of the same block done by hand — and a run of
 * frames nobody named is the next three clicks. Every step samples the pristine
 * source, so the last frame is as clean as the first.
 */
function applyTurnRun() {
  const s = source!;
  const steps = runSteps();
  const pal = steps[steps.length - 1].palette;
  // A turn in the plane needs the corners; a hinge never grows. Either way the
  // box holds the WIDEST step, and the other frames are padded, never cropped.
  const W = Math.max(s.w, ...steps.map((r) => r.w));
  const H = Math.max(s.h, ...steps.map((r) => r.h));
  const at = frameNow();

  let next = withNode(s.before, editor.path, (n) => ({
    ...resizeSprite(n, W, H, "center"),
    palette: pal,
  }));
  // A part keeps its CENTRE as the box grows, the same walk a single turn does.
  const dx = Math.round((W - s.w) / 2);
  const dy = Math.round((H - s.h) / 2);
  if (editor.path.length && (dx || dy)) {
    const name = editor.path[editor.path.length - 1];
    next = withNode(next, editor.path.slice(0, -1), (n) => ({
      ...n,
      parts: n.parts?.map((p) => (p.name === name ? { ...p, x: p.x - dx, y: p.y - dy } : p)),
    }));
  }
  next = withNode(next, editor.path, (n) =>
    insertFrames(
      n,
      at,
      steps.map((r) => fitRows(r.rows, r.w, r.h, W, H)),
    ),
  );

  const taken = new Set(Object.keys(nodeAt(next, editor.path)?.animations ?? {}));
  let name = turning.axis === "z" ? "spin" : "swing";
  for (let i = 2; taken.has(name); i++) name = `${turning.axis === "z" ? "spin" : "swing"} ${i}`;
  next = withNode(next, editor.path, (n) => ({
    ...n,
    animations: {
      ...(n.animations ?? {}),
      [name]: [at, ...steps.map((_, i) => at + 1 + i)],
    },
  }));

  commitOver(s.before, next);
  const added = Object.keys(pal).length - Object.keys(s.palette).length;
  endTurn();
  // Selected, so the lane is lit and P plays the thing that was just made.
  editor.animation = name;
  editor.status =
    `${steps.length} frame${steps.length > 1 ? "s" : ""} · ${name}` +
    (added ? ` — ${added} colour${added > 1 ? "s" : ""} added` : "");
  editor.statusBad = false;
}

/** Put the turn down. One undo entry covers the whole session at the dial. */
export function applyTurn() {
  if (!source || !turning.on) return;
  if (turning.whole && turning.frames > 1) return applyTurnRun();
  const next = editor.sprite;
  const { base, x, y, w, h, before } = source;
  commitOver(before, next);
  if (base) {
    // Hand it to the float, so a turn can be shoved into place without a second
    // undo entry — and so the hole it was lifted from stays open until it lands.
    const r = sampleTurn(turning.angle, source.palette);
    const bx = x + Math.round((w - r.w) / 2);
    const by = y + Math.round((h - r.h) / 2);
    const stamp = readStamp(r.rows, allCells(r.w, r.h));
    holdFloat({ stamp, base, x: bx, y: by, frame: frameNow() });
    setSelection(
      stamp.cells
        .filter((c) => c.ch !== TRANSPARENT)
        .map((c) => [bx + c.dx, by + c.dy] as [number, number]),
    );
  }
  const added = turning.added;
  // How many frames this session actually turned: a door swung over four of them
  // is one gesture, and the bar should say so rather than "rotated".
  const spun = turning.marked.length;
  endTurn();
  // The aftermath, said out loud. A second spin of the same pixels replaces the
  // last spin's blends and orphans them — the palette menu can sweep those, but
  // only if you know they are there.
  const dead = unusedChars(activeNode()).length;
  editor.status =
    `turned${spun > 1 ? ` ${spun} frames` : ""}${added ? ` — ${added} colour${added > 1 ? "s" : ""} added` : ""}` +
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

export function endTurn() {
  source = null;
  dials = new SvelteMap();
  turning.on = false;
  turning.angle = 0;
  turning.added = 0;
  turning.axis = "z";
  turning.frames = 1;
  turning.marked = [];
}
