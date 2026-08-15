<script lang="ts">
  // Adding a part: where the pixels come from, and what to call it.
  //
  // Four routes to the same thing, so it is a choice — which is exactly what an
  // inline row of buttons is bad at. The row appeared under the panel header
  // where you were not looking, stayed open if you wandered off, and pushed the
  // tree down while it was there.
  import { MAX_PART_DEPTH } from "dab-core";

  import {
    activeNode,
    addPart,
    editor,
    hasSelection,
    partFromSelection,
    selection,
    selectNode,
    sheet,
  } from "./editor.svelte";
  import Modal from "./Modal.svelte";

  type Props = { open: boolean; onclose: () => void };
  let { open, onclose }: Props = $props();

  type How = "blank" | "copy" | "move" | "borrow";

  let how = $state<How>("blank");
  let name = $state("part");
  let w = $state(8);
  let h = $state(8);
  let use = $state("");

  const node = $derived(activeNode());
  const where = $derived(editor.path.length ? editor.path.join("/") : editor.sprite.name);
  const selected = $derived(hasSelection());
  const size = $derived(
    selected ? `${selection.x1 - selection.x0 + 1}×${selection.y1 - selection.y0 + 1}` : "",
  );
  /** Anything in the folder but this sprite — a sprite cannot contain itself. */
  const borrowable = $derived(
    Object.keys(sheet.byName)
      .filter((n) => n !== editor.sprite.name)
      .sort(),
  );

  // Opening picks the route that fits what you have: a selection is almost
  // always why you came here, and it is gone once the dialog takes it.
  $effect(() => {
    if (!open) return;
    how = hasSelection() ? "copy" : "blank";
    name = "part";
    w = Math.min(8, activeNode().w);
    h = Math.min(8, activeNode().h);
    use = "";
  });

  /** Nesting has a floor in the format (MAX_PART_DEPTH); saying so here beats
   *  finding out at save time as "not saved — parts nest more than 4 deep". */
  const tooDeep = $derived(editor.path.length >= MAX_PART_DEPTH);

  const ready = $derived(
    !tooDeep &&
      (how === "borrow"
        ? !!use
        : how === "blank"
          ? !!name.trim() && w > 0 && h > 0
          : !!name.trim()),
  );

  function add() {
    if (!ready) return;
    const at = editor.path;
    const key =
      how === "borrow"
        ? addPart({ use })
        : how === "blank"
          ? addPart({ w, h, name: name.trim() })
          : partFromSelection(name.trim(), how === "move");
    onclose();
    // A borrowed part is not yours to draw on, so it does not steal the cursor.
    if (key && how !== "borrow") selectNode([...at, key]);
  }
</script>

<Modal {open} title="New part" subject={`in ${where}`} {onclose} onconfirm={add}>
  <fieldset>
    <legend>Where its pixels come from</legend>

    <label class="pick">
      <input type="radio" bind:group={how} value="blank" />
      <span class="what">Blank grid</span>
      <span class="why">An empty canvas to draw into</span>
    </label>

    <label class="pick" class:off={!selected}>
      <input type="radio" bind:group={how} value="copy" disabled={!selected} />
      <span class="what">Copy the selection</span>
      <span class="why">
        {selected
          ? `${size}, from every frame. The body keeps its pixels, so trimming this part shows them through.`
          : "Select a box on the canvas first"}
      </span>
    </label>

    <label class="pick" class:off={!selected}>
      <input type="radio" bind:group={how} value="move" disabled={!selected} />
      <span class="what">Move the selection</span>
      <span class="why">
        {selected ? `${size}, cleared from ${where}` : "Select a box on the canvas first"}
      </span>
    </label>

    <label class="pick" class:off={!borrowable.length}>
      <input type="radio" bind:group={how} value="borrow" disabled={!borrowable.length} />
      <span class="what">Borrow a sprite</span>
      <span class="why">
        {borrowable.length
          ? "Draws another sprite in the folder. Every copy shares it."
          : "Nothing else in this folder to borrow"}
      </span>
    </label>
  </fieldset>

  {#if how === "borrow"}
    <label class="field">
      <span>Sprite</span>
      <select bind:value={use}>
        <option value="">Choose one…</option>
        {#each borrowable as n (n)}<option value={n}>{n}</option>{/each}
      </select>
    </label>
  {:else}
    <div class="fields">
      <label class="field">
        <span>Name</span>
        <input bind:value={name} spellcheck="false" placeholder="doorL" />
      </label>
      {#if how === "blank"}
        <label class="field small">
          <span>Width</span>
          <input type="number" min="1" max={node.w} bind:value={w} />
        </label>
        <label class="field small">
          <span>Height</span>
          <input type="number" min="1" max={node.h} bind:value={h} />
        </label>
      {/if}
    </div>
  {/if}

  {#if tooDeep}
    <p class="deep">
      Parts nest at most {MAX_PART_DEPTH} deep, and {where} is already there — add this one to a part
      higher up.
    </p>
  {/if}

  {#snippet footer()}
    <span class="gap"></span>
    <button onclick={onclose}>Cancel</button>
    <button class="go" disabled={!ready} onclick={add}>Add part</button>
  {/snippet}
</Modal>

<style>
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    display: grid;
    gap: 0.1rem;
  }
  legend {
    padding: 0 0 0.3rem;
    font-size: 0.72rem;
    color: var(--halo-text-muted);
  }
  .pick {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0 0.45rem;
    align-items: baseline;
    padding: 0.3rem 0.4rem;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
  }
  .pick:hover {
    border-color: var(--halo-border);
  }
  .pick:has(input:checked) {
    border-color: var(--halo-accent);
    background: var(--halo-accent-soft);
  }
  .pick.off {
    cursor: default;
    opacity: 0.55;
  }
  input[type="radio"] {
    accent-color: var(--halo-accent);
    margin: 0;
  }
  .what {
    font-size: 0.82rem;
  }
  .why {
    grid-column: 2;
    font-size: 0.7rem;
    line-height: 1.4;
    color: var(--halo-text-light);
  }
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
  input:not([type="radio"]),
  select {
    width: 100%;
    background: var(--halo-bg-light);
    color: var(--halo-text-main);
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    padding: 0.3rem 0.4rem;
    font: inherit;
    font-size: 0.82rem;
  }
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--halo-accent);
    outline-offset: -1px;
  }
  .deep {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--halo-error);
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
