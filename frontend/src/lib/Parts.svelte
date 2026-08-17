<script lang="ts">
  // The parts tree: what the subject is made of, and which of it you are drawing.
  //
  // The layers panel by another name, except that nothing here composites — each
  // row is a separate grid at an offset, with its own frames and its own state.
  // Which is why every row carries a frame picker: a door can be open while the
  // body is dented, and that is the whole reason parts exist.
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import FlipHorizontal from "@lucide/svelte/icons/flip-horizontal";
  import Layers from "@lucide/svelte/icons/layers";
  import Plus from "@lucide/svelte/icons/plus";
  import { isPartRef, type Part, type SpriteBody } from "dab-core";

  import AddPartDialog from "./AddPartDialog.svelte";
  import { ask } from "./dialog.svelte";
  import {
    duplicatePart,
    editor,
    flipNode,
    frameOf,
    inlinePart,
    movePart,
    pathKey,
    placePart,
    removePart,
    rename,
    renamePart,
    resolvePart,
    selectAll,
    selectNode,
    setPartBehind,
    setPartFlip,
    usePartInstead,
  } from "./editor.svelte";
  import IconButton from "./IconButton.svelte";
  import { type MenuItem, openMenu } from "./menu.svelte";
  import Panel from "./Panel.svelte";
  import { closePartDialog, openPartDialog, partDialog } from "./partdialog.svelte";
  import { openResize } from "./resize.svelte";
  import Thumbnail from "./Thumbnail.svelte";

  type Props = {
    /** Writing a file is App's job — it holds the folder handle. */
    ondetach?: (path: string[]) => void;
    /** So is opening one: it owns the folder listing and the dirty guard. */
    onopensprite?: (name: string) => void;
  };

  let { ondetach, onopensprite }: Props = $props();

  type Row = { path: string[]; part: Part | null; node: SpriteBody | null; depth: number };

  /** The tree, flattened, in draw order. A `use` part is a leaf: its own parts
   *  are not expanded, so what is listed is what is drawn. */
  const rows = $derived.by(() => {
    const out: Row[] = [{ path: [], part: null, node: editor.sprite, depth: 0 }];
    const walk = (n: SpriteBody, path: string[], depth: number) => {
      for (const p of n.parts ?? []) {
        const sub = [...path, p.name];
        const node = isPartRef(p) ? resolvePart(p.use) : p;
        out.push({ path: sub, part: p, node, depth });
        if (!isPartRef(p)) walk(p, sub, depth + 1);
      }
    };
    walk(editor.sprite, [], 1);
    return out;
  });

  const active = $derived(pathKey(editor.path));

  function siblingIndex(path: string[]): { i: number; of: number } {
    const key = pathKey(path.slice(0, -1));
    const sibs = rows.filter((r) => r.path.length && pathKey(r.path.slice(0, -1)) === key);
    return { i: sibs.findIndex((r) => pathKey(r.path) === pathKey(path)), of: sibs.length };
  }

  const shownOf = (path: string[]) => editor.shown[pathKey(path)] ?? 0;

  /** The frame a row's picture shows — the one it is drawn at on the canvas. */
  const shownFrame = (row: Row) => (row.node ? frameOf(row.path, row.node) : 0);

  /** One part's verbs. Renaming lives here rather than as a field on the row:
   *  it is rare, and a text input per part is a lot of row for it. */
  function itemsFor(row: Row): MenuItem[] {
    const at = siblingIndex(row.path);
    const name = row.path.at(-1)!;
    const use = row.part && isPartRef(row.part) ? row.part.use : null;
    return [
      // A borrowed part is a window onto another document. You cannot edit it
      // through the window — the undo stack holds one sprite — so the offers
      // are: go there, look through a different window, or take your own copy.
      ...(use
        ? [
            ...(onopensprite
              ? [
                  {
                    label: `Open ${use}`,
                    run: () => onopensprite(use),
                  } satisfies MenuItem,
                ]
              : []),
            {
              label: "Draw a different sprite…",
              hint: `now ${use}`,
              run: async () => {
                const to = await ask({
                  title: `What should ${name} draw?`,
                  label: "Sprite",
                  value: use,
                  note: "A name from this folder. The placement stays; the pixels come from there.",
                  confirm: "Point it there",
                });
                const pick = to?.trim();
                if (!pick) return;
                if (!resolvePart(pick)) {
                  editor.status = `${pick} is not in this folder`;
                  editor.statusBad = true;
                  return;
                }
                usePartInstead(row.path, pick);
              },
            } satisfies MenuItem,
            {
              label: "Make its pixels its own",
              run: () => inlinePart(row.path),
            } satisfies MenuItem,
            { kind: "separator" as const },
          ]
        : []),
      {
        label: "Rename…",
        run: async () => {
          const to = await ask({
            title: "Rename part",
            label: "Name",
            value: name,
            note: "What a consumer holds this part's state under.",
            confirm: "Rename",
          });
          if (to) renamePart(row.path, to);
        },
      },
      { kind: "separator" },
      {
        label: "Draw earlier",
        disabled: at.i <= 0,
        run: () => movePart(row.path, at.i - 1),
      },
      {
        label: "Draw later",
        disabled: at.i >= at.of - 1,
        run: () => movePart(row.path, at.i + 1),
      },
      { kind: "separator" },
      ...(ondetach && row.part && !isPartRef(row.part)
        ? [
            {
              label: "Detach to sprite…",
              run: () => ondetach(row.path),
            } satisfies MenuItem,
          ]
        : []),
      { label: "Duplicate", run: () => duplicatePart(row.path) },
      { label: "Remove", danger: true, run: () => removePart(row.path) },
    ];
  }

  function setShown(path: string[], value: string) {
    const key = pathKey(path);
    if (value === "follow") editor.shown[key] = "follow";
    else editor.shown[key] = Number(value);
  }

  /** The sprite's own verbs. The root used to be the one row with NO menu —
   *  excluded by two separate guards — which made the thing you are drawing the
   *  only thing you could not act on. */
  function rootItems(): MenuItem[] {
    return [
      {
        label: "Rename…",
        run: async () => {
          const to = await ask({
            title: "Rename sprite",
            label: "Name",
            value: editor.sprite.name,
            note: "The file moves with the name when you save.",
            confirm: "Rename",
          });
          if (to) rename(to.trim());
        },
      },
      { label: "Canvas size…", hint: `${editor.sprite.w}×${editor.sprite.h}`, run: openResize },
      { kind: "separator" },
      {
        label: "Flip horizontal",
        hint: editor.sprite.parts?.length ? "parts keep their places" : undefined,
        disabled: !!editor.sprite.parts?.length,
        run: () => flipNode("h"),
      },
      {
        label: "Flip vertical",
        disabled: !!editor.sprite.parts?.length,
        run: () => flipNode("v"),
      },
      { kind: "separator" },
      {
        label: "Select all",
        run: () => {
          editor.tool = "select";
          selectAll();
        },
      },
      { label: "Add part…", run: openPartDialog },
    ];
  }
