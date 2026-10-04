<script lang="ts">
  // NAVIGATE — the left region, answering "what exists?", as ONE tree.
  //
  // The folder's files, and under the open one what it is made of: its levels
  // and its parts, where they live — a part is inside its file. This used to be
  // two tabs, Parts and Folder, and a person had to hold in their head that the
  // tree on one tab belonged to the row lit on the other. Godot and Unity keep
  // the file browser and the scene tree apart because a scene is assembled from
  // many files; a sprite is one file, so here the two are one list.
  //
  // Exactly one file is unfolded, and it is the open one. Peeking into a closed
  // sprite would show rows that look drawable and are not — the split again,
  // inside one list — so a closed file is a row you open, and that is all.
  import Plus from "@lucide/svelte/icons/plus";
  import Search from "@lucide/svelte/icons/search";
  import X from "@lucide/svelte/icons/x";
  import { tick } from "svelte";

  import { addPart, editor, selectNode, usedBy } from "./editor.svelte";
  import type { Entry, Folder } from "./files";
  import IconButton from "./IconButton.svelte";
  import { type MenuItem, openMenu } from "./menu.svelte";
  import { openPartDialog, partDialog } from "./partdialog.svelte";
  import Parts from "./Parts.svelte";
  import Thumbnail from "./Thumbnail.svelte";

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

  /** The open document is in the folder — or it is new, flattened or the
   *  example, and stands above the files as the one thing not yet among them. */
  const openInFolder = $derived(entries.some((e) => e.file === editor.file));

  let filter = $state("");
  /** Worth a filter somewhere around the point the list stops being scannable. */
  const FILTERABLE = 8;
  // The open sprite stays whatever the filter says: it is what you are drawing.
  const shown = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.file === editor.file || e.sprite.name.toLowerCase().includes(q));
  });

  /** A closed file's verbs. Writes need a writable folder; without one they
   *  grey with the reason rather than vanish. The open file's verbs are its
   *  node's, on its own row. */
  function fileMenu(e: MouseEvent, entry: Entry) {
    const cantWrite = !folder
      ? "open a folder first"
      : !canWrite
        ? "this browser cannot write"
        : null;
    const borrowers = usedBy(entry.sprite.name);
    const items: MenuItem[] = [
      { label: "Open", run: () => onopen(entry) },
      { kind: "separator" },
      {
        label: "Rename…",
        hint: cantWrite ?? undefined,
        disabled: !!cantWrite,
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
          entry.sprite.name === editor.sprite.name
            ? "a sprite cannot borrow itself"
            : `of ${editor.sprite.name}`,
        disabled: entry.sprite.name === editor.sprite.name,
        run: () => {
          const name = addPart({ use: entry.sprite.name });
          if (name) selectNode([name]);
        },
      },
      { kind: "separator" },
      {
        label: "Delete",
        hint: borrowers.length
          ? `${borrowers.join(", ")} draw${borrowers.length === 1 ? "s" : ""} it`
          : (cantWrite ?? undefined),
        disabled: !!cantWrite,
        danger: true,
        run: () => ondelete(entry),
      },
    ];
    openMenu(e, entry.file, items);
  }

  // Opening a sprite unfolds it where it sits in the list, which in a long
  // folder can be below the fold — so it is brought into view.
  let body = $state<HTMLElement>();
  $effect(() => {
    void editor.file;
    void tick().then(() => body?.querySelector(".open")?.scrollIntoView({ block: "nearest" }));
  });

  const meta = (e: Entry) =>
    `${e.sprite.w}×${e.sprite.h}${e.sprite.frames.length > 1 ? ` ·${e.sprite.frames.length}f` : ""}`;
</script>

<aside class="nav">
  <!-- The heading names the folder and says how much is in it; what belongs to
       the panel rather than to a row sits at the end of the same line. -->
  <div class="head">
    <span class="title" title={folder ? `The folder ${folder.name}` : undefined}>
      {folder?.name ?? "Sprite"}
    </span>
    {#if folder}<span class="count">{entries.length}</span>{/if}
    <div class="acts">
      <IconButton
        size="sm"
        active={partDialog.open}
        label="Add a part to what is selected"
        onclick={openPartDialog}
      >
        <Plus size={13} />
      </IconButton>
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
    </div>
  </div>

  <!-- The body scrolls; the heading stays put. -->
  <div class="body" bind:this={body}>
    {#if !folder}
      <p class="note">
        {#if canWrite}
          Open a sprites folder to load and save in place.
        {:else}
          This browser has no file-system access: drop a <code>.json</code> here to open one, and Save
          downloads. Chrome or Edge writes in place.
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

    {#if !openInFolder}
      <div class="open">
        <Parts {ondetach} {onopensprite} />
      </div>
    {/if}

    <ul class="files">
      {#each shown as e (e.file)}
        {#if e.file === editor.file}
          <li class="open"><Parts {ondetach} {onopensprite} /></li>
        {:else}
          <li class="file" oncontextmenu={(ev) => fileMenu(ev, e)}>
            <button onclick={() => onopen(e)} title={`Open ${e.file}`}>
              <span class="shot">
                <Thumbnail node={e.sprite} frame={0} assembly height="1.4rem" />
              </span>
              <span class="name">{e.sprite.name}</span>
              <small>{meta(e)}</small>
            </button>
          </li>
        {/if}
      {/each}
    </ul>

    {#if filter && shown.length <= (openInFolder ? 1 : 0)}
      <p class="note">Nothing else matches <code>{filter}</code>.</p>
    {/if}

    {#each problems as p (p.file)}
      <p class="bad">{p.file}: {p.errors[0]}</p>
    {/each}
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
    color: var(--halo-text-main);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex: none;
    min-height: 2rem;
    padding: 0 0.25rem 0 0.6rem;
    border-bottom: 1px solid var(--halo-border);
  }
  .title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--halo-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .count {
    font-size: 0.68rem;
    color: var(--halo-text-light);
    font-variant-numeric: tabular-nums;
  }
  .acts {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    margin-left: auto;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--halo-border) transparent;
    display: grid;
    gap: 0.4rem;
    align-content: start;
    padding: 0.5rem 0.6rem;
  }
  .files {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.1rem;
  }
  /* The open sprite and everything in it, set apart as one block — the ground
     says "these rows belong together", the accent on its row says which one
     you are drawing. Only when there IS more than its row, and drawn rather
     than laid out: opening a sprite with nothing inside must not move the
     list by a pixel, or the jump reads as something having unfolded. */
  .open {
    border-radius: 5px;
  }
  .open:has(:global(li + li)) {
    background: var(--halo-bg-main);
    box-shadow: 0 0 0 1px var(--halo-border);
  }
  .file button {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    width: 100%;
    min-height: 1.6rem;
    padding: 0.1rem 0.25rem;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--halo-text-main);
    font: inherit;
    font-size: 0.78rem;
    text-align: left;
    cursor: pointer;
  }
  .file button:hover {
    border-color: var(--halo-border);
    background: var(--halo-bg-main);
  }
  /* The same picture box a part row has: a file is identified by looking at it
     too, and one box shape down the column reads as one list. */
  .shot {
    flex: none;
    width: 1.9rem;
    height: 1.5rem;
    display: grid;
    place-items: center;
    padding: 1px;
    border-radius: 3px;
    background: #1e1e1e;
    box-shadow: 0 0 0 1px var(--halo-border);
    overflow: hidden;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    color: var(--halo-text-light);
    font-size: 0.68rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
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
