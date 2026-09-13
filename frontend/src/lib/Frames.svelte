<script lang="ts">
  // The timeline: the node's frames, and the animations that name runs of them.
  //
  // One object with one axis. The frames were a row and the animations a column
  // beside them, each animation listing its frames again as chips — three
  // reading directions for one subject, and the only link between "1 2 3" and
  // the thumbnails was matching digits by eye. Aseprite's arrangement instead:
  // an animation is a BAR under the frames it covers, so which frames it holds
  // is answered by position.
  //
  // The bar is built from one cell per frame rather than a span, because a run
  // here is an arbitrary list — reversed, with holds — so it can have gaps, and
  // a gap is a hole in the bar rather than a lie about its extent.
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Copy from "@lucide/svelte/icons/copy";
  import Eclipse from "@lucide/svelte/icons/eclipse";
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import Plus from "@lucide/svelte/icons/plus";
  import SkipBack from "@lucide/svelte/icons/skip-back";
  import Trash from "@lucide/svelte/icons/trash-2";

  import { ask } from "./dialog.svelte";
  import {
    activeNode,
    addAnimation,
    addFrame,
    appendToAnimation,
    canPlay,
    duplicateFrame,
    editor,
    moveAnimation,
    moveFrame,
    readOnly,
    removeAnimation,
    removeFrame,
    renameAnimation,
    rewind,
    setAnimationFrames,
    setPlaying,
    shownFrame,
  } from "./editor.svelte";
  import IconButton from "./IconButton.svelte";
  import { type MenuItem, openMenu } from "./menu.svelte";
  import Panel from "./Panel.svelte";
  import Thumbnail from "./Thumbnail.svelte";

  // The strip belongs to the node being edited: a part has its own frames, which
  // is the whole reason a door can be open while the body is dented.
  const node = $derived(activeNode());
  const frames = $derived(node.frames);
  const lanes = $derived(Object.entries(node.animations ?? {}));
  const where = $derived(editor.path.length ? editor.path.join("/") : editor.sprite.name);

  // The play head belongs to the surface — the strip only follows it, so the
  // two can never be showing different frames.
  const playFrame = $derived(shownFrame(node));

  /** A run being swept out by a drag along one lane. Held here rather than
   *  committed, so a whole sweep is one undo entry. */
  let sweep: { name: string; from: number; to: number; moved: boolean } | null = $state(null);

  const span = (s: { from: number; to: number }) => {
    const [a, b] = s.from <= s.to ? [s.from, s.to] : [s.to, s.from];
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  };

  /** What a lane shows: the swept range while it is being dragged, its own run
   *  the rest of the time. */
  const runOf = (name: string, list: number[]) =>
    sweep?.name === name && sweep.moved ? span(sweep) : list;

  /** A run that plays its frames in strip order, each once. Gaps are fine — the
   *  bar shows those as holes. Those need no numbers; a reversed or held run
   *  does, because position alone cannot say it. */
  const ascending = (list: number[]) => list.every((f, i) => i === 0 || f > list[i - 1]);

  const refuse = (why: string) => {
    editor.status = why;
    editor.statusBad = true;
  };

  /** Click a cell: put that frame in the run, or take it out. Sorted back into
   *  place for a run that plays in strip order, appended for one that has an
   *  order of its own — inserting into "3 2 1" by index would be a guess. */
  function toggle(name: string, list: number[], i: number) {
    if (readOnly()) return refuse(readOnly()!);
    if (list.includes(i)) {
      const next = list.filter((f) => f !== i);
      if (!next.length) {
        return refuse(`${name} needs a frame — remove the animation instead`);
      }
      return setAnimationFrames(name, next);
    }
    setAnimationFrames(name, ascending(list) ? [...list, i].sort((a, b) => a - b) : [...list, i]);
  }

  function sweepDown(e: PointerEvent, name: string, i: number) {
    if (readOnly()) return;
    e.preventDefault();
    sweep = { name, from: i, to: i, moved: false };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* a synthetic pointer: the sweep still tracks, it just isn't captured */
    }
  }

  function sweepOver(name: string, i: number) {
    if (!sweep || sweep.name !== name || sweep.to === i) return;
    sweep = { ...sweep, to: i, moved: true };
  }

  /** A press that never left its cell is a click — toggle that one frame. One
   *  that travelled is a drag, and the run becomes what it swept. */
  function sweepUp(name: string, list: number[]) {
    if (!sweep || sweep.name !== name) return;
    const s = sweep;
    sweep = null;
    if (s.moved) setAnimationFrames(name, span(s));
    else toggle(name, list, s.from);
  }

  /** `animation`, `animation 2`, … — a name to rename rather than a prompt to fill. */
  function nextName() {
    const taken = new Set(lanes.map(([n]) => n));
    if (!taken.has("animation")) return "animation";
    for (let i = 2; ; i++) if (!taken.has(`animation ${i}`)) return `animation ${i}`;
  }

  async function rename(from: string) {
    const to = await ask({
      title: "Rename animation",
      label: "Name",
      value: from,
      note: "What a consumer asks for instead of remembering which frames meant what.",
      confirm: "Rename",
    });
    if (to) renameAnimation(from, to);
  }

  /** Play it. Not "select it and then go and find the play button", which is
   *  what the triangle used to do — it promised something it left to someone
   *  else. A run of one frame is a state: choosing it is the whole of it. */
  function toggleRun(name: string) {
    if (editor.animation === name && editor.playing) return setPlaying(false);
    editor.animation = name;
    editor.playhead = 0;
    setPlaying(true);
    if (!editor.playing) editor.frame = node.animations?.[name]?.[0] ?? editor.frame;
  }

  // The strip follows the frame the way the frame follows the keys: stepping
  // with , and . onto a thumbnail that has scrolled out of view otherwise moves
  // the selection somewhere the eye cannot follow.
  let strip: HTMLElement | null = $state(null);
  $effect(() => {
    void editor.frame;
    const box = strip;
    const on = box?.querySelector(".frame.on") as HTMLElement | null;
    const first = box?.querySelector(".frame") as HTMLElement | null;
    if (!box || !on || !first) return;
    // scrollIntoView cannot be used here: the name gutter is STICKY, so it counts
    // as scrollport that the frame behind it is "in", and stepping to frame 1
    // left it parked underneath the names. The gutter's width is exactly where
    // the first frame starts, so ask the strip rather than a constant.
    const origin = box.getBoundingClientRect().left - box.scrollLeft;
    const gutter = first.getBoundingClientRect().left - origin;
    const left = on.getBoundingClientRect().left - origin;
    const right = left + on.offsetWidth;
    if (left - box.scrollLeft < gutter) box.scrollLeft = left - gutter;
    else if (right - box.scrollLeft > box.clientWidth) box.scrollLeft = right - box.clientWidth;
  });

  /** The header buttons act on the frame being edited; this menu acts on the
   *  thumbnail under the cursor — same verbs, said where you are pointing. */
  function frameMenu(e: MouseEvent, i: number) {
    const why = readOnly();
    const items: MenuItem[] = [
      { label: "Duplicate", hint: why ?? undefined, disabled: !!why, run: () => duplicateFrame(i) },
      { label: "Add frame after", disabled: !!why, run: () => addFrame(i) },
      {
        label: "Remove",
        hint: frames.length < 2 ? "the last frame stays" : (why ?? undefined),
        disabled: frames.length < 2 || !!why,
        danger: true,
        run: () => removeFrame(i),
      },
      { kind: "separator" },
      { label: "Move earlier", disabled: i === 0 || !!why, run: () => moveFrame(i, i - 1) },
      {
        label: "Move later",
        disabled: i === frames.length - 1 || !!why,
        run: () => moveFrame(i, i + 1),
      },
    ];
    if (lanes.length) {
      items.push({ kind: "separator" });
      for (const [name] of lanes) {
        items.push({
          label: `Add to ${name}`,
          disabled: !!why,
          run: () => appendToAnimation(name, i),
        });
      }
    }
    openMenu(e, `Frame ${i + 1}`, items);
  }

  /** One animation's verbs, on its name. The order-level edits live here because
   *  the bar can say "which frames" and not "in what order". */
  function laneMenu(e: MouseEvent, name: string, list: number[]) {
    const why = readOnly();
    const at = lanes.findIndex(([n]) => n === name);
    const playing = editor.animation === name && editor.playing;
    openMenu(e, name, [
      {
        label: playing ? "Stop" : list.length > 1 ? "Play" : "Show",
        hint: list.length > 1 ? undefined : "one frame — a state, not a movement",
        run: () => toggleRun(name),
      },
      { label: "Rename…", disabled: !!why, run: () => void rename(name) },
      { kind: "separator" },
      {
        label: "Reverse",
        hint: why ?? (list.length > 1 ? undefined : "one frame reads the same either way"),
        disabled: !!why || list.length < 2,
        run: () => setAnimationFrames(name, [...list].reverse()),
      },
      {
        label: `Hold frame ${editor.frame + 1}`,
        hint: why ?? "twice in a row is a pause",
        disabled: !!why,
        run: () => appendToAnimation(name, editor.frame),
      },
      {
        label: "Every frame",
        disabled: !!why,
        run: () =>
          setAnimationFrames(
            name,
            frames.map((_, i) => i),
          ),
      },
      { kind: "separator" },
      { label: "Move up", disabled: at <= 0 || !!why, run: () => moveAnimation(name, at - 1) },
      {
        label: "Move down",
        disabled: at >= lanes.length - 1 || !!why,
        run: () => moveAnimation(name, at + 1),
      },
      { kind: "separator" },
      { label: "Remove", danger: true, disabled: !!why, run: () => removeAnimation(name) },
    ]);
  }
