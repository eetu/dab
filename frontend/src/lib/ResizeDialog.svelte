<script lang="ts">
  // Canvas size: how big, and where the art sits inside it.
  //
  // A resize crops or pads — pixel art has no meaningful resample — so the
  // question a size change really asks is WHICH PIXELS. Two numbers cannot
  // answer that: growing by eight columns has to say which side they go on, and
  // shrinking by eight has to say which eight are lost. So the art is dragged
  // into place against the new canvas and you can see the answer.
  //
  // Underneath it is one call: padSprite with the four margins the drag implies.
  import { groupBox } from "dab-core";

  import { activeNode, editor, padNode, resolvePart } from "./editor.svelte";
  import Modal from "./Modal.svelte";
  import { paintAssembly, paintRows } from "./render";
  import { closeResize, resizer } from "./resize.svelte";

  const node = $derived(activeNode());
  const where = $derived(editor.path.length ? editor.path.join("/") : editor.sprite.name);

  let w = $state(1);
  let h = $state(1);
  /** Where the old art's top-left sits in the new canvas. Negative crops. */
  let dx = $state(0);
  let dy = $state(0);

  // Opening reads the node it is about; changing the size re-clamps the offset,
  // because the range it may sit in is a function of the size difference.
  $effect(() => {
    if (!resizer.open) return;
    w = node.w;
    h = node.h;
    dx = 0;
    dy = 0;
  });

  const span = (delta: number) => ({ lo: Math.min(0, delta), hi: Math.max(0, delta) });
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const rangeX = $derived(span(w - node.w));
  const rangeY = $derived(span(h - node.h));

  $effect(() => {
    dx = clamp(dx, rangeX.lo, rangeX.hi);
    dy = clamp(dy, rangeY.lo, rangeY.hi);
  });

  /** Where a drag wants to come to rest: centred, or flush against an edge.
   *  Centred is the same rounding the old centre anchor used, so a resize that
   *  snaps to the middle lands exactly where "grow from the centre" would. */
  const stopsX = $derived([Math.round((w - node.w) / 2), rangeX.lo, rangeX.hi]);
  const stopsY = $derived([Math.round((h - node.h) / 2), rangeY.lo, rangeY.hi]);
  const midX = $derived(Math.round((w - node.w) / 2));
  const midY = $derived(Math.round((h - node.h) / 2));

  /** Within a few SCREEN pixels, so the pull feels the same however far the
   *  preview is zoomed — at ×20 that is well under one sprite pixel. */
  const SNAP_PX = 6;
  const snapTo = (v: number, stops: number[], tol: number) => {
    const near = stops
      .filter((t) => Math.abs(v - t) <= tol)
      .sort((a, b) => Math.abs(v - a) - Math.abs(v - b));
    return near.length ? near[0] : v;
  };

  const onMidX = $derived(dx === midX && rangeX.lo !== rangeX.hi);
  const onMidY = $derived(dy === midY && rangeY.lo !== rangeY.hi);

  const changed = $derived(w !== node.w || h !== node.h || dx !== 0 || dy !== 0);
  const grows = $derived(w > node.w || h > node.h);
  const crops = $derived(w < node.w || h < node.h);

  /** The area both canvases cover, so art falling outside the new one is still
   *  drawn — you have to see what a crop is about to take. */
  const view = $derived({
    x: Math.min(0, dx),
    y: Math.min(0, dy),
    w: Math.max(w, dx + node.w) - Math.min(0, dx),
    h: Math.max(h, dy + node.h) - Math.min(0, dy),
  });

  const BOX = 240;
  const scale = $derived(Math.max(1, Math.floor(Math.min(BOX / view.w, BOX / view.h))) || 1);

  let canvas: HTMLCanvasElement | null = $state(null);

  $effect(() => {
    const el = canvas;
    if (!el || !resizer.open) return;
    el.width = view.w;
    el.height = view.h;
    const g = el.getContext("2d");
    if (!g) return;
    void editor.variant;
    g.clearRect(0, 0, el.width, el.height);
    // The new canvas, as a plate under everything.
    g.fillStyle = "#1e1e1e";
    g.fillRect(-view.x, -view.y, w, h);
    // The art, wherever the drag has put it. Assembly for the sprite itself so
    // a car is dragged as a car, one grid for a part.
    const ox = dx - view.x;
    const oy = dy - view.y;
    if (editor.path.length) {
      paintRows(g, node.frames[editor.frame] ?? node.frames[0], node, ox, oy, editor.variant);
    } else {
      paintAssembly(g, node, ox, oy, {
        frameOf: () => 0,
        resolve: resolvePart,
        variant: editor.variant,
      });
    }
    // What will be lost, greyed back over the top.
    g.fillStyle = "rgba(15,15,15,0.72)";
    if (-view.x > 0) g.fillRect(0, 0, -view.x, view.h);
    if (-view.y > 0) g.fillRect(0, 0, view.w, -view.y);
    const right = -view.x + w;
    const bottom = -view.y + h;
    if (right < view.w) g.fillRect(right, 0, view.w - right, view.h);
    if (bottom < view.h) g.fillRect(0, bottom, view.w, view.h - bottom);
  });

  let drag: { x: number; y: number; dx: number; dy: number } | null = null;

  function down(e: PointerEvent) {
    if (!rangeX.hi && !rangeX.lo && !rangeY.hi && !rangeY.lo) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, dx, dy };
  }

  function move(e: PointerEvent) {
    if (!drag) return;
    const tol = Math.max(1, Math.round(SNAP_PX / scale));
    const rawX = drag.dx + Math.round((e.clientX - drag.x) / scale);
    const rawY = drag.dy + Math.round((e.clientY - drag.y) / scale);
    dx = clamp(snapTo(rawX, stopsX, tol), rangeX.lo, rangeX.hi);
    dy = clamp(snapTo(rawY, stopsY, tol), rangeY.lo, rangeY.hi);
  }

  const up = () => (drag = null);

  /** The size that just contains this node's parts, and the offset that puts
   *  them inside it — the common reason to resize a body at all. */
  function fitParts() {
    const b = groupBox(node, resolvePart);
    w = b.w;
    h = b.h;
    dx = -b.x;
    dy = -b.y;
  }

  function centre() {
    dx = midX;
    dy = midY;
  }

  function apply() {
    padNode(editor.path, dx, dy, w - node.w - dx, h - node.h - dy);
    closeResize();
  }
