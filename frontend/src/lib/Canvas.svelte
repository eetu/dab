<script lang="ts">
  // The drawing surface: one canvas, nearest-neighbour, plus a live preview of
  // the shape being dragged so a rectangle can be placed before it is painted.
  //
  // Drawn rather than laid out as DOM cells. A 72×18 sprite is 1296 cells and a
  // div per cell is survivable, but the sprites this tool exists for are the
  // ones that grow, and a canvas costs the same at any size.
  //
  // The gesture vocabulary is nib's, because these are the same hands: pinch to
  // zoom, two-finger scroll to pan, ⌘/ctrl-wheel to zoom at the cursor, space or
  // middle-drag to pan, and a plain drag paints. Two fingers down means the
  // gesture belongs to the viewport, so a pinch never leaves a stray pixel.
  import { cellColour, isPartRef, shapePoints, type SpriteBody, TRANSPARENT } from "dab-core";

  import {
    activeNode,
    activeRef,
    beginTurn,
    clearSelection,
    clipboard,
    copySelection,
    cutSelection,
    deleteSelection,
    editor,
    fillAt,
    flipSelection,
    floating,
    frameOf,
    gesture,
    hasSelection,
    isSelected,
    nodeOrigin,
    nudgeSelection,
    paint,
    partAt,
    pasteClipboard,
    pathKey,
    pickAt,
    placePart,
    readOnly,
    resolvePart,
    selectAll,
    selectBox,
    selection,
    selectNode,
    selectShapeAt,
    setTurn,
    stageBox,
    strokePoints,
    turning,
    undoEdit,
  } from "./editor.svelte";
  import { type MenuItem, openMenu, typing } from "./menu.svelte";
  import { panels } from "./panels.svelte";
  import { openPartDialog } from "./partdialog.svelte";
  import { paintAssembly, paintRows } from "./render";
  import RotateBar from "./RotateBar.svelte";
  import { type Backdrop, cell, fit, panBy, viewport, zoomBy } from "./viewport.svelte";

  let { backdrop = "checker" as Backdrop }: { backdrop?: Backdrop } = $props();

  let pane: HTMLDivElement | null = $state(null);
  let canvas: HTMLCanvasElement | null = $state(null);
  let drag: { x: number; y: number } | null = $state(null);
  let hover: { x: number; y: number } | null = $state(null);
  let shift = $state(false);
  let alt = $state(false);
  let space = $state(false);
  let panning = $state(false);
  /** The box being dragged out by the select tool, before it becomes a selection. */
  let marquee: { from: { x: number; y: number }; to: { x: number; y: number } } | null =
    $state(null);
  /** A drag that is carrying the selection. `last` is where the block was when
   *  the pointer last crossed a cell boundary, so travel is whole cells only. */
  let moving: { last: { x: number; y: number } } | null = $state(null);
  /** A drag that is carrying a whole PART by its placement. `origin` is where
   *  the part sat when the drag began, so the whole drag is one undo entry the
   *  way a stroke is. */
  let placing: {
    path: string[];
    from: { x: number; y: number };
    at: { x: number; y: number };
    fresh: boolean;
  } | null = $state(null);
  let flashOn = $state(false);

  // A fresh selection flashes: on a dense sprite a one-pixel dashed outline is
  // easy to miss, and "did that click select what I meant?" is the question the
  // tool has to answer instantly.
  $effect(() => {
    if (!selection.flash) return;
    flashOn = true;
    const t = setTimeout(() => (flashOn = false), 180);
    return () => clearTimeout(t);
  });

  const sprite = $derived(editor.sprite);
  const px = $derived(cell());

  /** The whole assembly's box, in the sprite's coordinates. The canvas covers
   *  this rather than the sprite's own grid, so a part hanging off an edge is
   *  visible instead of cropped out of the view it is being drawn in. */
  const box = $derived(stageBox());
  /**
   * Whether the node being edited is one of the hidden ones.
   *
   * Everything the canvas draws for the ACTIVE node — its onion skin, the
   * selection tint, the marching ants, the box outline, a shape being dragged —
   * is drawn beside the assembly rather than inside it, so none of it noticed
   * that the node was hidden. Hiding a part left its ghost on the screen.
   *
   * A borrowed part keeps its BOX, because that is what says it is selected and
   * what you are about to move — but none of the pixel furniture, because it has
   * no pixels of its own to select.
   */
  const nodeHidden = $derived(!!editor.hidden[pathKey(editor.path)]);
  /** Selected, but borrowed: there is a box to show and nothing to draw in it. */
  const borrowed = $derived(!!activeRef());
  /** Whether the canvas should draw the furniture that is about PIXELS — the
   *  onion skin, the ants, the selection tint. A borrowed part has none. */
  const drawable = $derived(!nodeHidden && !borrowed);
  /** The node being edited, and where its top-left sits on that canvas. */
  const node = $derived(activeNode());
  const origin = $derived.by(() => {
    const o = nodeOrigin(editor.path);
    return { x: o.x - box.x, y: o.y - box.y };
  });

  // Live pointers, so two fingers can be told from one. Screen coordinates,
  // relative to the pane.
  let pointers: { id: number; x: number; y: number }[] = [];
  let pinch: { dist: number; mx: number; my: number } | null = null;

  const at = (e: PointerEvent | WheelEvent | { clientX: number; clientY: number }) => {
    const r = pane?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };

  function setPointer(id: number, p: { x: number; y: number }) {
    const found = pointers.find((q) => q.id === id);
    if (found) {
      found.x = p.x;
      found.y = p.y;
    } else pointers.push({ id, ...p });
  }

  function pinchState() {
    const [a, b] = pointers;
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  }

  /** Pointer position in the canvas's own pixels. Floor, not round: the pixel
   *  under the cursor is the one you are pointing at, not the nearest boundary. */
  function stageAt(e: PointerEvent): { x: number; y: number } | null {
    const el = canvas;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * box.w);
    const y = Math.floor(((e.clientY - r.top) / r.height) * box.h);
    return x >= 0 && y >= 0 && x < box.w && y < box.h ? { x, y } : null;
  }

  /** Pointer position in the ACTIVE node's own pixels, or null when it is
   *  outside that node — where the painting tools have nothing to write to. */
  function cellAt(e: PointerEvent): { x: number; y: number } | null {
    const p = stageAt(e);
    if (!p) return null;
    const x = p.x - origin.x;
    const y = p.y - origin.y;
    return x >= 0 && y >= 0 && x < node.w && y < node.h ? { x, y } : null;
  }

  const isBlank = (rows: string[]) => rows.every((r) => !/[^.]/.test(r));

  /** The deepest part under a stage pixel that has something drawn there, or
   *  `[]` for the sprite itself. Clicking the thing you want to draw on is the
   *  loop, so this answers "which node did that click mean?".
   *
   *  A part with nothing in the frame it is showing is hit by its whole BOX
   *  instead. A blank part draws no pixels, so by the pixel rule it could never
   *  be clicked at all — and a part you have just added is blank by definition.
   *  It does swallow clicks on whatever is under it, which is the trade: that
   *  lasts exactly until you draw the first pixel in it. */
  function nodeUnder(at: { x: number; y: number }): string[] | null {
    let best: string[] | null = null;
    const walk = (n: SpriteBody, ox: number, oy: number, path: string[]) => {
      const rows = n.frames[frameOf(path, n)] ?? [];
      const x = at.x - ox;
      const y = at.y - oy;
      const inside = x >= 0 && y >= 0 && x < n.w && y < n.h;
      // You cannot click what is not drawn — but its children are still there.
      if (inside && !editor.hidden[pathKey(path)]) {
        if (isBlank(rows) ? path.length > 0 : rows[y]?.[x] !== TRANSPARENT) best = path;
      }
      for (const p of n.parts ?? []) {
        const sub = [...path, p.name];
        const child = isPartRef(p) ? resolvePart(p.use) : p;
        if (!child) continue;
        // A borrowed part is a leaf, so it is hit-tested but not descended into.
        if (isPartRef(p)) {
          if (editor.hidden[pathKey(sub)]) continue;
          const rows = child.frames[frameOf(sub, child)] ?? [];
          const cx = at.x - ox - p.x;
          const cy = at.y - oy - p.y;
          if (cx >= 0 && cy >= 0 && cx < child.w && cy < child.h) {
            if (isBlank(rows) || rows[cy]?.[cx] !== TRANSPARENT) best = sub;
          }
          continue;
        }
        walk(p, ox + p.x, oy + p.y, sub);
      }
    };
    walk(sprite, -box.x, -box.y, []);
    return best;
  }

  /**
   * Parts showing an empty frame, as boxes on the stage.
   *
   * Without this a part you have just added is invisible: it has no pixels yet,
   * so there is nothing to see and nothing to aim at. The box says where it is
   * and how big it is, which is what you need before the first pixel goes in.
   */
  const ghosts = $derived.by(() => {
    const out: { key: string; x: number; y: number; w: number; h: number }[] = [];
    const walk = (n: SpriteBody, ox: number, oy: number, path: string[]) => {
      for (const p of n.parts ?? []) {
        const sub = [...path, p.name];
        const key = pathKey(sub);
        const child = isPartRef(p) ? resolvePart(p.use) : p;
        if (!child) continue;
        if (!editor.hidden[key] && isBlank(child.frames[frameOf(sub, child)] ?? [])) {
          out.push({ key, x: ox + p.x, y: oy + p.y, w: child.w, h: child.h });
        }
        if (!isPartRef(p)) walk(p, ox + p.x, oy + p.y, sub);
      }
    };
    walk(sprite, -box.x, -box.y, []);
    return out;
  });

  const isShape = (t: string) => t === "line" || t === "rect" || t === "ellipse";

  function down(e: PointerEvent) {
    setPointer(e.pointerId, at(e));
    // A second finger takes the gesture away from the tools: abort whatever the
    // first one was drawing rather than finishing it under a pinch.
    if (pointers.length >= 2) {
      drag = null;
      if (pointers.length === 2) pinch = pinchState();
      return;
    }
    // A turn in progress owns the canvas — every tool would be writing to a
    // document about to be rebuilt at the next angle. BEFORE the capture:
    // capturing here stole the pointer from anything floating over the pane,
    // which is what killed the rotate bar's buttons. Panning stays available,
    // and takes its own capture below.
    if (turning.on && !space && e.button !== 1) return;
    // Capture so a stroke that leaves the canvas still ends on this element.
    // Guarded: a pointer id the browser doesn't know — a synthetic event from a
    // test, or a device that has already released — throws here, and an
    // exception at the top of the handler swallows the whole stroke.
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* not a live pointer; the stroke still works, it just isn't captured */
    }
    if (space || e.button === 1) {
      panning = true;
      return;
    }
    if (e.button !== 0) return;
    shift = e.shiftKey;
    alt = e.altKey;
    // Move carries a whole PART. Its own tool because the select tool already
    // moves something — a block of pixels — and one drag meaning two different
    // things depending on what is under it is exactly the confusion this had.
    // It is also the only way to pick up a borrowed part, which has no pixels
    // of its own to select.
    if (editor.tool === "move") {
      const s = stageAt(e);
      if (!s) return;
      const found = nodeUnder(s);
      if (!found?.length) {
        if (found) selectNode(found);
        return;
      }
      selectNode(found);
      placing = { path: found, from: s, at: s, fresh: true };
      return;
    }
    // Select reaches the whole assembly: clicking the thing you want to draw on
    // is the loop, and a click that lands on another part means that part. Every
    // other tool is confined to the active node, so a stray click on the body
    // while drawing a door does nothing rather than painting the wrong grid.
    if (editor.tool === "select") {
      const s = stageAt(e);
      if (!s) return;
      const found = nodeUnder(s);
      if (found && pathKey(found) !== pathKey(editor.path)) {
        selectNode(found);
        return;
      }
    }
    const p = cellAt(e);
    if (!p) {
      // Outside the node with the select tool: a click on nothing is "never mind".
      if (editor.tool === "select") selectShapeAt(-1, -1);
      return;
    }
    // Painting on something you cannot see is how a stroke ends up on the wrong
    // node without anyone noticing. Say so rather than swallowing it.
    if (nodeHidden) {
      editor.status = `${editor.path.join("/")} is hidden — show it to draw on it`;
      return;
    }
    // ⌥ over a brush takes the colour and leaves the tool where it was — the
    // pick is the one thing you want mid-stroke, and switching to the picker to
    // get it costs two keys and your place. Select keeps ⌥ for subtract.
    if (alt && editor.tool !== "select") return pickAt(p.x, p.y);
    if (editor.tool === "picker") return pickAt(p.x, p.y);
    if (editor.tool === "fill") return fillAt(p.x, p.y);
    if (editor.tool === "select") {
      // Inside an existing selection the drag carries it; anywhere else it
      // starts a new box. Same button, and where you press says which you meant.
      if (hasSelection() && isSelected(p.x, p.y)) moving = { last: p };
      else marquee = { from: p, to: p };
      gesture.abort = abortGesture;
      return;
    }
    drag = p;
    gesture.abort = abortGesture;
    if (!isShape(editor.tool)) {
      paint([[p.x, p.y]], true);
      committed = true;
    }
  }

  /** Whether the gesture in progress has already written to the document — a
   *  stroke paints from its first point, a carry commits on its first cell of
   *  travel, a shape only commits on release. Decides what aborting undoes. */
  let committed = false;

  // ---------- the rotation handle ----------
  //
  // A dot on an arm, hung off the turn's pivot — dragging it is how every
  // transform tool says "rotate me", and the bar's slider was the only way in.
  // 0° points the arm up; clockwise follows the drag.

  /** Pivot and handle tip in STAGE pixels (CSS px inside the stage box). */
  const pivotPx = $derived({
    x: (origin.x + turning.cx) * px,
    y: (origin.y + turning.cy) * px,
  });
  const armPx = $derived(Math.max(turning.r * px, 40));
  const handlePx = $derived.by(() => {
    const rad = ((turning.angle - 90) * Math.PI) / 180;
    return { x: pivotPx.x + armPx * Math.cos(rad), y: pivotPx.y + armPx * Math.sin(rad) };
  });
  const snapped = $derived(turning.on && turning.angle % 90 === 0);

  /** Freehand snaps to the quarters, ⌘ glides past them — the same bargain the
   *  resize dialog's guides strike, said with the same accent when it bites. */
  const SNAP_DEG = 7;
  function dragHandle(e: PointerEvent) {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer — the drag still works, it just isn't captured */
    }
    const rect = canvas!.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const sx = ((ev.clientX - rect.left) / rect.width) * box.w;
      const sy = ((ev.clientY - rect.top) / rect.height) * box.h;
      const dx = sx - (origin.x + turning.cx);
      const dy = sy - (origin.y + turning.cy);
      if (!dx && !dy) return;
      let deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI) + 90;
      if (deg > 180) deg -= 360;
      if (!ev.metaKey && !ev.ctrlKey) {
        const near = Math.round(deg / 90) * 90;
        if (Math.abs(deg - near) <= SNAP_DEG) deg = near === -180 ? 180 : near;
      }
      setTurn(deg);
    };
    move(e);
    const el = e.currentTarget as HTMLElement;
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  /**
   * Abandon the drag in progress — the first rung of the app's Escape ladder.
   *
   * A gesture is one undo entry however far it has travelled, so aborting one
   * that has already written is exactly one undo; one that has not (a marquee
   * being dragged out, a shape still previewing) just lets go of its state. The
   * only exit a wrong rectangle used to have was finish-then-undo.
   */
  function abortGesture() {
    if (committed) undoEdit();
    drag = null;
    marquee = null;
    moving = null;
    placing = null;
    committed = false;
    gesture.abort = null;
  }

  function move(e: PointerEvent) {
    if (pointers.some((q) => q.id === e.pointerId)) setPointer(e.pointerId, at(e));
    if (pinch && pointers.length >= 2) {
      const next = pinchState();
      if (pinch.dist > 0) zoomBy(next.dist / pinch.dist, { x: next.mx, y: next.my });
      panBy(next.mx - pinch.mx, next.my - pinch.my);
      pinch = next;
      return;
    }
    if (panning) {
      panBy(e.movementX, e.movementY);
      return;
    }
    if (placing) {
      const s = stageAt(e);
      if (!s || (s.x === placing.at.x && s.y === placing.at.y)) return;
      const part = partAt(placing.path);
      if (part) {
        placePart(
          placing.path,
          { x: part.x + s.x - placing.at.x, y: part.y + s.y - placing.at.y },
          placing.fresh,
        );
        committed = true;
      }
      placing = { ...placing, at: s, fresh: false };
      return;
    }
    const p = cellAt(e);
    hover = p;
    shift = e.shiftKey;
    alt = e.altKey;
    if (moving && p) {
      if (p.x !== moving.last.x || p.y !== moving.last.y) committed = true;
      nudgeSelection(p.x - moving.last.x, p.y - moving.last.y);
      moving.last = p;
      return;
    }
    if (marquee && p) {
      marquee = { from: marquee.from, to: p };
      return;
    }
    if (!drag || !p) return;
    if (isShape(editor.tool)) return; // preview only until release
    // Join to the previous cell: a fast drag skips pixels otherwise, and a
    // dotted line is the classic tell of a per-event paint.
    paint(strokePoints("line", drag, p, false), false);
    drag = p;
  }

  function up(e: PointerEvent) {
    pointers = pointers.filter((q) => q.id !== e.pointerId);
    if (pointers.length < 2) pinch = null;
    panning = false;
    committed = false;
    gesture.abort = null;
    const p = cellAt(e) ?? hover;
    if (placing) {
      placing = null;
      return;
    }
    if (moving) {
      moving = null;
      return;
    }
    if (marquee) {
      const end = p ?? marquee.to;
      // A press that never left its cell is a click, and a click picks the shape
      // under it. Anything with travel in it is the box it drew.
      if (end.x === marquee.from.x && end.y === marquee.from.y) selectShapeAt(end.x, end.y);
      else selectBox(marquee.from, end, e.altKey);
      marquee = null;
      return;
    }
    if (drag && p && isShape(editor.tool)) paint(strokePoints(editor.tool, drag, p, shift), true);
    drag = null;
  }

  /**
   * What a right-click on the canvas offers.
   *
   * Everything here already worked from the keyboard and none of it was
   * findable — cut, copy and paste have been on ⌘X/C/V since the selection
   * existed, and pulling a selection out into a part was behind a dialog in
   * another panel. A menu at the pointer is where a person looks for them.
   */
  function canvasMenu(e: MouseEvent) {
    // The rotate bar's degree field lives inside this pane: a text field keeps
    // the browser's menu even here.
    if (typing(e.target)) return;
    // The turn owns the canvas, and every item here would act on a preview.
    if (turning.on) {
      e.preventDefault();
      return;
    }
    const s = stageAt(e as unknown as PointerEvent);
    // The surround: at low zoom most of the pane is outside the stage box, and
    // the verbs that need no cell still apply there.
    if (!s) {
      const name = editor.path.length ? editor.path.join("/") : editor.sprite.name;
      const why = readOnly();
      openMenu(e, name, [
        { label: "Select all", disabled: !!why, run: selectAll },
        {
          label: `Rotate ${name}…`,
          hint: "grows to fit",
          disabled: !!why,
          run: () => beginTurn(true),
        },
        { kind: "separator" },
        { label: "Fit to window", hint: "0", run: () => fit(box.w, box.h) },
        ...(hasSelection() ? [{ label: "Deselect", run: clearSelection } satisfies MenuItem] : []),
      ]);
      return;
    }
    const p = { x: s.x - origin.x, y: s.y - origin.y };
    const inside = p.x >= 0 && p.y >= 0 && p.x < node.w && p.y < node.h;
    const where = editor.path.length ? editor.path.join("/") : editor.sprite.name;
    const why = readOnly();
    const items: MenuItem[] = [];

    if (hasSelection()) {
      const size = `${selection.x1 - selection.x0 + 1}×${selection.y1 - selection.y0 + 1}`;
      items.push(
        { label: "Cut", hint: why ? undefined : size, disabled: !!why, run: cutSelection },
        { label: "Copy", hint: size, run: copySelection },
      );
    }
    if (clipboard.stamp?.cells.length) {
      items.push({
        label: hasSelection() ? "Paste" : "Paste here",
        hint: why ? undefined : `${clipboard.stamp.w}×${clipboard.stamp.h}`,
        disabled: !!why || !inside,
        run: () => pasteClipboard(inside ? p : undefined),
      });
    }
    if (hasSelection()) {
      items.push({
        label: "Delete",
        disabled: !!why,
        danger: true,
        run: deleteSelection,
      });
      items.push({ kind: "separator" });
      items.push({ label: "Flip horizontal", disabled: !!why, run: () => flipSelection("h") });
      items.push({ label: "Flip vertical", disabled: !!why, run: () => flipSelection("v") });
      items.push({ label: "Rotate…", disabled: !!why, run: () => beginTurn(false) });
      items.push({
        label: "New part from this…",
        disabled: !!why,
        run: openPartDialog,
      });
      items.push({ kind: "separator" });
      items.push({ label: "Deselect", run: clearSelection });
    } else {
      items.push({ label: "Select all", disabled: !!why, run: selectAll });
      items.push({
        label: `Rotate ${where}…`,
        hint: "grows to fit",
        disabled: !!why,
        run: () => beginTurn(true),
      });
      // No selection, so offer the thing under the cursor instead.
      const found = nodeUnder(s);
      if (found && pathKey(found) !== pathKey(editor.path)) {
        items.push({ kind: "separator" });
        items.push({
          label: `Select ${found.join("/") || editor.sprite.name}`,
          run: () => selectNode(found),
        });
      }
    }
    if (why) items.push({ kind: "separator" }, { label: why, disabled: true, run: () => {} });
    openMenu(e, where, items);
  }

  /** A cancelled pointer (an OS gesture taking over, a lost capture) must not
   *  commit, and must not leave a stale finger wedging a phantom pinch. */
  function cancel(e: PointerEvent) {
    pointers = pointers.filter((q) => q.id !== e.pointerId);
    if (pointers.length < 2) pinch = null;
    panning = false;
    drag = null;
    marquee = null;
    moving = null;
    placing = null;
    committed = false;
    gesture.abort = null;
  }

  // Chromium and Firefox deliver a trackpad pinch as ctrl+wheel; ⌘/ctrl+wheel is
  // the mouse zoom. A plain wheel — including a two-finger scroll — pans.
  const WHEEL_ZOOM_SENS = 0.01;
  function wheel(e: WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Clamp so one big mouse notch can't jump the whole zoom range.
      const dz = Math.max(-50, Math.min(50, e.deltaY));
      zoomBy(Math.exp(-dz * WHEEL_ZOOM_SENS), at(e));
    } else {
      panBy(-e.deltaX, -e.deltaY);
    }
  }

  // Safari sends a trackpad pinch as WebKit gesture events rather than a
  // ctrl+wheel. `scale` is cumulative since gesturestart, so zoom by the step
  // ratio. Bound through Svelte's event system so the viewport change is
  // flushed to the DOM with the gesture.
  const PINCH_GAIN = 1.6;
  type GestureLike = Event & { scale: number; clientX: number; clientY: number };
  let gestureLast = 1;
  const gestures = {
    ongesturestart: (e: Event) => {
      e.preventDefault();
      gestureLast = (e as GestureLike).scale || 1;
    },
    ongesturechange: (e: Event) => {
      e.preventDefault();
      const g = e as GestureLike;
      if (gestureLast > 0 && g.scale > 0) zoomBy((g.scale / gestureLast) ** PINCH_GAIN, at(g));
      gestureLast = g.scale;
    },
    ongestureend: (e: Event) => e.preventDefault(),
  };

  // Space held = pan, the way every editor with a canvas does it.
  function keydown(e: KeyboardEvent) {
    alt = e.altKey;
    const t = e.target as HTMLElement;
    if (e.code === "Space" && !(t?.tagName === "INPUT" || t?.isContentEditable)) {
      e.preventDefault();
      space = true;
    }
  }
  const keyup = (e: KeyboardEvent) => {
    alt = e.altKey;
    if (e.code === "Space") space = false;
  };

  // A modifier held while the window loses focus never sends its keyup — ⌥-tab
  // away and the canvas would come back armed for a pick it was never asked for.
  const blur = () => {
    alt = false;
    space = false;
  };

  /** Whether a click would sample rather than paint, for the cursor to say so
   *  before the click rather than after it. */
  const picking = $derived(editor.tool === "picker" || (alt && editor.tool !== "select"));

  // Fit on load and on a pane resize — but never once the zoom has been touched
  // by hand, or the view would snap back mid-edit.
  $effect(() => {
    const w = box.w;
    const h = box.h;
    void viewport.paneW;
    void viewport.paneH;
    if (!viewport.manual) fit(w, h);
  });

  $effect(() => {
    const el = canvas;
    if (!el) return;
    el.width = box.w;
    el.height = box.h;
    const g = el.getContext("2d");
    if (!g) return;

    // Track every dependency the paint below reads.
    const prev =
      editor.onion && editor.frame > 0 && drawable ? node.frames[editor.frame - 1] : null;
    const pts = preview;
    const hint = hoverShape;
    const mq = marquee;
    const ink = editor.tool === "eraser" ? TRANSPARENT : editor.ink;
    void editor.variant; // the selected variant changes what every cell looks like
    void panels.underlay;
    void editor.hidden;
    void drawable;
    void borrowed;
    void editor.shown;
    void flashOn; // and the flash changes what the selection looks like

    g.clearRect(0, 0, el.width, el.height);
    // The frame behind, faint: the reason multi-frame sprites line up at all.
    // The active node's own, because that is the strip being drawn.
    if (prev) {
      g.globalAlpha = 0.28;
      paintRows(g, prev, node, origin.x, origin.y, editor.variant);
      g.globalAlpha = 1;
    }
    paintAssembly(g, sprite, -box.x, -box.y, paintOpts);
    // Preview sits on top at full strength — it is about to be real.
    if (pts.length && drawable) {
      g.globalAlpha = 0.75;
      g.fillStyle =
        ink === TRANSPARENT ? "#ffffff" : (cellColour(node, ink, editor.variant) ?? "#ffffff");
      for (const [x, y] of pts) g.fillRect(origin.x + x, origin.y + y, 1, 1);
      g.globalAlpha = 1;
    }

    // The selection, drawn as tinted CELLS rather than as an outline: a flood
    // selection is rarely box-shaped, and the outline of its bounds would claim
    // it holds pixels it does not. The bounds get a dashed frame in the DOM on
    // top of this, which is what makes the extent readable at low zoom.
    // What a click would take, before it takes it. Fainter than the selection
    // itself by a wide margin: this is a hint, and it moves with every pixel of
    // cursor travel, so it has to stay out of the way of the art.
    // Cool rather than white, so a hover is never mistaken for a selection: one
    // is what you would get, the other is what you have.
    if (hint.length && drawable) {
      g.fillStyle = "rgba(150,205,255,0.16)";
      for (const [hx, hy] of hint) g.fillRect(origin.x + hx, origin.y + hy, 1, 1);
    }
    const sel = selection.cells;
    if (sel.size && drawable) {
      g.fillStyle = flashOn ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)";
      for (const k of sel) {
        const [sx, sy] = k.split(",");
        g.fillRect(origin.x + Number(sx), origin.y + Number(sy), 1, 1);
      }
    }
    // The box being dragged out, before it is a selection.
    if (mq && drawable) {
      const x0 = Math.min(mq.from.x, mq.to.x);
      const y0 = Math.min(mq.from.y, mq.to.y);
      g.fillStyle = "rgba(255,255,255,0.22)";
      g.fillRect(
        origin.x + x0,
        origin.y + y0,
        Math.abs(mq.to.x - mq.from.x) + 1,
        Math.abs(mq.to.y - mq.from.y) + 1,
      );
    }
  });

  /** Points the current drag would paint — drawn as an overlay, not committed. */
  const preview = $derived.by(() => {
    if (!drag || !hover || !isShape(editor.tool)) return [];
    return strokePoints(editor.tool, drag, hover, shift);
  });

  /** What a click would select, under the cursor. Answering "which pixels does
   *  this take?" before the click is cheaper than answering it afterwards with an
   *  undo — and on a sprite where two shapes touch by a corner, the difference
   *  between them is a pixel you cannot see until something shows you. */
  const hoverShape = $derived.by(() => {
    if (editor.tool !== "select" || !hover || marquee || moving || placing) return [];
    return shapePoints(node.frames[frameOf(editor.path, node)] ?? [], hover.x, hover.y);
  });

  /** How the assembly is drawn while a node is being edited: the node full, the
   *  rest by the chosen underlay, so the first thing the view says is which
   *  pixels are yours. */
  const paintOpts = $derived({
    frameOf,
    resolve: resolvePart,
    variant: editor.variant,
    hidden: (path: string[]) => !!editor.hidden[pathKey(path)],
    style: (path: string[]) =>
      pathKey(path) === pathKey(editor.path) ? ("full" as const) : panels.underlay,
  });
