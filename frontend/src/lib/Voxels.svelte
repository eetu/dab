<script lang="ts">
  // The 3D view: a sprite in depth — its grid in front, its slices behind, a pixel a
  // voxel — turned to be looked at from any side; the question a column of slices
  // cannot answer is what they make. Only a sprite with slices has one, and it shows
  // the frame on the strip, since a frame is still a moment. A panel of the Subject column, because
  // it is a view of the subject: the whole of it, as playing shows the whole, whatever
  // part is in hand. It follows every stroke, variant and hidden part as it lands.
  // Drag in it to turn it, double-click to look square on. It fills the column at
  // whole pixels a voxel, so a voxel's edges stay even.
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import { depthOf, voxelsOf } from "dab-core";

  import { editor, pathKey, resolvePart, shownFrame, shownVariant } from "./editor.svelte";
  import IconButton from "./IconButton.svelte";
  import Panel from "./Panel.svelte";
  import { panels, setVoxelOrbit } from "./panels.svelte";
  import { type Orbit, renderVoxels, sideOf } from "./voxels";

  let canvas: HTMLCanvasElement | null = $state(null);
  /** How wide the panel's body is, px: what the picture fills. */
  let room = $state(0);
  /** A turn in progress: where it began and the orbit it began from. Kept here while
   *  the pointer moves and remembered when it lets go. */
  let turning = $state<{ x: number; y: number; from: Orbit; now: Orbit } | null>(null);

  /** Radians a pixel dragged; and how far over or under it may be looked at. */
  const TURN = 0.012;
  const TOP = 1.5;

  const voxels = $derived(
    voxelsOf(editor.sprite, {
      resolve: resolvePart,
      variant: shownVariant(),
      hidden: (path) => !!editor.hidden[pathKey(path)],
      frame: shownFrame(),
    }),
  );
  const orbit = $derived(turning?.now ?? panels.voxels);
  /** Whole pixels a voxel, as many as the panel's width has room for. */
  const scale = $derived(Math.max(1, Math.floor(room / sideOf(voxels, 1))));
  const side = $derived(sideOf(voxels, scale));

  $effect(() => {
    const el = canvas;
    if (!el) return;
    el.width = side;
    el.height = side;
    el.getContext("2d")?.putImageData(renderVoxels(voxels, orbit, side, scale), 0, 0);
  });

  function turnStart(e: PointerEvent) {
    turning = { x: e.clientX, y: e.clientY, from: orbit, now: orbit };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* a synthetic pointer: the turn still tracks, it just isn't captured */
    }
  }

  function turnMove(e: PointerEvent) {
    if (!turning) return;
    const { from } = turning;
    turning = {
      ...turning,
      now: {
        yaw: from.yaw + (e.clientX - turning.x) * TURN,
        pitch: Math.max(-TOP, Math.min(TOP, from.pitch + (e.clientY - turning.y) * TURN)),
      },
    };
  }

  function turnEnd() {
    if (!turning) return;
    setVoxelOrbit(turning.now);
    turning = null;
  }

  const squareOn = () => setVoxelOrbit({ yaw: 0, pitch: 0 });
</script>

{#if depthOf(editor.sprite) > 1}
  <Panel id="voxels" title="3D" badge={`${voxels.w}×${voxels.h}×${voxels.d}`}>
    {#snippet actions()}
      <IconButton size="sm" ghost label="Look square on" onclick={squareOn}>
        <RotateCcw size={13} />
      </IconButton>
    {/snippet}
    <div class="art" data-testid="voxels" bind:clientWidth={room}>
      <canvas
        bind:this={canvas}
        data-testid="voxels-canvas"
        title="Drag to turn it, double-click to look square on"
        style:width={`${side}px`}
        style:height={`${side}px`}
        onpointerdown={turnStart}
        onpointermove={turnMove}
        onpointerup={turnEnd}
        onpointercancel={turnEnd}
        ondblclick={squareOn}
      ></canvas>
    </div>
    <p class="note">Its grid in front, its slices behind, at the frame on the strip.</p>
  </Panel>
{/if}

<style>
  /* A checker under it, as the loupe has: what is clear reads as clear. */
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
  canvas {
    display: block;
    cursor: move;
    touch-action: none;
  }
  .note {
    margin: 0;
    font-size: 0.68rem;
    color: var(--halo-text-muted);
  }
</style>