</script>

<Modal
  open={resizer.open}
  title="Canvas size"
  subject={where}
  onclose={closeResize}
  onconfirm={() => changed && apply()}
>
  <div class="fields">
    <label>
      <span>Width</span>
      <input type="number" min="1" max="512" bind:value={w} />
    </label>
    <label>
      <span>Height</span>
      <input type="number" min="1" max="512" bind:value={h} />
    </label>
    <span class="was">was {node.w}×{node.h}</span>
  </div>

  <div class="stage" class:draggable={changed && (grows || crops)}>
    <!-- The guides are DOM rather than drawn: one unit on that canvas is one
           sprite pixel, so a stroked line would be as thick as the art. -->
    <div class="frame" style:width={`${view.w * scale}px`} style:height={`${view.h * scale}px`}>
      <canvas
        bind:this={canvas}
        style:width={`${view.w * scale}px`}
        style:height={`${view.h * scale}px`}
        onpointerdown={down}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={up}
      ></canvas>
      <div class="guide v" class:on={onMidX} style:left={`${(-view.x + w / 2) * scale}px`}></div>
      <div class="guide h" class:on={onMidY} style:top={`${(-view.y + h / 2) * scale}px`}></div>
    </div>
  </div>

  <p class="note">
    {#if onMidX && onMidY}
      Centred.
    {:else if crops}
      Drag the art to choose which pixels survive — the shaded edges are lost.
    {:else if grows}
      Drag the art to place it in the new canvas.
    {:else}
      Crops or pads. Pixel art has no meaningful resample, so a bigger canvas means more room, not a
      bigger drawing.
    {/if}
  </p>

  {#snippet footer()}
    <button onclick={centre} disabled={!grows && !crops} title="Put the art in the middle">
      Centre
    </button>
    <button
      onclick={fitParts}
      disabled={!(node.parts?.length ?? 0)}
      title="Size to hold every part"
    >
      Fit to parts
    </button>
    <span class="gap"></span>
    <button onclick={closeResize}>Cancel</button>
    <button class="go" disabled={!changed} onclick={apply}>
      {changed ? `Resize to ${w}×${h}` : "Resize"}
    </button>
  {/snippet}
</Modal>

<style>
  .fields {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
  }
  label {
    display: grid;
    gap: 0.2rem;
    font-size: 0.72rem;
    color: var(--halo-text-muted);
  }
  input {
    width: 5rem;
    background: var(--halo-bg-light);
    color: var(--halo-text-main);
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    padding: 0.3rem 0.4rem;
    font: inherit;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }
  input:focus-visible {
    outline: 2px solid var(--halo-accent);
    outline-offset: -1px;
  }
  .was {
    font-size: 0.72rem;
    color: var(--halo-text-light);
    padding-bottom: 0.35rem;
    font-variant-numeric: tabular-nums;
  }
  .stage {
    display: grid;
    place-items: center;
    min-width: 17rem;
    min-height: 15rem;
    padding: 0.6rem;
    border: 1px solid var(--halo-border);
    border-radius: var(--halo-radius);
    background: repeating-conic-gradient(#252525 0% 25%, #1e1e1e 0% 50%) 0 0 / 12px 12px;
    overflow: hidden;
  }
  .frame {
    position: relative;
  }
  /* Faint until the drag lands on it, then it says so — the line is the only
     thing that can tell you a snap happened. */
  .guide {
    position: absolute;
    pointer-events: none;
    background: rgba(150, 205, 255, 0.28);
  }
  .guide.v {
    top: -0.5rem;
    bottom: -0.5rem;
    width: 1px;
    transform: translateX(-0.5px);
  }
  .guide.h {
    left: -0.5rem;
    right: -0.5rem;
    height: 1px;
    transform: translateY(-0.5px);
  }
  .guide.on {
    background: var(--halo-accent);
  }
  .stage.draggable canvas {
    cursor: grab;
  }
  .stage.draggable canvas:active {
    cursor: grabbing;
  }
  canvas {
    display: block;
    image-rendering: pixelated;
    touch-action: none;
    box-shadow: 0 0 0 1px var(--halo-border);
  }
  .note {
    margin: 0;
    max-width: 22rem;
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--halo-text-light);
  }
</style>
