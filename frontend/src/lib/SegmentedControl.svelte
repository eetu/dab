<script lang="ts">
  // One of a small set, chosen by pressing it.
  //
  // The backdrop picker, the underlay picker and the preview's zoom presets were
  // three hand-rolled versions of this, each with its own idea of the on state.
  // A select would do the job, but not when the choice changes what you are
  // looking at — you want the alternatives visible while you compare.
  type Option<T> = { id: T; label: string; hint?: string };

  type Props<T> = {
    options: readonly Option<T>[];
    value: T;
    onchange: (id: T) => void;
    label: string;
    /** Fill the row rather than sitting at its natural width. */
    fill?: boolean;
  };

  let { options, value, onchange, label, fill = false }: Props<string | number> = $props();
</script>

<div class="seg" class:fill role="group" aria-label={label}>
  {#each options as o (o.id)}
    <button
      class:on={o.id === value}
      title={o.hint ?? o.label}
      aria-pressed={o.id === value}
      onclick={() => onchange(o.id)}
    >
      {o.label}
    </button>
  {/each}
</div>

<style>
  .seg {
    display: flex;
    gap: 0.1rem;
    padding: 0.1rem;
    border: 1px solid var(--halo-border);
    border-radius: 5px;
    background: var(--halo-bg-light);
  }
  .seg.fill {
    width: 100%;
  }
  .seg.fill button {
    flex: 1;
  }
  button {
    background: none;
    border: 0;
    border-radius: 3px;
    padding: 0.15rem 0.4rem;
    color: var(--halo-text-muted);
    font: inherit;
    font-size: 0.7rem;
    cursor: pointer;
    white-space: nowrap;
  }
  button:hover:not(.on) {
    color: var(--halo-text-main);
  }
  button.on {
    background: var(--halo-accent-soft);
    color: var(--halo-accent);
  }
  button:focus-visible {
    outline: 2px solid var(--halo-accent);
    outline-offset: -1px;
  }
</style>
