<script lang="ts">
  // Clips: named runs of frame indices on the node being drawn.
  //
  // A strip is an animation in one place and a set of states in another, and
  // only a name can say which. Indices rather than a range and a direction —
  // reversing is reading the list backwards, and a repeat is a hold, so neither
  // needs a field.
  //
  // Beside the frame strip rather than under it: a clip is a sentence about
  // those frames, and reading it means looking at both.
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash from "@lucide/svelte/icons/trash-2";

  import { ask } from "./dialog.svelte";
  import {
    activeNode,
    addClip,
    appendToClip,
    editor,
    moveClip,
    removeClip,
    renameClip,
    setClipFrames,
  } from "./editor.svelte";
  import IconButton from "./IconButton.svelte";
  import { type MenuItem, openMenu } from "./menu.svelte";
  import Panel from "./Panel.svelte";

  const node = $derived(activeNode());
  const clips = $derived(Object.entries(node.clips ?? {}));

  /** `clip`, `clip 2`, … — a name to rename rather than a prompt to fill. */
  function nextClipName() {
    const taken = new Set(clips.map(([n]) => n));
    if (!taken.has("clip")) return "clip";
    for (let i = 2; ; i++) if (!taken.has(`clip ${i}`)) return `clip ${i}`;
  }

  /**
   * Play it. Not "select it and then go and find the play button in another
   * panel", which is what this did — the triangle promised something it left
   * to someone else, so pressing it looked like nothing happening.
   */
  function toggle(name: string) {
    if (editor.clip === name && editor.playing) {
      editor.playing = false;
      return;
    }
    editor.clip = name;
    editor.playhead = 0;
    editor.playing = true;
  }

  async function rename(from: string) {
    const to = await ask({
      title: "Rename clip",
      label: "Name",
      value: from,
      note: "What a consumer asks for instead of remembering which frames meant what.",
      confirm: "Rename",
    });
    if (to) renameClip(from, to);
  }

  function clipMenu(e: MouseEvent, name: string) {
    const playing = editor.clip === name && editor.playing;
    const items: MenuItem[] = [
      { label: playing ? "Stop" : "Play", run: () => toggle(name) },
      { label: "Rename…", run: () => void rename(name) },
      {
        label: `Add frame ${editor.frame + 1}`,
        hint: "twice is a hold",
        run: () => appendToClip(name),
      },
    ];
    if (editor.clip === name) {
      items.push({
        label: "Show the whole strip",
        hint: "stop following this clip",
        run: () => {
          editor.clip = null;
          editor.playing = false;
        },
      });
    }
    const at = clips.findIndex(([n]) => n === name);
    items.push(
      { kind: "separator" },
      {
        label: "Move up",
        hint: "the file's order",
        disabled: at <= 0,
        run: () => moveClip(name, at - 1),
      },
      {
        label: "Move down",
        disabled: at >= clips.length - 1,
        run: () => moveClip(name, at + 1),
      },
      { kind: "separator" },
      { label: "Remove", danger: true, run: () => removeClip(name) },
    );
    openMenu(e, name, items);
  }

  /** A chip is a frame in the run. Clicking it GOES there — removal is in its
   *  menu, because a click that deletes is a click nobody meant. */
  function chipMenu(e: MouseEvent, name: string, list: number[], i: number) {
    const swap = (j: number) => {
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      setClipFrames(name, next);
    };
    openMenu(e, `${name} · frame ${list[i] + 1}`, [
      { label: "Go to the frame", run: () => (editor.frame = list[i]) },
      {
        label: "Hold it longer",
        hint: "repeat the entry",
        run: () => setClipFrames(name, [...list.slice(0, i + 1), list[i], ...list.slice(i + 1)]),
      },
      { kind: "separator" },
      { label: "Play it earlier", disabled: i <= 0, run: () => swap(i - 1) },
      { label: "Play it later", disabled: i >= list.length - 1, run: () => swap(i + 1) },
      { kind: "separator" },
      {
        label: "Drop from this clip",
        hint: list.length === 1 ? "the last entry removes the clip" : undefined,
        danger: true,
        run: () =>
          setClipFrames(
            name,
            list.filter((_, j) => j !== i),
          ),
      },
    ]);
  }
