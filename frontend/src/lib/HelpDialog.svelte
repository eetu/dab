<script lang="ts">
  // How to use the thing, in the thing — for the standalone build especially,
  // where there is no README within reach and no repo to go read.
  import { TOOLS } from "./editor.svelte";
  import Modal from "./Modal.svelte";

  type Props = { open: boolean; onclose: () => void; onexample?: () => void };
  let { open, onclose, onexample }: Props = $props();

  const KEYS: [string, string][] = [
    ["⌘S", "Save — writes the file in place (Chrome/Edge), downloads elsewhere"],
    ["⌘Z / ⇧⌘Z", "Undo / redo — a whole drag, paste or turn is one entry"],
    ["⌘A / ⌘C / ⌘X / ⌘V", "Select all, copy, cut, paste — pastes float until you let go"],
    ["Esc", "Abort the drag, cancel the floating paste, then deselect — never commits"],
    ["Arrows (⇧ ×10)", "Nudge the selection, or the selected part under Move; else step frames"],
    ["⌫", "Delete the selection, or the selected part under Move"],
    [", / .", "Previous / next frame, whatever is selected"],
    ["P / N", "Play or stop · onion skin"],
    ["Space-drag / ⌘-wheel", "Pan · zoom at the cursor (0 fits, + and − step)"],
    ["⌥-click", "Pick the colour under the cursor, from any tool"],
    ["⌘B / ⌘⌥B / ⌘J", "Toggle the left rail, right rail, bottom dock"],
  ];
</script>

<Modal {open} title="How dab works" {onclose}>
  <div class="cols">
    <section>
      <h3>The idea</h3>
      <p>
        A sprite is rows of characters plus a palette — text that diffs as art. <code>.</code> is
        transparent; a colour is <code>#rrggbb</code> or <code>#rrggbbaa</code> for glass. Files are edited
        in place: open a folder (Chrome/Edge), draw, ⌘S. Unsaved work survives reloads, and Revert goes
        back to what is on disk.
      </p>
      <h3>Right-click everything</h3>
      <p>
        Every row, thumbnail, swatch and the canvas answers with a menu of what applies there —
        greyed verbs say why they cannot. The ⋯ on a row opens the same menu.
      </p>
      <h3>Parts</h3>
      <p>
        A part is a grid of its own at an offset — a door, a wheel — with its own frames, so a door
        opens without multiplying the car's strip. Inline for one subject; <em>use</em> borrows another
        sprite in the folder, so one wheel serves every car. Move (V) drags a part; selecting a borrowed
        part is dashed — open its sprite to draw on it.
      </p>
      <h3>Frames, clips, variants</h3>
      <p>
        Frames run along the bottom; onion skin shows the previous one. A clip names a run of frames
        (<code>swing: 0 1 2</code>) — repeats hold. A variant recolours characters without
        redrawing; pick one to preview it, and it is what a consumer draws.
      </p>
      <h3>Rotation</h3>
      <p>
        Right-click → Rotate, then drag the round handle — it snaps at 90° (⌘ glides free). Quarter
        turns are exact; any other angle invents blend colours and the bar says how many before you
        apply. Keep rotating the <em>original</em> for animation frames — each angle reuses what
        earlier ones paid for. A sprite with parts does not turn whole —
        <em>Flatten to a sprite</em> bakes the assembly into one grid that does.
      </p>
    </section>
    <section>
      <h3>Tools</h3>
      <ul>
        {#each TOOLS as t (t.id)}
          <li><kbd>{t.key.toUpperCase()}</kbd> <strong>{t.label}</strong> — {t.hint}</li>
        {/each}
      </ul>
      <h3>Keys</h3>
      <ul>
        {#each KEYS as [k, what] (k)}
          <li><kbd>{k}</kbd> {what}</li>
        {/each}
      </ul>
    </section>
  </div>

  {#snippet footer()}
    <span class="hintline">Open this again with <kbd>?</kbd></span>
    <span class="gap"></span>
    {#if onexample}
      <button
        onclick={() => {
          onexample();
          onclose();
        }}
        title="A car with pop-up lights, doors and one wheel placed twice"
      >
        Open the example car
      </button>
    {/if}
    <button class="go" onclick={onclose}>Draw</button>
  {/snippet}
</Modal>

<style>
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.2rem;
    max-width: 44rem;
    max-height: 60dvh;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  @media (max-width: 720px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
  h3 {
    margin: 0.6rem 0 0.2rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--halo-text-muted);
  }
  h3:first-child {
    margin-top: 0;
  }
  p {
    margin: 0 0 0.4rem;
    font-size: 0.76rem;
    line-height: 1.5;
    color: var(--halo-text-main);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  li {
    font-size: 0.74rem;
    line-height: 1.4;
    color: var(--halo-text-main);
  }
  kbd {
    display: inline-block;
    min-width: 1.1rem;
    padding: 0 0.25rem;
    border: 1px solid var(--halo-border);
    border-bottom-width: 2px;
    border-radius: 4px;
    background: var(--halo-bg-light);
    font-family: ui-monospace, monospace;
    font-size: 0.68rem;
    text-align: center;
    color: var(--halo-text-main);
  }
  code {
    font-family: ui-monospace, monospace;
    font-size: 0.7rem;
    color: var(--halo-text-muted);
  }
  .hintline {
    font-size: 0.7rem;
    color: var(--halo-text-light);
  }
</style>
