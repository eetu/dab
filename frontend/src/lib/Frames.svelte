<script lang="ts">
  // The frame strip: thumbnails, add/duplicate/remove/reorder, and the play head
  // the preview drives. The strip is where a multi-frame sprite is judged — the
  // spokes and the sign flicker only make sense in motion.
  //
  // It runs across the bottom rather than down a rail, because a strip of frames
  // is horizontal and a rail is not: in a 16rem column it was the last of six
  // panels and fell off the screen.
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Copy from "@lucide/svelte/icons/copy";
  import Eclipse from "@lucide/svelte/icons/eclipse";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash from "@lucide/svelte/icons/trash-2";

  import {
    activeNode,
    addFrame,
    appendToClip,
    clipRun,
    duplicateFrame,
    editor,
    moveFrame,
    readOnly,
    removeFrame,
  } from "./editor.svelte";
  import IconButton from "./IconButton.svelte";
  import { type MenuItem, openMenu } from "./menu.svelte";
  import Panel from "./Panel.svelte";
  import Thumbnail from "./Thumbnail.svelte";

  // The strip belongs to the node being edited: a part has its own frames, which
  // is the whole reason a door can be open while the body is dented.
  const node = $derived(activeNode());
  const frames = $derived(node.frames);
  const run = $derived(clipRun(node));

  // The play head belongs to the preview — the strip only follows it, so the
  // two can never be showing different frames.
  const playFrame = $derived(editor.playing ? run[editor.playhead % run.length] : editor.frame);
  const where = $derived(editor.path.length ? editor.path.join("/") : editor.sprite.name);

  /** The header buttons act on the frame being edited; this menu acts on the
   *  thumbnail under the cursor — same verbs, said where you are pointing. */
  function frameMenu(e: MouseEvent, i: number) {
    const why = readOnly();
    const clips = Object.keys(node.clips ?? {});
    const items: MenuItem[] = [
      { label: "Duplicate", hint: why ?? undefined, disabled: !!why, run: () => duplicateFrame(i) },
      { label: "Add a blank frame after", disabled: !!why, run: () => addFrame(i) },
      {
        label: "Remove",
        hint: frames.length < 2 ? "the last frame stays" : (why ?? undefined),
        disabled: frames.length < 2 || !!why,
        danger: true,
        run: () => removeFrame(i),
      },
      { kind: "separator" },
      {
        label: "Move earlier",
        disabled: i === 0 || !!why,
        run: () => moveFrame(i, i - 1),
      },
      {
        label: "Move later",
        disabled: i === frames.length - 1 || !!why,
        run: () => moveFrame(i, i + 1),
      },
    ];
    if (clips.length) {
      items.push({ kind: "separator" });
      for (const name of clips) {
        items.push({
          label: `Add to ${name}`,
          hint: "twice is a hold",
          disabled: !!why,
          run: () => appendToClip(name, i),
        });
      }
    }
    openMenu(e, `Frame ${i + 1}`, items);
  }
</script>

<Panel id="frames" title="Frames" layout="row" badge={where}>
  {#snippet actions()}
    <IconButton
      size="sm"
      active={editor.onion}
      label="Onion skin"
      hint="Show the frame before this one, faint"
      onclick={() => (editor.onion = !editor.onion)}
    >
      <Eclipse size={13} />
    </IconButton>
    <IconButton size="sm" label="Add a blank frame after this one" onclick={() => addFrame()}>
      <Plus size={13} />
    </IconButton>
    <IconButton size="sm" label="Duplicate this frame" onclick={() => duplicateFrame()}>
      <Copy size={13} />
    </IconButton>
    <IconButton
      size="sm"
      danger
      label="Remove this frame"
      disabled={frames.length < 2}
      onclick={() => removeFrame()}
    >
      <Trash size={13} />
    </IconButton>
  {/snippet}

  <ol>
    {#each frames as _, i (i)}
      <li
        class:on={i === editor.frame}
        class:playing={editor.playing && i === playFrame}
        oncontextmenu={(e) => frameMenu(e, i)}
      >
        <button class="pick" onclick={() => (editor.frame = i)} title={`Frame ${i + 1}`}>
          <Thumbnail {node} frame={i} variant={editor.variant} height="3.2rem" />
        </button>
        <!-- Reorder and number on one fixed row, so selecting a frame cannot
             change the strip's height and shuffle the others sideways. -->
        <div class="foot">
          <button
            onclick={() => moveFrame(i, i - 1)}
            disabled={i === 0}
            aria-label="Move earlier"
            title="Move earlier"
          >
            <ChevronLeft size={11} />
          </button>
          <span>{i + 1}</span>
          <button
            onclick={() => moveFrame(i, i + 1)}
            disabled={i === frames.length - 1}
            aria-label="Move later"
            title="Move later"
          >
            <ChevronRight size={11} />
          </button>
        </div>
      </li>
    {/each}
  </ol>
</Panel>

<style>
  ol {
    list-style: none;
    margin: 0;
    padding: 0 0 0.2rem;
    display: flex;
    gap: 0.35rem;
    overflow-x: auto;
    min-width: 0;
    scrollbar-width: thin;
    scrollbar-color: var(--halo-border) transparent;
  }
  li {
    flex: none;
    width: 4.4rem;
    display: grid;
    gap: 0.15rem;
    padding: 0.2rem;
    border: 1px solid var(--halo-border);
    border-radius: 5px;
    background: var(--halo-bg-main);
  }
  li.on {
    border-color: var(--halo-accent);
  }
  /* The play head marks the NUMBER, not a second ring on the box — accent on
     the frame border already means selected, and one word per meaning. */
  li.playing .foot > span {
    color: var(--halo-accent);
    font-weight: 600;
  }
  .pick {
    display: block;
    padding: 0;
    background: #1e1e1e;
    border: 0;
    border-radius: 3px;
    cursor: pointer;
    overflow: hidden;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.65rem;
    color: var(--halo-text-muted);
    font-variant-numeric: tabular-nums;
  }
  .foot button {
    background: none;
    border: 0;
    padding: 0;
    color: var(--halo-text-light);
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .foot button:hover:not(:disabled) {
    color: var(--halo-text-main);
  }
  .foot button:disabled {
    opacity: 0.25;
    cursor: default;
  }
</style>
