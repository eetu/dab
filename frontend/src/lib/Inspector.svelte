<script lang="ts">
  // The document: what it is called, what it will be saved as, and how it is
  // being looked at. Size moved to the top bar, because a canvas size is a fact
  // about the document rather than a setting, and because the question it really
  // asks — which pixels — needs a picture to answer.
  import Info from "@lucide/svelte/icons/info";

  import { activeRef, editor, rename, stageBox, usedBy } from "./editor.svelte";
  import Panel from "./Panel.svelte";
  import { cell, fit } from "./viewport.svelte";

  const box = $derived(stageBox());
  /** The part being looked at, when it borrows its pixels from another sprite. */
  const borrowed = $derived(activeRef());
  /** Follows the document when it is loaded or renamed from elsewhere (undo). */
  const name = $derived(editor.sprite.name);

  // The filename follows the sprite's name, and saving MOVES the file. The sheet
  // is globbed from the folder, so that is all a rename needs — unless the scene
  // asks for this sprite by name (SIGN_NAMES, CROWN_NAMES, "car", "spoke"), in
  // which case that constant has to follow. Say which, rather than leaving it to
  // be discovered as a hole in the picture.
  const willWrite = $derived(`${editor.sprite.name}.json`);
  const renamed = $derived(!!editor.file && editor.file !== willWrite);
  /** Sprites whose parts borrow this one by name. A rename moves one file and
   *  leaves every reference to the old name pointing at nothing. */
  const borrowers = $derived(usedBy(editor.file?.replace(/\.json$/, "") ?? ""));
</script>

<!-- A Panel like its five siblings — this was the one hand-rolled heading left.
     `fixed`, because the document's name is the point of the rail it heads. -->
<Panel id="sprite" title="Sprite" fixed>
  <label>
    <span>Name</span>
    <input
      value={name}
      spellcheck="false"
      onchange={(e) => rename((e.target as HTMLInputElement).value.trim())}
    />
  </label>
  <!-- ONE line, always rendered, details in the tooltip: this used to be a
       paragraph that appeared, vanished and re-wrapped as the selection moved
       through the tree, bouncing everything under it by a few lines each time.
       A panel must not change height because of what is selected. -->
  <p
    class="ctx"
    title={borrowed
      ? `${editor.path.join("/")} draws ${borrowed.use} — its size, palette and frames are that sprite's, read-only here. What belongs to this sprite is where the part sits.`
      : editor.path.length
        ? `Editing ${editor.path.join("/")} — its canvas size, palette, frames and clips are the part's own. The name above is still the sprite's.`
        : "Editing the sprite itself. Pick a part in the tree below to draw on it instead."}
  >
    <Info size={11} />
    {#if borrowed}
      <span>draws <code>{borrowed.use}</code> — read-only here</span>
    {:else if editor.path.length}
      <span>editing <code>{editor.path.join("/")}</code> — its own frames and colours</span>
    {:else}
      <span>editing the sprite itself</span>
    {/if}
  </p>
  {#if renamed}
    <p class="warn">
      Save moves <code>{editor.file}</code> → <code>{willWrite}</code>. The sheet is read from the
      folder, so nothing needs importing — but if the scene names this sprite (<code
        >SIGN_NAMES</code
      >, <code>CROWN_NAMES</code>, <code>car</code>, <code>spoke</code>), update it in
      <code>drive-sprites.ts</code>.
    </p>
    {#if borrowers.length}
      <p class="warn">
        {borrowers.length === 1 ? "1 sprite uses" : `${borrowers.length} sprites use`} this one as a part:
        {#each borrowers as b, i (b)}<code>{b}</code>{i < borrowers.length - 1 ? ", " : ""}{/each}.
        A part names a sprite, so the rename leaves those pointing at nothing — open each and pick
        the new name.
      </p>
    {/if}
  {/if}

  <!-- One row, not two: every saved line here is a line the parts tree gets on
       a laptop, and these two are both about looking, not editing. -->
  <div class="row">
    <button onclick={() => fit(box.w, box.h)} title="Fit to view (0)">Fit ×{cell()}</button>
    <label class="grid-toggle">
      <input type="checkbox" bind:checked={editor.grid} />
      <span>Pixel grid</span>
    </label>
  </div>
</Panel>

<style>
  label {
    display: grid;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--halo-text-muted);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .grid-toggle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.78rem;
    color: var(--halo-text-muted);
    cursor: pointer;
  }
  input:not([type]) {
    background: var(--halo-bg-main);
    color: var(--halo-text-main);
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    padding: 0.2rem 0.4rem;
    font: inherit;
  }
  button {
    background: var(--halo-bg-main);
    color: var(--halo-text-main);
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    padding: 0.3rem;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  /* Fixed at one line whatever is selected; the tooltip carries the paragraph. */
  .ctx {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.7rem;
    color: var(--halo-text-light);
    white-space: nowrap;
    cursor: help;
  }
  .ctx span {
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .warn {
    margin: 0;
    font-size: 0.7rem;
    line-height: 1.45;
    color: var(--halo-text-muted);
    border-left: 2px solid var(--halo-accent);
    padding-left: 0.4rem;
  }
  code {
    font-family: ui-monospace, monospace;
    font-size: 0.68rem;
    color: var(--halo-text-main);
  }
</style>
