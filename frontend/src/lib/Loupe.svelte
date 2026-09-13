<script lang="ts">
  // The loupe: the sprite at the size it will be drawn at, over the canvas that
  // is drawing it at ×29.
  //
  // Not a magnifier — dab's pixels are the model, so there is nothing to
  // magnify. This is the opposite: the one thing a zoomed-in canvas cannot say
  // is how the art reads small, which is where a sign turns to mush and a
  // one-pixel highlight disappears. It plays when the surface plays, because
  // "does this read at size, in motion" is one question.
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import X from "@lucide/svelte/icons/x";

  import { editor, frameOf, pathKey, resolvePart, shownFrame, stageBox } from "./editor.svelte";
  import { type MenuItem, openMenu } from "./menu.svelte";
  import {
    type Corner,
    LOUPE_ZOOMS,
    panels,
    setLoupeCorner,
    setLoupeZoom,
    toggleLoupe,
  } from "./panels.svelte";
  import { paintAssembly } from "./render";
  import { type Backdrop, viewport } from "./viewport.svelte";

  let { backdrop = "checker" as Backdrop }: { backdrop?: Backdrop } = $props();

  let canvas: HTMLCanvasElement | null = $state(null);
  /** Where the box is while it is being dragged, in pane pixels. Null the rest
   *  of the time: at rest it is pinned to a corner, not to a position. */
  let dragging: { x: number; y: number; dx: number; dy: number } | null = $state(null);

  const box = $derived(stageBox());
  const want = $derived(panels.loupe.zoom);

  // Never more than two fifths of the pane: a window that covers the drawing is
  // not a second opinion about it. The room is the PANE's, so a bigger monitor
  // buys bigger steps — which is the point of the knob. The chip reads the zoom
  // actually used, so a capped ×8 says ×3 rather than claiming a size it is not
  // showing, and Bigger greys out at the ceiling rather than doing nothing.
  const fits = $derived(
    Math.max(
      1,
      Math.min(
        Math.floor((viewport.paneW * 0.4) / Math.max(1, box.w)),
        Math.floor((viewport.paneH * 0.4) / Math.max(1, box.h)),
      ),
    ),
  );
  /** The steps this window has room for — at least the smallest, always. */
  const steps = $derived(LOUPE_ZOOMS.filter((z, i) => i === 0 || z <= fits));
  const zoom = $derived(
    steps.reduce((best, z) => (z <= Math.min(want, fits) ? z : best), steps[0]),
  );
  const capped = $derived(zoom < want);
  const ceiling = $derived(steps[steps.length - 1]);

  /** Step from what is on SCREEN, not from what was asked for: with a wanted ×8
   *  capped to ×2, pressing Smaller has to give ×1, not a ×6 that also shows as
   *  ×2. */
  function step(by: 1 | -1) {
    const i = Math.min(steps.length - 1, Math.max(0, steps.indexOf(zoom) + by));
    setLoupeZoom(steps[i]);
  }

  $effect(() => {
    const el = canvas;
    if (!el) return;
    el.width = box.w;
    el.height = box.h;
    const g = el.getContext("2d");
    if (!g) return;
    // Everything the paint reads, so a hidden part or a variant repaints it.
    const frame = shownFrame();
    void editor.shown;
    void editor.hidden;
    void editor.variant;
    void editor.sprite;
    g.clearRect(0, 0, el.width, el.height);
    // No underlay style: this is the consumer's view, where every part is drawn
    // as it is. Hidden parts stay hidden — they are how the pose is posed.
    paintAssembly(g, editor.sprite, -box.x, -box.y, {
      frameOf: (path, n) => frameOf(path, n, frame),
      resolve: resolvePart,
      variant: editor.variant,
      hidden: (path) => !!editor.hidden[pathKey(path)],
    });
  });

  /** Drag it by its own body, and let go into the nearest corner. Four corners
   *  rather than a free position: it is chrome over someone's drawing. */
  function grab(e: PointerEvent) {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest("button")) return;
    const host = (e.currentTarget as HTMLElement).parentElement;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pane = host?.getBoundingClientRect();
    if (!pane) return;
    dragging = {
      x: r.left - pane.left,
      y: r.top - pane.top,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* a synthetic pointer: the drag still tracks, it just isn't captured */
    }
  }

  function drag(e: PointerEvent) {
    if (!dragging) return;
    const host = (e.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
    if (!host) return;
    dragging = {
      ...dragging,
      x: e.clientX - host.left - dragging.dx,
      y: e.clientY - host.top - dragging.dy,
    };
  }

  function drop(e: PointerEvent) {
    if (!dragging) return;
    const el = e.currentTarget as HTMLElement;
    const host = el.parentElement?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (host) {
      const cx = r.left + r.width / 2 - host.left;
      const cy = r.top + r.height / 2 - host.top;
      setLoupeCorner(
        `${cy < host.height / 2 ? "t" : "b"}${cx < host.width / 2 ? "l" : "r"}` as Corner,
      );
    }
    dragging = null;
  }

  const CORNERS: { id: Corner; label: string }[] = [
    { id: "tl", label: "Top left" },
    { id: "tr", label: "Top right" },
    { id: "bl", label: "Bottom left" },
    { id: "br", label: "Bottom right" },
  ];

  function loupeMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const items: MenuItem[] = [
      ...LOUPE_ZOOMS.map((z): MenuItem => ({
        label: `×${z}`,
        hint: z === zoom ? "showing" : z > fits ? "too big for this window" : undefined,
        disabled: z === zoom || z > fits,
        run: () => setLoupeZoom(z),
      })),
      { kind: "separator" },
      ...CORNERS.map((c): MenuItem => ({
        label: c.label,
        disabled: c.id === panels.loupe.corner,
        run: () => setLoupeCorner(c.id),
      })),
      { kind: "separator" },
      { label: "Hide the loupe", run: () => toggleLoupe(false) },
    ];
    openMenu(e, `loupe · ×${zoom}`, items);
  }