</script>

<Panel id="parts" title="Parts" badge={rows.length > 1 ? String(rows.length - 1) : undefined}>
  {#snippet actions()}
    <IconButton
      size="sm"
      active={partDialog.open}
      label="Add a part to what is selected"
      onclick={openPartDialog}
    >
      <Plus size={13} />
    </IconButton>
  {/snippet}

  <ul>
    {#each rows as row (pathKey(row.path))}
      {@const key = pathKey(row.path)}
      {@const ref = row.part && isPartRef(row.part)}
      {@const missing = ref && !row.node}
      <li
        class:on={key === active}
        class:borrowed={ref}
        style:--depth={row.depth}
        oncontextmenu={(e) =>
          openMenu(
            e,
            row.part ? row.path.join("/") : editor.sprite.name,
            row.part ? itemsFor(row) : rootItems(),
          )}
      >
        <button
          class="pick"
          onclick={() => selectNode(row.path)}
          title={ref
            ? `Draws ${(row.part as { use: string }).use} — pick it up with Move (V)`
            : `Draw on ${key || "the sprite"}`}
        >
          <!-- You identify a layer by looking at it. The name is the label; the
               picture is what tells you which door this is. -->
          <span class="shot" class:borrowed={ref}>
            {#if row.node}
              <Thumbnail
                node={row.node}
                frame={shownFrame(row)}
                variant={editor.variant}
                assembly={row.path.length === 0}
                height="1.4rem"
              />
            {/if}
          </span>
          <span class="name">{row.path.at(-1) ?? editor.sprite.name}</span>
          {#if ref}<span class="tag" title={`Borrowed from ${(row.part as { use: string }).use}`}
              >{(row.part as { use: string }).use}</span
            >{/if}
          {#if missing}<span class="bad" title="No sprite in this folder has that name">?</span
            >{/if}
        </button>

        {#if row.node && row.node.frames.length > 1 && key !== active}
          <select
            class="frame"
            title="Which frame this part shows while you draw"
            value={String(shownOf(row.path))}
            onchange={(e) => setShown(row.path, (e.target as HTMLSelectElement).value)}
          >
            {#each row.node.frames as _, i (i)}<option value={String(i)}>{i + 1}</option>{/each}
            <option value="follow">↔</option>
          </select>
        {/if}

        <!-- The GLYPH carries the state — an open eye is visible, a struck one
             is not — never `active`, whose accent means "this is on" everywhere
             else and lit up here when the part was HIDDEN: exactly backwards. -->
        <IconButton
          size="sm"
          ghost
          label={editor.hidden[key]
            ? `Show ${row.path.at(-1) ?? "the sprite"}`
            : `Hide ${row.path.at(-1) ?? "the sprite"}`}
          hint={row.path.length
            ? "Hide while drawing — never written to the file"
            : "Hide the body and leave its parts — never written to the file"}
          onclick={() => (editor.hidden[key] = !editor.hidden[key])}
        >
          {#if editor.hidden[key]}<EyeOff size={12} />{:else}<Eye size={12} />{/if}
        </IconButton>

        {#if row.part}
          <!-- The three toggles stay on the row because they are STATE: which
               side of the parent it draws on, whether it is mirrored, whether it
               is hidden. Those have to be readable without opening anything.
               Every verb — reorder, rename, duplicate, remove — is in the menu,
               where the list can grow without the row growing with it. -->
          <div class="acts">
            <IconButton
              size="sm"
              active={!!row.part.behind}
              label="Draw behind the parent — a seat showing through the windows"
              onclick={() => setPartBehind(row.path, !row.part!.behind)}
            >
              <Layers size={12} />
            </IconButton>
            <!-- Cycles the FOUR states the format has, and says which it is on —
                 this used to hardcode `h`, so a hand-authored `flip:"v"` read as
                 active and was silently rewritten on the first click. -->
            <IconButton
              size="sm"
              active={!!row.part.flip}
              label={row.part.flip
                ? `Mirrored ${row.part.flip} — click to cycle`
                : "Mirror this part"}
              onclick={() => {
                const order = [null, "h", "v", "hv"] as const;
                const next = order[(order.indexOf(row.part!.flip ?? null) + 1) % order.length];
                setPartFlip(row.path, next);
              }}
            >
              <FlipHorizontal size={12} />
              {#if row.part.flip}<span class="fliptag">{row.part.flip}</span>{/if}
            </IconButton>
            <label class="xy">
              <span>x</span>
              <input
                type="number"
                value={row.part.x}
                onchange={(e) =>
                  placePart(row.path, { x: Number((e.target as HTMLInputElement).value) || 0 })}
              />
            </label>
            <label class="xy">
              <span>y</span>
              <input
                type="number"
                value={row.part.y}
                onchange={(e) =>
                  placePart(row.path, { y: Number((e.target as HTMLInputElement).value) || 0 })}
              />
            </label>
            <IconButton
              size="sm"
              label={`Actions for ${row.path.at(-1)}`}
              onclick={(e) => openMenu(e, row.path.join("/"), itemsFor(row))}
            >
              <Ellipsis size={13} />
            </IconButton>
          </div>
        {:else}
          <!-- The root's own trigger: the same items as right-clicking the row,
               because the two routes always agree. -->
          <div class="acts">
            <IconButton
              size="sm"
              label={`Actions for ${editor.sprite.name}`}
              onclick={(e) => openMenu(e, editor.sprite.name, rootItems())}
            >
              <Ellipsis size={13} />
            </IconButton>
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  {#if rows.length === 1}
    <p class="note">
      A part is a grid of its own at an offset — a door, a wheel, a pop-up lamp. Each keeps its own
      frames, so a consumer can open one without touching the rest.
    </p>
  {/if}
</Panel>

<AddPartDialog open={partDialog.open} onclose={closePartDialog} />

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.1rem;
  }
  li {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    /* Dense on purpose: six of these rows have to share a laptop's left rail
       with the Sprite panel and the folder, without the column scrolling. */
    gap: 0.12rem;
    padding: 0.1rem 0.25rem 0.1rem calc(0.25rem + var(--depth) * 0.6rem);
    min-width: 0;
    border: 1px solid transparent;
    border-radius: 4px;
  }
  li.on {
    border-color: var(--halo-accent);
    background: var(--halo-accent-soft);
  }
  /* Accent means selected; dashed means borrowed. Two things about a row, said
     two ways, so a selected borrowed part does not have to choose which of them
     to be — and it is the same dash its picture already carries. */
  li.borrowed {
    border-style: dashed;
  }
  li:has(.shot) .name {
    transition: opacity 0.1s;
  }
  /* Every identity row is the same height whatever controls it happens to
     carry. A frame picker only appears on a node with more than one frame, and
     letting it set the row height made the tree a ladder of different rungs. */
  li > * {
    min-height: 1.6rem;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
    min-width: 0;
    text-align: left;
  }
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
  /* Borrowed, not broken: a dashed edge says "this one lives elsewhere"
     without greying out the row, which read as disabled. */
  .shot.borrowed {
    box-shadow: 0 0 0 1px var(--halo-text-light);
    outline: 1px dashed var(--halo-text-light);
    outline-offset: 1px;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    font-size: 0.62rem;
    padding: 0 0.25rem;
    border: 1px solid var(--halo-border);
    border-radius: 999px;
    color: var(--halo-text-light);
  }
  .bad {
    color: var(--halo-error);
    font-weight: 700;
  }
  /* One row: the three state toggles, the offset, and the menu. Everything a
     part can be TOLD to do lives behind the ⋯, so this stays one line.
     The offsets SHARE what is left rather than claiming a fixed width — six
     controls at their natural size overflow a 16rem rail, and a nested part
     indents on top of that, so the fields have to be the thing that gives. */
  .acts {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 0.15rem;
    min-width: 0;
    min-height: 1.6rem;
  }
  .fliptag {
    position: absolute;
    right: 0;
    bottom: -0.1rem;
    font-size: 0.5rem;
    line-height: 1;
    color: var(--halo-accent);
    pointer-events: none;
  }
  .xy {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex: 1 1 0;
    min-width: 0;
    font-size: 0.68rem;
    color: var(--halo-text-muted);
  }
  .xy input {
    width: 100%;
    min-width: 0;
    height: 1.25rem;
    /* The stepper arrows are half the width of a two-digit field and nobody
       clicks them at this size. */
    appearance: textfield;
  }
  .xy input::-webkit-outer-spin-button,
  .xy input::-webkit-inner-spin-button {
    appearance: none;
    margin: 0;
  }
  input,
  select {
    background: var(--halo-bg-main);
    color: var(--halo-text-main);
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    padding: 0.1rem 0.25rem;
    font: inherit;
    font-size: 0.7rem;
  }
  .frame {
    grid-column: 2;
    width: 3rem;
    height: 1.6rem;
    padding: 0 0.15rem;
  }
  /* Always the last column, whether or not the one before it is there. */
  li > :global(button[aria-pressed]) {
    grid-column: 3;
  }
  button {
    display: grid;
    place-items: center;
    background: var(--halo-bg-main);
    color: var(--halo-text-main);
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    cursor: pointer;
    min-width: 1.5rem;
    min-height: 1.4rem;
    padding: 0 0.2rem;
    font: inherit;
    font-size: 0.72rem;
  }
  button:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .note {
    margin: 0;
    font-size: 0.7rem;
    line-height: 1.45;
    color: var(--halo-text-light);
  }
</style>
