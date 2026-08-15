<script lang="ts">
  // A new sprite: what it is called and how big it is.
  //
  // New used to be a button that took an unnamed 16×16 immediately, over
  // whatever you had open — the only route into a fresh document that did not
  // ask, and the only one that could throw away unsaved work without saying so.
  import { editor, newSprite } from "./editor.svelte";
  import Modal from "./Modal.svelte";
  import { clearDraft, forgetSaved } from "./persist";

  type Props = { open: boolean; onclose: () => void };
  let { open, onclose }: Props = $props();

  let name = $state("untitled");
  let w = $state(16);
  let h = $state(16);

  $effect(() => {
    if (!open) return;
    name = "untitled";
    w = 16;
    h = 16;
  });

  const ready = $derived(!!name.trim() && w > 0 && h > 0);
  const losing = $derived(editor.dirty);

  function create() {
    if (!ready) return;
    newSprite(name.trim(), w, h);
    // This document has never been on disk, so there is nothing for Revert to
    // go back to — and the last file's saved state is emphatically not it.
    forgetSaved();
    clearDraft();
    onclose();
  }
</script>

<Modal {open} title="New sprite" {onclose} onconfirm={create}>
  <div class="fields">
    <label class="field">
      <span>Name</span>
      <input bind:value={name} spellcheck="false" placeholder="car" />
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

  <p class="note">
    Saved as <code>{(name.trim() || "untitled") + ".json"}</code> in the open folder. A canvas crops or
    pads later — it never resamples.
  </p>

  {#if losing}
    <p class="warn">
      <strong>{editor.sprite.name}</strong> has unsaved changes. Creating a new sprite discards them.
    </p>
  {/if}

  {#snippet footer()}
    <span class="gap"></span>
    <button onclick={onclose}>Cancel</button>
    <button class="go" class:danger={losing} disabled={!ready} onclick={create}>
      {losing ? "Discard and create" : "Create"}
    </button>
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
  code {
    font-family: ui-monospace, monospace;
    font-size: 0.7rem;
    color: var(--halo-text-main);
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
  .go.danger {
    border-color: var(--halo-error);
    color: var(--halo-error);
    background: none;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