</script>

{#if panels.loupe.on}
  <!-- Pointer events stop here: the pane captures the pointer for strokes, and
       a captured pointer retargets the release, so chrome that shares its
       gestures with the canvas is dead to the mouse while looking enabled. -->
  <div
    class="loupe"
    data-testid="loupe"
    data-corner={panels.loupe.corner}
    style:left={dragging ? `${dragging.x}px` : null}
    style:top={dragging ? `${dragging.y}px` : null}
    style:right={dragging ? "auto" : null}
    style:bottom={dragging ? "auto" : null}
    role="group"
    aria-label="Loupe"
    onpointerdown={grab}
    onpointermove={drag}
    onpointerup={drop}
    onpointercancel={drop}
    oncontextmenu={loupeMenu}
  >
    <div class="art" data-bg={backdrop}>
      <canvas
        bind:this={canvas}
        data-testid="loupe-canvas"
        style:width={`${box.w * zoom}px`}
        style:height={`${box.h * zoom}px`}
      ></canvas>
    </div>

    <div class="foot">
      <button
        aria-label="Smaller"
        title="Smaller"
        disabled={zoom === steps[0]}
        onclick={() => step(-1)}><Minus size={11} /></button
      >
      <span
        class="chip"
        class:capped
        title={capped ? `×${want} does not fit this window` : "The size it is drawn at"}
        >×{zoom}</span
      >
      <button
        aria-label="Bigger"
        title={zoom >= ceiling ? "As big as this window allows" : "Bigger"}
        disabled={zoom >= ceiling}
        onclick={() => step(1)}><Plus size={11} /></button
      >
      <button
        class="shut"
        aria-label="Hide the loupe"
        title="Hide the loupe"
        onclick={() => toggleLoupe(false)}><X size={11} /></button
      >
    </div>
  </div>
{/if}

<style>
  .loupe {
    position: absolute;
    z-index: 2;
    display: grid;
    gap: 0.15rem;
    padding: 0.25rem;
    border: 1px solid var(--halo-border);
    border-radius: 8px;
    background: var(--halo-bg-main);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
    cursor: grab;
    touch-action: none;
    font-family: var(--halo-font-body);
  }
  .loupe:active {
    cursor: grabbing;
  }
  .loupe[data-corner="tl"] {
    left: 0.6rem;
    top: 0.6rem;
  }
  .loupe[data-corner="tr"] {
    right: 0.6rem;
    top: 0.6rem;
  }
  .loupe[data-corner="bl"] {
    left: 0.6rem;
    bottom: 0.6rem;
  }
  .loupe[data-corner="br"] {
    right: 0.6rem;
    bottom: 0.6rem;
  }
  /* The consumer's ground under it, not the app's: a sprite with alpha reads
     differently on a checker than on night, and that is the question. */
  .art {
    display: grid;
    place-items: center;
    border-radius: 4px;
    overflow: hidden;
    background-image:
      linear-gradient(45deg, #2a2a2a 25%, transparent 25%),
      linear-gradient(-45deg, #2a2a2a 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #2a2a2a 75%),
      linear-gradient(-45deg, transparent 75%, #2a2a2a 75%);
    background-size: 8px 8px;
    background-position:
      0 0,
      0 4px,
      4px -4px,
      -4px 0;
    background-color: #1e1e1e;
  }
  .art[data-bg="night"] {
    background-image: none;
    background-color: #0b0714;
  }
  .art[data-bg="dark"] {
    background-image: none;
    background-color: #141414;
  }
  .art[data-bg="light"] {
    background-image: none;
    background-color: #e9e9ee;
  }
  canvas {
    display: block;
    image-rendering: pixelated;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    font-size: 0.68rem;
    color: var(--halo-text-muted);
  }
  .foot button {
    display: grid;
    place-items: center;
    padding: 0.1rem;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--halo-text-muted);
    cursor: pointer;
  }
  .foot button:hover:not(:disabled) {
    color: var(--halo-accent);
  }
  .foot button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .chip {
    flex: 1;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  /* The zoom it is actually showing, when the one you asked for would cover the
     drawing. Said in the accent so the difference is not a silent one. */
  .chip.capped {
    color: var(--halo-accent);
  }
  .shut {
    margin-left: 0.1rem;
  }
</style>
