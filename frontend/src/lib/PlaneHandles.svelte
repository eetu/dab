<script lang="ts">
  // The perspective plane, on the art: its grid, and the anchor it is pinned
  // at. The angles live on the bar; WHERE the plane is belongs on the canvas,
  // the way the rotate pivot and the hinge do.
  import { type Box, planeGrid, type SpriteBody } from "dab-core";

  import { brush, perspective, plane, setAnchor } from "./editor.svelte";

  let {
    canvas,
    box,
    origin,
    px,
    node,
  }: {
    canvas: HTMLCanvasElement | null;
    /** The stage: the assembly's box, in the sprite's cells. */
    box: Box;
    /** The active node's top-left, in stage cells. */
    origin: { x: number; y: number };
    /** Screen pixels per cell. */
    px: number;
    node: SpriteBody;
  } = $props();

  /** Grid cells the size of the brush, so a stamp in each one tiles the plane.
   *  Out to three node-widths each way: past that the lines are crowding into
   *  the horizon, where there is nothing left to aim at. */
  const lines = $derived.by(() => {
    if (!perspective.on) return [];
    const rows = brush();
    const step = rows ? Math.max(rows.length, rows[0].length) : 4;
    return planeGrid(plane(), step, Math.max(node.w, node.h) * 3);
  });

  /** Drag the anchor: the point the plane is pinned at, and where it is 1:1. */
  function dragAnchor(e: PointerEvent) {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer — the drag still works, it just isn't captured */
    }
    const move = (ev: PointerEvent) => {
      const rect = canvas?.getBoundingClientRect();
      if (!rect) return;
      setAnchor(
        ((ev.clientX - rect.left) / rect.width) * box.w - origin.x,
        ((ev.clientY - rect.top) / rect.height) * box.h - origin.y,
      );
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }
</script>

{#if perspective.on}
  <!-- In cells, scaled to the stage, so a line lands where the pixels it is
       about land. Clipped by the svg's own box. -->
  <svg
    class="plane"
    viewBox={`0 0 ${box.w} ${box.h}`}
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    {#each lines as [x0, y0, x1, y1], i (i)}
      <line
        x1={origin.x + x0}
        y1={origin.y + y0}
        x2={origin.x + x1}
        y2={origin.y + y1}
        vector-effect="non-scaling-stroke"
      />
    {/each}
  </svg>
  <button
    class="anchor"
    style:left={`${(origin.x + perspective.x) * px}px`}
    style:top={`${(origin.y + perspective.y) * px}px`}
    title="Drag the anchor — where the plane is pinned, and true size"
    aria-label="Plane anchor"
    onpointerdown={dragAnchor}
  ></button>
{/if}

<style>
  .plane {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  /* The cool blue the turn's arm is drawn in: an aid, not the art and not a
     selection. */
  .plane line {
    stroke: rgba(150, 205, 255, 0.45);
    stroke-width: 1;
  }
  .anchor {
    position: absolute;
    z-index: 3;
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid var(--halo-accent);
    background: var(--halo-bg-main);
    cursor: move;
    touch-action: none;
  }
</style>