</script>

<Panel
  id="clips"
  title="Clips"
  layout="row"
  badge={clips.length ? String(clips.length) : undefined}
>
  {#snippet actions()}
    <IconButton
      size="sm"
      label={`Name frame ${editor.frame + 1} as a clip`}
      onclick={() => addClip(nextClipName())}
    >
      <Plus size={12} />
    </IconButton>
  {/snippet}

  {#if clips.length}
    <ul>
      {#each clips as [name, list] (name)}
        {@const playing = editor.clip === name && editor.playing}
        <li class:on={editor.clip === name} oncontextmenu={(e) => clipMenu(e, name)}>
          <IconButton
            size="sm"
            active={playing}
            label={playing ? `Stop ${name}` : `Play ${name}`}
            onclick={() => toggle(name)}
          >
            {#if playing}<Pause size={11} />{:else}<Play size={11} />{/if}
          </IconButton>
          <button class="name" onclick={() => rename(name)} title="Rename…">{name}</button>
          <div class="run">
            {#each list as f, i (i)}
              <!-- Click goes to the frame; everything destructive is behind the
                   menu. This chip used to DELETE itself on click. -->
              <button
                class="chip"
                title={`Frame ${f + 1} — click to go there`}
                onclick={() => (editor.frame = f)}
                oncontextmenu={(e) => chipMenu(e, name, list, i)}>{f + 1}</button
              >
            {/each}
            <button
              class="chip add"
              title={`Add frame ${editor.frame + 1} — twice is a hold`}
              onclick={() => appendToClip(name)}>+</button
            >
          </div>
          <IconButton
            size="sm"
            ghost
            danger
            label={`Remove ${name}`}
            onclick={() => removeClip(name)}
          >
            <Trash size={11} />
          </IconButton>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="note">
      A clip names a run — <code>shut</code>, <code>swing</code>, <code>open</code>. A consumer asks
      for one by name instead of remembering which indices meant what.
    </p>
  {/if}
</Panel>

<style>
  /* One per line, scrolling inside the height the frame strip already sets.
     Side by side they had to share a narrow column and every clip past the
     second was off the end of a horizontal scroller; down the column each gets
     a whole row and the bar still cannot grow, because the box is bounded by
     the thumbnails beside it. */
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.1rem;
    align-content: start;
    max-height: 4.6rem;
    overflow-y: auto;
    min-width: 0;
    scrollbar-width: thin;
    scrollbar-color: var(--halo-border) transparent;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.05rem 0.25rem;
    border: 1px solid transparent;
    border-radius: 4px;
  }
  li:hover {
    border-color: var(--halo-border);
  }
  li.on {
    border-color: var(--halo-accent);
    background: var(--halo-accent-soft);
  }
  .name {
    flex: 1;
    background: none;
    border: 0;
    padding: 0;
    color: var(--halo-text-main);
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
    max-width: 9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
  }
  .name:hover {
    color: var(--halo-accent);
  }
  .run {
    display: flex;
    gap: 0.1rem;
  }
  .chip {
    min-width: 1.1rem;
    padding: 0 0.2rem;
    font-size: 0.65rem;
    font-variant-numeric: tabular-nums;
    background: var(--halo-bg-main);
    color: var(--halo-text-main);
    border: 1px solid var(--halo-border);
    border-radius: 3px;
    cursor: pointer;
  }
  .chip:hover {
    border-color: var(--halo-accent);
  }
  .chip.add {
    border-style: solid;
    opacity: 0.7;
    color: var(--halo-text-muted);
  }
  .note {
    margin: 0;
    max-width: 16rem;
    font-size: 0.7rem;
    line-height: 1.45;
    color: var(--halo-text-light);
  }
  code {
    font-family: ui-monospace, monospace;
    font-size: 0.66rem;
    color: var(--halo-text-muted);
  }
</style>
