<script lang="ts">
  // A titled section of a rail, foldable.
  //
  // Every panel had grown its own header — the same uppercase heading and the
  // same row of actions beside it, six times, each drifting slightly. Folding is
  // the part that matters: the rails carry more than a laptop's height, and the
  // answer to "which of these six do I need right now" has to be yours rather
  // than the layout's.
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import type { Snippet } from "svelte";

  import { panels, toggleFold } from "./panels.svelte";

  type Props = {
    /** Stable across renames: it is the key the fold is remembered under. */
    id: string;
    title: string;
    children: Snippet;
    /** Buttons that belong to the panel rather than to its content. */
    actions?: Snippet;
    /** A count or a size, shown quiet beside the title — readable while folded. */
    badge?: string;
    /** Panels that are the point of the pane they are in do not fold. */
    fixed?: boolean;
    /**
     * `row` for a panel in a bar rather than a rail: the header sits at the
     * left and the body flows to its right, on one line.
     *
     * A rail panel can push its actions to the far edge because the far edge is
     * a few hundred pixels away. In a bar it is the whole window, which left the
     * frame buttons stranded in the middle of the screen with nothing near them.
     */
    layout?: "column" | "row";
  };

  let { id, title, children, actions, badge, fixed = false, layout = "column" }: Props = $props();

  const folded = $derived(!fixed && !!panels.folded[id]);
</script>

<section class:folded data-layout={layout}>
  <header>
    {#if fixed}
      <h2>{title}</h2>
    {:else}
      <button class="fold" onclick={() => toggleFold(id)} aria-expanded={!folded}>
        {#if folded}<ChevronRight size={12} />{:else}<ChevronDown size={12} />{/if}
        <h2>{title}</h2>
      </button>
    {/if}
    <!-- The badge survives folding, because saying "6" while hiding the six is
         the point of it. The actions do not: a button that edits what you have
         just put away is noise, and in a bar it is noise next to the canvas. -->
    {#if badge}<span class="badge">{badge}</span>{/if}
    {#if actions && !folded}<div class="acts">{@render actions()}</div>{/if}
  </header>
  {#if !folded}
    <div class="body">{@render children()}</div>
  {/if}
</section>

<style>
  section {
    display: grid;
    gap: 0.4rem;
    align-content: start;
    min-width: 0;
  }
  /* In a bar the header is a label at the head of the row, not a strip across
     the top of a column — so it keeps its natural width and the body sits
     beside it. */
  section[data-layout="row"] {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    min-width: 0;
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 1.5rem;
  }
  section[data-layout="row"] > header {
    flex: none;
    padding-top: 0.15rem;
  }
  section[data-layout="row"] > .body {
    flex: 1;
    min-width: 0;
  }
  .fold {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: none;
    border: 0;
    padding: 0;
    margin-left: -0.15rem;
    color: var(--halo-text-muted);
    cursor: pointer;
    font: inherit;
  }
  .fold:hover {
    color: var(--halo-text-main);
  }
  h2 {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: inherit;
  }
  header > h2 {
    color: var(--halo-text-muted);
  }
  .badge {
    font-size: 0.68rem;
    color: var(--halo-text-light);
    font-variant-numeric: tabular-nums;
  }
  .acts {
    margin-left: auto;
    display: flex;
    gap: 0.2rem;
  }
  section[data-layout="row"] .acts {
    margin-left: 0.15rem;
  }
  .body {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }
</style>
