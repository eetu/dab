<script lang="ts">
  // Settings: the few choices that are about the APP rather than the document.
  //
  // A dialog rather than a panel because these are set once and left — a theme
  // is not something you adjust mid-drawing, and a permanent panel would spend
  // rail height on it forever.
  import Modal from "./Modal.svelte";
  import SegmentedControl from "./SegmentedControl.svelte";
  import { setTheme, theme, THEMES } from "./theme.svelte";

  type Props = { open: boolean; onclose: () => void };
  let { open, onclose }: Props = $props();
</script>

<Modal {open} title="Settings" {onclose}>
  <div class="row">
    <span class="what">Theme</span>
    <SegmentedControl
      label="Theme"
      options={THEMES}
      value={theme.choice}
      onchange={(id) => setTheme(id as (typeof THEMES)[number]["id"])}
    />
  </div>
  <p class="note">
    Auto follows the system. The drawing surface stays dark either way — pixels are judged against a
    dark plate, and the checker says what is transparent.
  </p>

  {#snippet footer()}
    <span class="gap"></span>
    <button class="go" onclick={onclose}>Done</button>
  {/snippet}
</Modal>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }
  .what {
    font-size: 0.8rem;
    color: var(--halo-text-muted);
    min-width: 4rem;
  }
  .note {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--halo-text-light);
  }
</style>