</script>

<!-- A column panel, not a row: the timeline is the whole of the dock now, and a
     row header would push the strip 9rem right of the name gutter that already
     sits at its left. -->
<Panel id="frames" title="Frames" badge={`${where} · ${frames.length}`}>
  <div class="timeline" bind:this={strip} style:--cols={frames.length}>
    <!-- The frame verbs, in the gutter beside the strip they act on. Not in the
         panel header: the dock is the width of the window, and `margin-left:auto`
         parked them a screen away from the thumbnails. -->
    <div class="tools">
      <!-- The way into the play mode. It runs on the CANVAS — the strip's own job
           is to say which frame is up, which it does by following the head. -->
      <IconButton size="sm" label="Back to the first frame" onclick={rewind}>
        <SkipBack size={13} />
      </IconButton>
      <IconButton
        size="sm"
        active={editor.playing}
        disabled={!canPlay(node)}
        label={editor.playing ? "Stop" : "Play"}
        hint={canPlay(node) ? "Play on the canvas (P)" : "A single frame has nothing to play"}
        onclick={() => setPlaying(!editor.playing)}
      >
        {#if editor.playing}<Pause size={13} />{:else}<Play size={13} />{/if}
      </IconButton>
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
    </div>

    <!-- The frames themselves, one per column. Everything below lines up with
         these, which is the whole point of the arrangement. -->
    {#each frames as _, i (i)}
      <div
        class="frame"
        class:on={i === editor.frame}
        class:playing={editor.playing && i === playFrame}
        style:grid-column={i + 2}
        oncontextmenu={(e) => frameMenu(e, i)}
        role="presentation"
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
      </div>
    {/each}

    {#each lanes as [name, list], lane (name)}
      {@const run = runOf(name, list)}
      {@const playing = editor.animation === name && editor.playing}
      {@const numbered = !ascending(run)}
      <!-- The name, in the gutter: it stays put while the frames scroll, and a
           long one does not have to fit inside a three-frame bar. -->
      <div
        class="name"
        class:on={editor.animation === name}
        style:grid-row={lane + 2}
        oncontextmenu={(e) => laneMenu(e, name, list)}
        role="presentation"
      >
        <IconButton
          size="sm"
          active={playing}
          label={playing ? `Stop ${name}` : list.length > 1 ? `Play ${name}` : `Show ${name}`}
          hint={list.length > 1 ? undefined : "One frame — a state, not a movement"}
          onclick={() => toggleRun(name)}
        >
          {#if playing}<Pause size={11} />{:else}<Play size={11} />{/if}
        </IconButton>
        <button class="label" onclick={() => void rename(name)} title={`${name} — rename…`}>
          {name}
        </button>
        <span class="count">{list.length}</span>
      </div>

      {#each frames as _, i (i)}
        {@const at = run.filter((f) => f === i)}
        {@const held = at.length > 1}
        <button
          class="cell"
          class:in={at.length > 0}
          class:head={playing && playFrame === i}
          class:sweeping={sweep?.name === name && sweep.moved}
          style:grid-column={i + 2}
          style:grid-row={lane + 2}
          aria-label={at.length
            ? `Take frame ${i + 1} out of ${name}`
            : `Put frame ${i + 1} in ${name}`}
          title={at.length
            ? `Frame ${i + 1} is in ${name}${held ? ` ${at.length}× — a hold` : ""} — click to take it out, drag to sweep a run`
            : `Click to put frame ${i + 1} in ${name}, or drag a run`}
          onpointerdown={(e) => sweepDown(e, name, i)}
          onpointerenter={() => sweepOver(name, i)}
          onpointerup={() => sweepUp(name, list)}
          onpointercancel={() => (sweep = null)}
          oncontextmenu={(e) => laneMenu(e, name, list)}
        >
          {#if at.length && (numbered || held)}
            <span class="ord"
              >{run
                .map((f, j) => (f === i ? j + 1 : null))
                .filter((j) => j !== null)
                .join(" ")}</span
            >
          {/if}
        </button>
      {/each}
    {/each}

    <!-- Under the lanes, in the gutter, where the next one will appear. -->
    <button
      class="add"
      style:grid-row={lanes.length + 2}
      title={`Name frame ${editor.frame + 1} as an animation — a consumer asks for it by name`}
      onclick={() => addAnimation(nextName())}
    >
      <Plus size={11} /> animation
    </button>
  </div>
</Panel>

<style>
  .timeline {
    display: grid;
    /* The gutter, then one track per frame. Fixed tracks, so a lane cell sits
       exactly under the thumbnail it is about. The gutter is as wide as the six
       frame verbs in a row: wrapping one of them onto a line of its own reads as
       a group nobody arranged. */
    grid-template-columns: 11rem repeat(var(--cols), 4.4rem);
    align-items: stretch;
    gap: 0.2rem 0.35rem;
    padding-bottom: 0.2rem;
    overflow-x: auto;
    min-width: 0;
    scrollbar-width: thin;
    scrollbar-color: var(--halo-border) transparent;
  }
  .frame {
    grid-row: 1;
    display: grid;
    gap: 0.15rem;
    padding: 0.2rem;
    border: 1px solid var(--halo-border);
    border-radius: 5px;
    background: var(--halo-bg-main);
  }
  .frame.on {
    border-color: var(--halo-accent);
  }
  /* The play head marks the NUMBER, not a second ring on the box — accent on
     the frame border already means selected, and one word per meaning. */
  .frame.playing .foot > span {
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
  /* The gutter sticks, so scrolling a long strip never leaves a row of bars
     with no names on it. */
  .tools,
  .name,
  .add {
    grid-column: 1;
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--halo-bg-light);
  }
  /* Two rows of three in the gutter's 9rem, beside the thumbnails they act on. */
  .tools {
    grid-row: 1;
    display: flex;
    flex-wrap: wrap;
    align-content: center;
    align-items: center;
    gap: 0.1rem;
    padding-right: 0.3rem;
  }
  .name {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    min-width: 0;
    padding-right: 0.3rem;
    border-radius: 4px;
  }
  .name.on {
    background: var(--halo-accent-soft);
  }
  .label {
    flex: 1;
    min-width: 0;
    background: none;
    border: 0;
    padding: 0;
    color: var(--halo-text-main);
    font: inherit;
    font-size: 0.75rem;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: text;
  }
  .label:hover {
    color: var(--halo-accent);
  }
  .count {
    font-size: 0.65rem;
    color: var(--halo-text-light);
    font-variant-numeric: tabular-nums;
  }
  /* A cell of the bar. Empty cells are the ground the bar is drawn on, so a gap
     in a run reads as a hole rather than as the bar stopping. */
  .cell {
    min-height: 1.1rem;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 3px;
    background: var(--halo-bg-main);
    color: var(--halo-text-light);
    font: inherit;
    font-size: 0.6rem;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .cell:hover {
    border-color: var(--halo-border);
  }
  .cell.in {
    background: var(--halo-accent-soft);
    border-color: var(--halo-accent);
    color: var(--halo-accent);
  }
  /* Where the play head is, on the bar that is playing. */
  .cell.head {
    background: var(--halo-accent);
    color: var(--halo-bg-main);
  }
  .cell.sweeping {
    cursor: ew-resize;
  }
  .ord {
    pointer-events: none;
  }
  .add {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.3rem;
    border: 1px dashed var(--halo-border);
    border-radius: 4px;
    color: var(--halo-text-muted);
    font: inherit;
    font-size: 0.7rem;
    cursor: pointer;
  }
  .add:hover {
    border-color: var(--halo-accent);
    color: var(--halo-accent);
  }
</style>
