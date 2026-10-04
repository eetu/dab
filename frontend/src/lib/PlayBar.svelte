<script lang="ts">
  // The controls for a sprite in motion, over the canvas that is playing it.
  //
  // Playing is a mode the surface is in: the tools are inert behind it, so the
  // way out has to be on the thing itself rather than in a panel that may be
  // folded away. fps lives here and nowhere else — it is the one number you
  // change while watching, and a slider that is on screen when nothing is
  // playing is furniture.
  import Pause from "@lucide/svelte/icons/pause";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import SkipBack from "@lucide/svelte/icons/skip-back";

  import {
    activeNode,
    animationRun,
    cycleShowing,
    editor,
    rewind,
    setPlaying,
    shownFrame,
    shownVariant,
  } from "./editor.svelte";
  import IconButton from "./IconButton.svelte";

  const node = $derived(activeNode());
  const run = $derived(animationRun(node));
  const at = $derived(run.indexOf(shownFrame(node)));
  // A cycle plays on the same head, so it is counted beside the frames — and a
  // single frame whose colours turn has no frame count to show.
  const cycle = $derived(cycleShowing());
  const phase = $derived(cycle ? cycle.phases.indexOf(shownVariant() ?? "") : -1);

  /** Room for "n/n" at its widest, in digits that are all one width. */
  const widest = (n: number) => `${String(n).length * 2 + 1}ch`;
</script>

{#if editor.playing}
  <!-- Pointer events STOP here: the pane captures the pointer for strokes, and a
       captured pointer retargets the release, so a bar that shares its gestures
       with the canvas is dead to the mouse while looking enabled. -->
  <div class="bar" role="group" aria-label="Playing" onpointerdown={(e) => e.stopPropagation()}>
    <span class="what">
      Playing{#if editor.animation}<span class="clip">{editor.animation}</span>{/if}
      {#if cycle}<span class="clip"><RefreshCw size={11} />{cycle.name}</span>{/if}
    </span>

    <IconButton size="sm" ghost label="Back to the first frame" onclick={rewind}>
      <SkipBack size={13} />
    </IconButton>
    <IconButton
      size="sm"
      ghost
      label="Stop"
      hint="Stop (P or Esc)"
      onclick={() => setPlaying(false)}
    >
      <Pause size={13} />
    </IconButton>

    <label class="rate">
      <span>fps</span>
      <input type="range" min="1" max="30" bind:value={editor.fps} aria-label="Frames per second" />
      <output>{editor.fps}</output>
    </label>

    <!-- Each count as wide as its widest value: the bar is centred, so a count
         that grew from 9/10 to 10/10 moved every control on it. -->
    {#if run.length > 1}<span class="at" style:min-width={widest(run.length)}
        >{at + 1}/{run.length}</span
      >{/if}
    {#if cycle}<span class="at" title="Phase" style:min-width={widest(cycle.phases.length)}
        >{phase + 1}/{cycle.phases.length}</span
      >{/if}
  </div>
{/if}

<style>
  .bar {
    position: absolute;
    left: 50%;
    /* Clear of the canvas's read-out line, which says the frame while playing
       and would sit under the bar's left end on a narrow pane. */
    bottom: 1.9rem;
    transform: translateX(-50%);
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    /* Its own width, not what is left of the pane right of `left: 50%` — which
       is half of it, and folded the bar onto two rows as soon as it named more
       than one thing. */
    width: max-content;
    max-width: calc(100% - 1.2rem);
    flex-wrap: wrap;
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--halo-border);
    border-radius: 8px;
    background: var(--halo-bg-main);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
    font-family: var(--halo-font-body);
    font-size: 0.72rem;
    color: var(--halo-text-main);
  }
  .what {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--halo-text-muted);
    white-space: nowrap;
  }
  /* The clip is what is being played — named, because "playing" alone does not
     say whether you are watching the door or the whole strip. */
  .clip {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    color: var(--halo-accent);
  }
  .rate {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--halo-text-muted);
  }
  /* Short enough that the whole bar stays ONE row: it sits over the art, and a
     control bar that wraps is taller than the thing it is describing. */
  .rate input[type="range"] {
    width: 5rem;
    accent-color: var(--halo-accent);
  }
  output,
  .at {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  /* fps runs 1–30: two digits' room, so dragging past 9 does not shift the bar. */
  output {
    min-width: 2ch;
  }
  .at {
    color: var(--halo-text-light);
  }
</style>
