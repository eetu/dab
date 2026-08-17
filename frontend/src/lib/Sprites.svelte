<script lang="ts">
  // The folder: what is in it, and which one is open.
  //
  // Navigation, not the document — you use it to get somewhere and then you are
  // there for an hour. So it sits BELOW the panels about the sprite you are
  // actually drawing, it folds, and it keeps its own scroller: thirty sprites
  // used to push the parts tree off the bottom of a laptop.
  import Search from "@lucide/svelte/icons/search";
  import X from "@lucide/svelte/icons/x";

  import { addPart, editor, selectNode, usedBy } from "./editor.svelte";
  import type { Entry, Folder } from "./files";
  import IconButton from "./IconButton.svelte";
  import { type MenuItem, openMenu } from "./menu.svelte";
  import Panel from "./Panel.svelte";

  type Props = {
    entries: Entry[];
    problems: { file: string; errors: string[] }[];
    folder: Folder | null;
    canWrite: boolean;
    onopen: (entry: Entry) => void;
    onrename: (entry: Entry) => void;
    onduplicate: (entry: Entry) => void;
    ondelete: (entry: Entry) => void;
    /** Disconnect from the folder — the handle is forgotten, no file is touched. */
    onforget?: () => void;
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
  }: Props = $props();

  /** The folder's verbs, on the file under the cursor. Writes need a writable
   *  folder; without one they grey with the reason rather than vanish. */
  function rowMenu(e: MouseEvent, entry: Entry) {
    const cantWrite = !folder
      ? "open a folder first"
      : !canWrite
        ? "this browser cannot write"
        : null;
    const isOpen = editor.file === entry.file;
    const borrowers = usedBy(entry.sprite.name);
    const items: MenuItem[] = [
      {
        label: "Open",
        hint: isOpen ? "it is open" : undefined,
        disabled: isOpen,
        run: () => onopen(entry),
      },
      { kind: "separator" },
      {
        label: "Rename…",
        hint: isOpen ? "rename it in the Sprite panel" : (cantWrite ?? undefined),
        disabled: isOpen || !!cantWrite,
        run: () => onrename(entry),
      },
      {
        label: "Duplicate",
        hint: cantWrite ?? undefined,
        disabled: !!cantWrite,
        run: () => onduplicate(entry),
      },
      {
        label: "Add as part",
        hint:
          entry.sprite.name === editor.sprite.name ? "a sprite cannot borrow itself" : undefined,
        disabled: entry.sprite.name === editor.sprite.name,
        run: () => {
          const name = addPart({ use: entry.sprite.name });
          if (name) selectNode([name]);
        },
      },
      { kind: "separator" },
      {
        label: "Delete",
        hint: isOpen
          ? "it is open — open another sprite first"
          : borrowers.length
            ? `${borrowers.join(", ")} draw${borrowers.length === 1 ? "s" : ""} it`
            : (cantWrite ?? undefined),
        disabled: isOpen || !!cantWrite,
        danger: true,
        run: () => ondelete(entry),
      },
    ];
    openMenu(e, entry.file, items);
  }

  let filter = $state("");

  /** Worth a filter somewhere around the point the list stops being scannable. */
  const FILTERABLE = 8;
  const shown = $derived(
    filter.trim()
      ? entries.filter((e) => e.sprite.name.toLowerCase().includes(filter.trim().toLowerCase()))
      : entries,
  );
</script>

<Panel id="sprites" title="Folder" badge={entries.length ? String(entries.length) : undefined}>
  {#snippet actions()}
    {#if folder && onforget}
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
  {/snippet}
  {#if !folder}
    <p class="note">
      {#if canWrite}
        Open <code>packages/player/src/sprites</code> to load and save in place.
      {:else}
        This browser has no file-system access: drop a <code>.json</code> here to open one, and Save downloads.
        Chrome or Edge writes in place.
      {/if}
    </p>
  {/if}

  {#if entries.length > FILTERABLE}
    <label class="find">
      <Search size={12} />
      <input
        bind:value={filter}
        placeholder="Filter"
        spellcheck="false"
        aria-label="Filter sprites"
      />
      {#if filter}
        <IconButton size="sm" ghost label="Clear the filter" onclick={() => (filter = "")}>
          <X size={12} />
        </IconButton>
      {/if}
    </label>
  {/if}

  <ul class="list">
    {#each shown as e (e.file)}
      <li oncontextmenu={(ev) => rowMenu(ev, e)}>
        <button class:on={editor.file === e.file} onclick={() => onopen(e)} title={e.file}>
          {e.sprite.name}
          <small
            >{e.sprite.w}×{e.sprite.h}{e.sprite.frames.length > 1
              ? ` ·${e.sprite.frames.length}f`
              : ""}{(e.sprite.parts?.length ?? 0) > 0 ? ` ·${e.sprite.parts!.length}p` : ""}</small
          >
        </button>
      </li>
    {/each}
  </ul>

  {#if filter && !shown.length}
    <p class="note">Nothing here matches <code>{filter}</code>.</p>
  {/if}

  {#each problems as p (p.file)}
    <p class="bad">{p.file}: {p.errors[0]}</p>
  {/each}
</Panel>

<style>
  .find {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0 0.35rem;
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    background: var(--halo-bg-main);
    color: var(--halo-text-light);
  }
  .find input {
    flex: 1;
    min-width: 0;
    background: none;
    border: 0;
    padding: 0.25rem 0;
    color: var(--halo-text-main);
    font: inherit;
    font-size: 0.78rem;
  }
  .find input:focus-visible {
    outline: none;
  }
  /* Its own scroller, so the list is as long as it likes without moving
     anything above it. */
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.15rem;
    max-height: 34dvh;
    overflow-y: auto;
    min-height: 0;
  }
  .list button {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.4rem;
    width: 100%;
    padding: 0.2rem 0.35rem;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--halo-text-main);
    font: inherit;
    font-size: 0.8rem;
    text-align: left;
    cursor: pointer;
  }
  .list button:hover {
    border-color: var(--halo-border);
    background: var(--halo-bg-main);
  }
  .list button.on {
    border-color: var(--halo-accent);
    color: var(--halo-accent);
    background: var(--halo-accent-soft);
  }
  small {
    color: var(--halo-text-light);
    font-size: 0.68rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .note {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--halo-text-light);
  }
  .bad {
    margin: 0;
    font-size: 0.7rem;
    line-height: 1.4;
    color: var(--halo-error);
  }
  code {
    font-family: ui-monospace, monospace;
    font-size: 0.68rem;
    color: var(--halo-text-muted);
  }
</style>
