<script lang="ts">
  // A new level: the subject at another size, derived from the size on screen
  // to be drawn over. Presets are fractions of that size, because "the same
  // deer, a third as big" is how the question is asked.
  import { levelPath } from "dab-core";
  import { untrack } from "svelte";

  import { addLevel, editor, selectNode, stageBox } from "./editor.svelte";
  import Modal from "./Modal.svelte";

  type Props = { open: boolean; onclose: () => void };
  let { open, onclose }: Props = $props();

  const PRESETS = [
    { label: "½", f: 1 / 2 },
    { label: "⅓", f: 1 / 3 },
    { label: "¼", f: 1 / 4 },
    { label: "×2", f: 2 },
  ];

  let name = $state("far");
  let w = $state(8);
  let h = $state(8);
  /** The size it derives from: the level on screen, or the whole assembly. */
  let from = $state({ w: 16, h: 16 });

  const taken = (n: string) => !!editor.sprite.levels?.some((l) => l.name === n);

  // Reset on OPENING only. Untracked, or the fields' own writes — and the
  // sprite changing when Create lands — rerun it, and it writes them again.
  $effect(() => {
    if (!open) return;
    untrack(() => {
      const box = stageBox();
      from = { w: box.w, h: box.h };
      let n = "far";
      for (let i = 2; taken(n); i++) n = `level ${i}`;
      name = n;
      pick(1 / 2);
    });
  });

  function pick(f: number) {
    w = Math.max(1, Math.round(from.w * f));
    h = Math.max(1, Math.round(from.h * f));
  }

  const ready = $derived(!!name.trim() && !taken(name.trim()) && w > 0 && h > 0);

  function create() {
    if (!ready) return;
    const made = addLevel(name, w, h);
    if (made) selectNode(levelPath(made));
    onclose();
  }
</script>

<Modal {open} title="New level" {onclose} onconfirm={create}>
  <div class="fields">
    <label class="field">
      <span>Name</span>
      <input bind:value={name} spellcheck="false" placeholder="far" />
    </label>
    <label class="field small">
      <span>Width</span>
      <input type="number" min="1" max="512" bind:value={w} />
    </label>
    <label class="field small">
      <span>Height</span>
      <input type="number" min="1" max="512" bind:value={h} />
    </label>
  </div>

  <div class="presets" role="group" aria-label="Size from the one on screen">
    {#each PRESETS as p (p.label)}
      <button
        class:on={w === Math.max(1, Math.round(from.w * p.f)) &&
          h === Math.max(1, Math.round(from.h * p.f))}
        onclick={() => pick(p.f)}
        title={`${Math.max(1, Math.round(from.w * p.f))}×${Math.max(1, Math.round(from.h * p.f))}`}
        >{p.label}</button
      >
    {/each}
    <span class="from">of {from.w}×{from.h}</span>
  </div>

  <p class="note">
    A start to draw over, not the art. Down keeps the silhouette whole, but a small detail is
    outvoted by what surrounds it — those are what to draw back in. Up rounds diagonals. Neither
    adds a colour, and it steps with the sprite: same frames, same animations.
  </p>
  {#if name.trim() && taken(name.trim())}
    <p class="warn">There is already a level called <strong>{name.trim()}</strong>.</p>
  {/if}

  {#snippet footer()}
    <span class="gap"></span>
    <button onclick={onclose}>Cancel</button>
    <button class="go" disabled={!ready} onclick={create}>Create</button>
  {/snippet}
</Modal>

<style>
  .fields {
    display: flex;
    gap: 0.5rem;
  }
  .field {
    display: grid;
    gap: 0.2rem;
    flex: 1;
    font-size: 0.72rem;
    color: var(--halo-text-muted);
  }
  .field.small {
    flex: 0 0 4.5rem;
  }
  input {
    width: 100%;
    background: var(--halo-bg-light);
    color: var(--halo-text-main);
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    padding: 0.3rem 0.4rem;
    font: inherit;
    font-size: 0.82rem;
  }
  input:focus-visible {
    outline: 2px solid var(--halo-accent);
    outline-offset: -1px;
  }
  .presets {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .presets button.on {
    border-color: var(--halo-accent);
    color: var(--halo-accent);
    background: var(--halo-accent-soft);
  }
  .from {
    font-size: 0.72rem;
    color: var(--halo-text-light);
    font-variant-numeric: tabular-nums;
  }
  .note {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--halo-text-light);
  }
  .warn {
    margin: 0;
    font-size: 0.74rem;
    line-height: 1.45;
    color: var(--halo-text-muted);
    border-left: 2px solid var(--halo-error);
    padding-left: 0.45rem;
  }
  .gap {
    flex: 1;
  }
  button {
    background: var(--halo-bg-light);
    color: var(--halo-text-main);
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    padding: 0.3rem 0.7rem;
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    border-color: var(--halo-text-light);
  }
  .go {
    border-color: var(--halo-accent);
    color: var(--halo-accent);
    background: var(--halo-accent-soft);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
