<script lang="ts">
  // The tool rail, after nib's: icons with the shortcut in the tooltip, the
  // active one pressed. A rail rather than a row of words because the tools are
  // reached constantly and a shape is faster to hit than a label.
  import Circle from "@lucide/svelte/icons/circle";
  import Eraser from "@lucide/svelte/icons/eraser";
  import Maximize from "@lucide/svelte/icons/maximize";
  import Minus from "@lucide/svelte/icons/minus";
  import Move from "@lucide/svelte/icons/move";
  import PaintBucket from "@lucide/svelte/icons/paint-bucket";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Pipette from "@lucide/svelte/icons/pipette";
  import Square from "@lucide/svelte/icons/square";
  import SquareDashedMousePointer from "@lucide/svelte/icons/square-dashed-mouse-pointer";
  import ZoomIn from "@lucide/svelte/icons/zoom-in";
  import ZoomOut from "@lucide/svelte/icons/zoom-out";

  import { editor, stageBox, type Tool, TOOLS } from "./editor.svelte";
  import IconButton from "./IconButton.svelte";
  import { cell, fit, zoomIn, zoomOut } from "./viewport.svelte";

  const ICONS: Record<Tool, typeof Pencil> = {
    pencil: Pencil,
    eraser: Eraser,
    fill: PaintBucket,
    picker: Pipette,
    line: Minus,
    rect: Square,
    ellipse: Circle,
    select: SquareDashedMousePointer,
    move: Move,
  };
</script>

<!-- IconButton like every other icon in the app — this rail was the last place
     hand-rolling its own, with its own idea of "on". -->
<nav class="rail" aria-label="Tools">
  {#each TOOLS as t (t.id)}
    {@const Icon = ICONS[t.id]}
    <IconButton
      pill
      label={t.label}
      hint={`${t.label} — ${t.hint} (${t.key.toUpperCase()})`}
      active={editor.tool === t.id}
      onclick={() => (editor.tool = t.id)}
    >
      <Icon size={18} />
      <!-- The shortcut, on the button. Eight icons in a rail is past the point
           where a tooltip is discovery: the letter is how these get learned. -->
      <span class="key" class:lit={editor.tool === t.id}>{t.key}</span>
    </IconButton>
  {/each}

  <div class="sep"></div>

  <IconButton pill label="Zoom in" hint="Zoom in (+)" onclick={() => zoomIn()}>
    <ZoomIn size={18} />
  </IconButton>
  <IconButton pill label="Zoom out" hint="Zoom out (−)" onclick={() => zoomOut()}>
    <ZoomOut size={18} />
  </IconButton>
  <IconButton
    pill
    label="Fit to view"
    hint="Fit to view (0)"
    onclick={() => fit(stageBox().w, stageBox().h)}
  >
    <Maximize size={18} />
  </IconButton>
  <span class="zoom">×{cell()}</span>
</nav>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 0.35rem;
    /* Eight tools plus the view controls is taller than a short window, and a
       grid item that cannot shrink grows the whole app instead of scrolling. */
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;
    background: var(--halo-bg-light);
    border-right: 1px solid var(--halo-border);
  }
  .sep {
    width: 60%;
    height: 1px;
    background: var(--halo-border);
    margin: 0.35rem 0;
  }
  .key {
    position: absolute;
    right: 0.05rem;
    bottom: -0.05rem;
    font-size: 0.55rem;
    line-height: 1;
    text-transform: uppercase;
    color: var(--halo-text-light);
    pointer-events: none;
  }
  .key.lit {
    color: var(--halo-accent);
  }
  .zoom {
    font-size: 0.7rem;
    color: var(--halo-text-light);
    font-variant-numeric: tabular-nums;
  }
</style>