</script>

<svelte:window onkeydown={keydown} onkeyup={keyup} onblur={blur} />

<div
  class="pane"
  data-bg={backdrop}
  bind:this={pane}
  bind:clientWidth={viewport.paneW}
  bind:clientHeight={viewport.paneH}
  class:panning={panning || space}
  class:picking
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={cancel}
  onpointerleave={() => (hover = null)}
  oncontextmenu={canvasMenu}
  onwheel={wheel}
  {...gestures}
  role="application"
  aria-label="Sprite canvas"
>
  <div
    class="stage"
    style:width={`${box.w * px}px`}
    style:height={`${box.h * px}px`}
    style:transform={`translate(-50%, -50%) translate(${viewport.tx}px, ${viewport.ty}px)`}
    style:--cell={`${px}px`}
    class:grid={editor.grid && px >= 6}
  >
    <canvas bind:this={canvas} data-testid="canvas"></canvas>
    {#each ghosts as g (g.key)}
      <!-- A part with nothing drawn in it yet. Faint, and never over the art:
           by definition there is none of its own there to hide. -->
      <div
        class="empty"
        class:on={g.key === pathKey(editor.path)}
        style:left={`${g.x * px}px`}
        style:top={`${g.y * px}px`}
        style:width={`${g.w * px}px`}
        style:height={`${g.h * px}px`}
      ></div>
    {/each}
    {#if editor.path.length && !nodeHidden}
      <!-- Where painting is possible — or, for a borrowed part, simply what is
           selected. Only for a part: when the sprite itself is what you are
           drawing, its box IS the canvas and outlining it says nothing. -->
      <div
        class="node"
        class:borrowed
        style:left={`${origin.x * px}px`}
        style:top={`${origin.y * px}px`}
        style:width={`${node.w * px}px`}
        style:height={`${node.h * px}px`}
      ></div>
    {/if}
    {#if hasSelection() && drawable}
      <!-- The extent, as a marching outline. Sits outside the cells by a hair so
           it never hides the edge pixels it is describing. -->
      <div
        class="ants"
        class:floating={floating.on}
        style:left={`${(origin.x + selection.x0) * px}px`}
        style:top={`${(origin.y + selection.y0) * px}px`}
        style:width={`${(selection.x1 - selection.x0 + 1) * px}px`}
        style:height={`${(selection.y1 - selection.y0 + 1) * px}px`}
      ></div>
    {/if}
    {#if turning.on}
      <!-- The rotation handle: an arm from the pivot, a grip at its end. Accent
           when the angle sits on a quarter — the snap made visible. -->
      <div
        class="rotarm"
        class:snapped
        style:left={`${pivotPx.x}px`}
        style:top={`${pivotPx.y}px`}
        style:width={`${armPx}px`}
        style:transform={`rotate(${turning.angle - 90}deg)`}
      ></div>
      <button
        class="rotgrip"
        class:snapped
        style:left={`${handlePx.x}px`}
        style:top={`${handlePx.y}px`}
        title="Drag to rotate — snaps at 90°, ⌘ glides free"
        aria-label="Rotate by dragging"
        onpointerdown={(e) => {
          e.stopPropagation();
          dragHandle(e);
        }}
      ></button>
    {/if}
  </div>

  <p class="read">
    {node.w}×{node.h} · ×{px}
    {#if editor.path.length && !nodeHidden}· {editor.path.join("/")}{/if}
    {#if hover}· {hover.x},{hover.y}{/if}
  </p>

  <RotateBar />
</div>

<style>
  .pane {
    position: relative;
    overflow: hidden;
    touch-action: none; /* the gestures are ours */
    background: #101014;
  }
  .pane.panning {
    cursor: grab;
  }
  .pane[data-bg="night"] {
    background: #0b0714;
  }
  .pane[data-bg="dark"] {
    background: #141414;
  }
  .pane[data-bg="light"] {
    background: #e9e9ee;
  }
  .stage {
    position: absolute;
    left: 50%;
    top: 50%;
    /* The transparency checker, drawn by the container so the canvas itself
       stays a plain sprite with real alpha. */
    background-image:
      linear-gradient(45deg, #2a2a2a 25%, transparent 25%),
      linear-gradient(-45deg, #2a2a2a 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #2a2a2a 75%),
      linear-gradient(-45deg, transparent 75%, #2a2a2a 75%);
    background-size: 12px 12px;
    background-position:
      0 0,
      0 6px,
      6px -6px,
      -6px 0;
    background-color: #1e1e1e;
    box-shadow: 0 0 0 1px var(--halo-border);
  }
  .pane[data-bg="night"] .stage,
  .pane[data-bg="dark"] .stage,
  .pane[data-bg="light"] .stage {
    background-image: none;
  }
  .pane[data-bg="night"] .stage {
    background-color: #0b0714;
  }
  .pane[data-bg="dark"] .stage {
    background-color: #141414;
  }
  .pane[data-bg="light"] .stage {
    background-color: #e9e9ee;
  }
  .stage.grid::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      repeating-linear-gradient(
        to right,
        rgba(255, 255, 255, 0.13) 0 1px,
        transparent 1px var(--cell)
      ),
      repeating-linear-gradient(
        to bottom,
        rgba(255, 255, 255, 0.13) 0 1px,
        transparent 1px var(--cell)
      );
  }
  /* An empty part, as a hatched box: there is nothing else to see it by, and it
     has to read as "a space waiting for pixels" rather than as art. */
  .empty {
    position: absolute;
    pointer-events: none;
    border: 1px solid rgba(150, 205, 255, 0.3);
    background: repeating-linear-gradient(
      45deg,
      rgba(150, 205, 255, 0.07) 0 4px,
      transparent 4px 8px
    );
  }
  .empty.on {
    border-color: rgba(150, 205, 255, 0.7);
    background: repeating-linear-gradient(
      45deg,
      rgba(150, 205, 255, 0.16) 0 4px,
      transparent 4px 8px
    );
  }
  /* The active node's own box. Quiet — it is a boundary, not a selection, and it
     is on screen the whole time a part is being drawn. */
  .node {
    position: absolute;
    pointer-events: none;
    outline: 1px solid rgba(150, 205, 255, 0.45);
    outline-offset: 0;
  }
  /* Dashed, the same way the tree dashes a borrowed row and its picture: one
     word for one thing, wherever it is said. Not a different colour — the
     colour is already busy saying which node is active. */
  .node.borrowed {
    outline: 1px dashed rgba(150, 205, 255, 0.75);
  }
  /* Marching ants: four dashed gradients, one per edge, with the dash phase
     animated. The box itself must not move a hair — it is describing which cells
     are selected — so what travels is the pattern, not the element. */
  .ants {
    --ant: #fff;
    position: absolute;
    pointer-events: none;
    background-image:
      repeating-linear-gradient(to right, var(--ant) 0 3px, transparent 3px 6px),
      repeating-linear-gradient(to right, var(--ant) 0 3px, transparent 3px 6px),
      repeating-linear-gradient(to bottom, var(--ant) 0 3px, transparent 3px 6px),
      repeating-linear-gradient(to bottom, var(--ant) 0 3px, transparent 3px 6px);
    background-size:
      100% 1px,
      100% 1px,
      1px 100%,
      1px 100%;
    background-position:
      0 0,
      0 100%,
      0 0,
      100% 0;
    background-repeat: no-repeat;
    filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.9));
    animation: crawl 0.5s linear infinite;
  }
  /* A block that is still floating over what it landed on. Accent rather than
     white, on the one surface where accent is not already spoken for — blue says
     which node, white says what is selected, and this is a third thing: selected
     AND not yet yours. The chip in the status bar is what names it; this is only
     where. */
  .ants.floating {
    --ant: var(--halo-accent);
  }
  @keyframes crawl {
    to {
      background-position:
        6px 0,
        -6px 100%,
        0 -6px,
        100% 6px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ants {
      animation: none;
    }
  }
  /* The rotate handle. The arm pivots about its LEFT edge, which sits on the
     turn's centre; the grip is a real button so it can take the pointer before
     the pane's capture does. */
  .rotarm {
    position: absolute;
    height: 1px;
    background: rgba(150, 205, 255, 0.55);
    transform-origin: left center;
    pointer-events: none;
  }
  .rotarm.snapped {
    background: var(--halo-accent);
    height: 2px;
  }
  .rotgrip {
    position: absolute;
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid rgba(150, 205, 255, 0.9);
    background: var(--halo-bg-main);
    cursor: grab;
    touch-action: none;
  }
  .rotgrip:active {
    cursor: grabbing;
  }
  .rotgrip.snapped {
    border-color: var(--halo-accent);
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
    touch-action: none;
    cursor: crosshair;
  }
  /* Drawn rather than named, because CSS has no eyedropper keyword and the one
     thing this cursor has to say is which pixel the tip is on — so the hotspot
     is the tip. Panning wins over it: the pan is already in progress. */
  .picking canvas {
    cursor:
      url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M2.5 13.5l.5-2.2 6.2-6.2 1.7 1.7-6.2 6.2z" fill="%23fff" stroke="%23000" stroke-linejoin="round"/><rect x="9.6" y="2.4" width="4.4" height="3" rx="1.5" transform="rotate(45 11.8 3.9)" fill="%23fff" stroke="%23000"/></svg>')
        2 14,
      crosshair;
  }
  .panning canvas {
    cursor: grab;
  }
  .read {
    position: absolute;
    left: 0.6rem;
    bottom: 0.4rem;
    margin: 0;
    font-variant-numeric: tabular-nums;
    color: var(--halo-text-muted);
    font-size: 0.8rem;
    pointer-events: none;
  }
</style>
