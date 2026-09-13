<script lang="ts">
  // NAVIGATE — the left region, answering "what exists?".
  //
  // The open sprite's parts and the folder's files are both lists you go to,
  // pick from, and leave. Stacked in one column they competed for a laptop's
  // height; as tabs each gets the whole column for one row of chrome, and the
  // panel about what you are drawing sits on the other side of the canvas where
  // the family keeps it — Navigate left, Surface centre, Subject right, the tool
  // rail beside the Subject.
  import Plus from "@lucide/svelte/icons/plus";
  import X from "@lucide/svelte/icons/x";
  import { isPartRef, type SpriteBody } from "dab-core";

  import { editor } from "./editor.svelte";
  import type { Entry, Folder } from "./files";
  import IconButton from "./IconButton.svelte";
  import { type NavTab, panels, setNavTab } from "./panels.svelte";
  import { openPartDialog, partDialog } from "./partdialog.svelte";
  import Parts from "./Parts.svelte";
  import Sprites from "./Sprites.svelte";

  type Props = {
    entries: Entry[];
    problems: { file: string; errors: string[] }[];
    folder: Folder | null;
    canWrite: boolean;
    onopen: (entry: Entry) => void;
    onrename: (entry: Entry) => void;
    onduplicate: (entry: Entry) => void;
    ondelete: (entry: Entry) => void;
    onforget?: () => void;
    ondetach?: (path: string[]) => void;
    onopensprite?: (name: string) => void;
  };

  let {
    entries,
    problems,
    folder,
    canWrite,
    onopen,
    onrename,
    onduplicate,
    ondelete,
    onforget,
    ondetach,
    onopensprite,
  }: Props = $props();

  /** What a tab can say without being opened. A `use` part is a leaf here, as it
   *  is in the tree: what is counted is what is drawn. */
  const partCount = $derived.by(() => {
    let n = 0;
    const walk = (node: SpriteBody) => {
      for (const p of node.parts ?? []) {
        n++;
        if (!isPartRef(p)) walk(p);
      }
    };
    walk(editor.sprite);
    return n;
  });

  const TABS: { id: NavTab; label: string }[] = [
    { id: "parts", label: "Parts" },
    { id: "folder", label: "Folder" },
  ];
  const counts = $derived<Record<NavTab, number>>({ parts: partCount, folder: entries.length });
</script>

<aside class="nav">
  <!-- The tab is the panel's heading, so the actions that belong to the panel
       rather than to its content sit at the end of the same row. -->
  <div class="tabs" role="tablist" aria-label="What exists">
    {#each TABS as t (t.id)}
      <button
        role="tab"
        class:on={panels.nav === t.id}
        aria-selected={panels.nav === t.id}
        onclick={() => setNavTab(t.id)}
      >
        {t.label}{#if counts[t.id]}<span class="count">{counts[t.id]}</span>{/if}
      </button>
    {/each}
    <div class="acts">
      {#if panels.nav === "parts"}
        <IconButton
          size="sm"
          active={partDialog.open}
          label="Add a part to what is selected"
          onclick={openPartDialog}
        >
          <Plus size={13} />
        </IconButton>
      {:else if folder && onforget}
        <IconButton
          size="sm"
          ghost
          label="Forget this folder"
          hint={`Disconnect from ${folder.name} — files are not touched`}
          onclick={onforget}
        >
          <X size={12} />
        </IconButton>
      {/if}
    </div>
  </div>

  <!-- The body scrolls; the tabs stay put. -->
  <div class="body">
    {#if panels.nav === "parts"}
      <Parts {ondetach} {onopensprite} />
    {:else}
      <Sprites
        {entries}
        {problems}
        {folder}
        {canWrite}
        {onopen}
        {onrename}
        {onduplicate}
        {ondelete}
      />
    {/if}
  </div>
</aside>

<style>
  .nav {
    display: flex;
    flex-direction: column;
    /* A grid item has to be allowed to be shorter than its contents before the
       body below can scroll instead of growing the whole app. */
    min-height: 0;
    background: var(--halo-bg-light);
  }
  .tabs {
    display: flex;
    align-items: stretch;
    flex: none;
    padding-right: 0.25rem;
    border-bottom: 1px solid var(--halo-border);
  }
  .tabs button[role="tab"] {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-width: 0;
    padding: 0.4rem 0.3rem;
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--halo-text-muted);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
  }
  .tabs button:hover {
    color: var(--halo-text-main);
  }
  /* An underline, not a filled pill: the mark has to read as "this one continues
     below", and a filled chip is what `active` means everywhere else here. */
  .tabs button.on {
    border-bottom-color: var(--halo-accent);
    color: var(--halo-accent);
  }
  .count {
    font-size: 0.68rem;
    font-weight: 400;
    letter-spacing: 0;
    color: var(--halo-text-light);
    font-variant-numeric: tabular-nums;
  }
  .tabs button.on .count {
    color: var(--halo-accent);
  }
  .acts {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--halo-border) transparent;
    display: grid;
    gap: 0.6rem;
    align-content: start;
    padding: 0.5rem 0.6rem;
  }
</style>
