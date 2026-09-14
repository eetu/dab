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
  import Copy from "@lucide/svelte/icons/copy";
  import Eclipse from "@lucide/svelte/icons/eclipse";
  import GripVertical from "@lucide/svelte/icons/grip-vertical";
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
    gesture,
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

  /** A run shows its SEQUENCE — draggable steps — when it is the one selected,
   *  or when it does not simply play in strip order. Position cannot say "1 3 2"
   *  or "hold frame 2", so something has to, and a bar of cells cannot be it. */
  const sequenced = (name: string, run: number[]) => editor.animation === name || !ascending(run);

  /** Which grid row each lane sits on: a sequenced one takes two. Counted
   *  rather than indexed, or the lanes under an expanded one sit on its steps. */
  const laneRows = $derived.by(() => {
    let row = 2;
    return lanes.map(([name, list]) => {
      const at = row;
      row += sequenced(name, list) ? 2 : 1;
      return at;
    });
  });
  const afterLanes = $derived(
    2 + lanes.reduce((n, [name, list]) => n + (sequenced(name, list) ? 2 : 1), 0),
  );
  const where = $derived(editor.path.length ? editor.path.join("/") : editor.sprite.name);

  // The play head belongs to the surface — the strip only follows it, so the
  // two can never be showing different frames.
  const playFrame = $derived(shownFrame(node));

  /** A run being swept out by a drag along one lane. Held here rather than
   *  committed, so a whole sweep is one undo entry. */
  let sweep: { name: string; from: number; to: number; moved: boolean } | null = $state(null);

  /** A thumbnail on its way to another place in the strip. `at` is where it
   *  would land — the gap it is hovering, not the frame it is over. */
  let carry: { from: number; at: number } | null = $state(null);
  /** A step of the selected run on its way to another place in that run. */
  let step: { name: string; from: number; at: number } | null = $state(null);
  /** The thing in hand, under the cursor. A marker in a gap says where it would
   *  land; this says WHAT is landing there, which the gap alone cannot — with
   *  five near-identical wheel frames, the marker on its own is a line. */
  let ghost: { x: number; y: number; frame: number | null; label: string } | null = $state(null);

  /**
   * The travel that tells a drag from a click, where one control has to be both.
   *
   * Below it nothing happens at all — no pointer capture, no marker — because a
   * captured pointer retargets its release and a chip that also answers clicks
   * would never see one. A GRIP needs none of this: it has no click to protect,
   * so it takes the pointer at once, which is also the only thing Safari will
   * reliably let us drag. A press-and-move on a button wrapping a canvas is a
   * native element drag there, and the pointermoves simply stop arriving.
   */
  const TRAVEL = 4;

  /** Which gap of a row of boxes a pointer is over: 0 before the first, n after
   *  the last. Midpoints, so the marker flips when the pointer passes a centre
   *  rather than when it crosses an edge. */
  function gapAt(boxes: HTMLElement[], x: number): number {
    let at = boxes.length;
    for (let i = 0; i < boxes.length; i++) {
      const r = boxes[i].getBoundingClientRect();
      if (x < r.left + r.width / 2) {
        at = i;
        break;
      }
    }
    return at;
  }

  /**
   * A drag of one thing in a row, as both of these are.
   *
   * `pick` says what is being moved, `land` where it wants to go, and the whole
   * thing is one commit on release — a reorder that committed per pointermove
   * would put a hundred entries on the undo stack for one gesture.
   */
  function carryDrag(
    e: PointerEvent,
    opts: {
      selector: string;
      /** A grip starts dragging on the press; a control that also clicks waits
       *  for travel before it commits to being a drag. */
      grip?: boolean;
      /** What to draw under the cursor while it is in hand. */
      carried: { frame: number | null; label: string };
      show: (at: number | null) => void;
      land: (at: number) => void;
    },
  ) {
    const el = e.currentTarget as HTMLElement;
    const host = el.closest(".timeline");
    if (!host) return;
    const start = e.clientX;
    const boxes = () => [...host.querySelectorAll(opts.selector)] as HTMLElement[];
    let live = !!opts.grip;
    let at: number | null = live ? gapAt(boxes(), start) : null;

    /** Grabbing until the drop, wherever the pointer wanders: the cursor is the
     *  document's while a drag is live, not the element's. */
    const hold = (on: boolean) => {
      document.documentElement.style.cursor = on ? "grabbing" : "";
    };

    if (opts.grip) {
      // No click to lose, so take the pointer and the default with it: the
      // press must not also start a selection or a native element drag.
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* a synthetic pointer — the window listeners below still track it */
      }
      hold(true);
      ghost = { x: e.clientX, y: e.clientY, ...opts.carried };
      opts.show(at);
    }

    const move = (ev: PointerEvent) => {
      if (!live && Math.abs(ev.clientX - start) < TRAVEL) return;
      if (!live) {
        // Past the threshold the click is forfeit anyway, so take the pointer:
        // a drag that leaves the element still ends on it, and the browser
        // stops eyeing the gesture as a selection of its own.
        live = true;
        hold(true);
        try {
          el.setPointerCapture(ev.pointerId);
        } catch {
          /* a synthetic pointer — the window listeners still track it */
        }
      }
      at = gapAt(boxes(), ev.clientX);
      ghost = { x: ev.clientX, y: ev.clientY, ...opts.carried };
      opts.show(at);
    };
    const done = (drop: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      gesture.abort = null;
      hold(false);
      ghost = null;
      opts.show(null);
      if (drop && at !== null) opts.land(at);
    };
    const up = () => done(true);
    // A cancelled pointer — the OS taking the gesture, a lost capture — puts
    // nothing down. Without this the drag stayed live with no way to end it.
    const cancel = () => done(false);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    // Escape's first rung: let go of the drag and put nothing down.
    gesture.abort = () => done(false);
  }

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

  /** Drag a frame to another place in the strip, BY ITS NUMBER — the grip sits
   *  between the two arrows that do the same thing one step at a time. The
   *  animations follow it: `moveFrame` carries every run's indices through the
   *  same permutation. */
  function carryFrame(e: PointerEvent, from: number) {
    if (readOnly() || frames.length < 2) return;
    carryDrag(e, {
      selector: ".frame",
      grip: true,
      carried: { frame: from, label: `${from + 1}` },
      show: (at) => (carry = at === null ? null : { from, at }),
      land: (at) => {
        // The gap counts the frame being moved, so dropping past itself is one
        // place further left than the gap number says.
        const to = at > from ? at - 1 : at;
        if (to !== from) moveFrame(from, to);
      },
    });
  }

  /** Drag a step of the shown run to another place IN that run — the order a
   *  bar cannot express, and the one thing the old chip row was good for. */
  function carryStep(e: PointerEvent, name: string, list: number[], from: number) {
    if (readOnly()) return;
    carryDrag(e, {
      selector: ".step",
      carried: { frame: list[from], label: `step ${from + 1}` },
      show: (at) => (step = at === null ? null : { name, from, at }),
      land: (at) => {
        const to = at > from ? at - 1 : at;
        if (to === from) return;
        const next = [...list];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        setAnimationFrames(name, next);
      },
    });
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

  /** One STEP's verbs. A step is a position in the run, not a frame: removing
   *  one leaves the frame where it is, and holding it plays it twice. */
  function stepMenu(e: MouseEvent, name: string, list: number[], j: number) {
    const why = readOnly();
    const at = (next: number[]) => () => setAnimationFrames(name, next);
    const swap = (k: number) => {
      const next = [...list];
      [next[j], next[k]] = [next[k], next[j]];
      return next;
    };
    openMenu(e, `${name} · step ${j + 1}`, [
      { label: `Go to frame ${list[j] + 1}`, run: () => (editor.frame = list[j]) },
      {
        label: "Hold longer",
        hint: why ?? "the same frame twice in a row is a pause",
        disabled: !!why,
        run: at([...list.slice(0, j + 1), list[j], ...list.slice(j + 1)]),
      },
      { kind: "separator" },
      { label: "Move earlier", disabled: j <= 0 || !!why, run: at(swap(j - 1)) },
      { label: "Move later", disabled: j >= list.length - 1 || !!why, run: at(swap(j + 1)) },
      { kind: "separator" },
      {
        label: "Remove",
        hint:
          list.length === 1 ? "the last step would leave the animation empty" : (why ?? undefined),
        disabled: list.length === 1 || !!why,
        danger: true,
        run: at(list.filter((_, k) => k !== j)),
      },
    ]);
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
        class:lifted={carry?.from === i}
        class:before={carry?.at === i}
        class:after={carry?.at === frames.length && i === frames.length - 1}
        style:grid-column={i + 2}
        oncontextmenu={(e) => frameMenu(e, i)}
        role="presentation"
      >
        <button class="pick" onclick={() => (editor.frame = i)} title={`Frame ${i + 1}`}>
          <Thumbnail {node} frame={i} variant={editor.variant} height="3.2rem" />
        </button>
        <!-- The number is the grip, and it sits ON the art in the corner rather
             than on a row of its own: the row cost every thumbnail its own line
             of chrome, and a badge over a corner costs nothing. Dragging it
             moves the frame as far as you like — the step-at-a-time arrows it
             replaces are in the menu, where the verbs are. The dots are there
             so that is findable without being told: a number alone reads as a
             label, and this one is a handle. -->
        <button
          class="grip"
          disabled={frames.length < 2}
          aria-label={`Drag frame ${i + 1} to reorder`}
          title={frames.length < 2 ? `Frame ${i + 1}` : "Drag to reorder"}
          onpointerdown={(e) => carryFrame(e, i)}
        >
          {#if frames.length > 1}<GripVertical size={9} />{/if}
          {i + 1}
        </button>
      </div>
    {/each}

    {#each lanes as [name, list], lane (name)}
      {@const run = runOf(name, list)}
      {@const row = laneRows[lane]}
      {@const playing = editor.animation === name && editor.playing}
      {@const numbered = !ascending(run)}
      <!-- The name, in the gutter: it stays put while the frames scroll, and a
           long one does not have to fit inside a three-frame bar. -->
      <div
        class="name"
        class:on={editor.animation === name}
        style:grid-row={row}
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
        <!-- Click picks the animation, double-click renames it: the deeper
             action behind the double, where the obvious one is the single. -->
        <button
          class="label"
          onclick={() => (editor.animation = name)}
          ondblclick={() => void rename(name)}
          title={`${name} — click to show its steps, double-click to rename`}
        >
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
          style:grid-row={row}
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

      {#if sequenced(name, list)}
        <!-- The run in playing ORDER, which the bar above cannot say: a reversal
             and a hold are both "these frames" and differ only in sequence.
             Under the bar rather than instead of it — the bar answers which
             frames, this answers in what order. -->
        <div class="seq" style:grid-row={row + 1} role="list">
          {#each list as f, j (j)}
            <button
              class="step"
              class:lifted={step?.name === name && step.from === j}
              class:before={step?.name === name && step.at === j}
              class:after={step?.name === name && step.at === list.length && j === list.length - 1}
              class:head={playing && editor.playhead % list.length === j}
              title={`Step ${j + 1} — frame ${f + 1}. Drag to reorder, click to go there.`}
              onpointerdown={(e) => carryStep(e, name, list, j)}
              onclick={() => (editor.frame = f)}
              oncontextmenu={(e) => stepMenu(e, name, list, j)}>{f + 1}</button
            >
          {/each}
        </div>
      {/if}
    {/each}

    <!-- Under the lanes, in the gutter, where the next one will appear. -->
    <button
      class="add"
      style:grid-row={afterLanes}
      title={`Name frame ${editor.frame + 1} as an animation — a consumer asks for it by name`}
      onclick={() => addAnimation(nextName())}
    >
      <Plus size={11} /> animation
    </button>
  </div>
</Panel>

<!-- What is in hand, under the cursor, outside the timeline's scroller so it is
     not clipped by it. Inert to the pointer: it is a picture of the thing being
     moved, and the drop is decided by where the POINTER is. -->
{#if ghost}
  <div class="ghost" style:left={`${ghost.x}px`} style:top={`${ghost.y}px`}>
    {#if ghost.frame !== null && node.frames[ghost.frame]}
      <Thumbnail {node} frame={ghost.frame} variant={editor.variant} height="2.4rem" />
    {/if}
    <span>{ghost.label}</span>
  </div>
{/if}

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
    position: relative;
    grid-row: 1;
    display: grid;
    padding: 0.2rem;
    border: 1px solid var(--halo-border);
    border-radius: 5px;
    background: var(--halo-bg-main);
  }
  .frame.on {
    border-color: var(--halo-accent);
  }
  /* Where a dragged thing would land, drawn in the gap it would land in. The
     thing being carried goes quiet so the marker is the only thing moving. */
  .frame.lifted,
  .step.lifted {
    opacity: 0.35;
  }
  /* A solid bar in the gap, not a hairline: the marker is the only thing saying
     where the drop lands, and at a glance a 1px line beside a 1px border is a
     border. The box is opaque, so a shifted shadow shows only as that bar. */
  .frame.before,
  .step.before {
    box-shadow: -4px 0 0 0 var(--halo-accent);
  }
  .frame.after,
  .step.after {
    box-shadow: 4px 0 0 0 var(--halo-accent);
  }
  /* The play head marks the NUMBER, not a second ring on the box — accent on
     the frame border already means selected, and one word per meaning. */
  .frame.playing .grip {
    border-color: var(--halo-accent);
    color: var(--halo-accent);
    font-weight: 600;
  }
  /* A badge in the corner of the art, not a row under it: the row cost every
     thumbnail a line of its own. Its ground is solid so the number reads over
     whatever is drawn behind it. */
  .grip {
    position: absolute;
    left: 0.2rem;
    top: 0.2rem;
    display: flex;
    align-items: center;
    gap: 0.02rem;
    padding: 0 0.18rem 0 0.05rem;
    border: 1px solid var(--halo-border);
    border-radius: 3px;
    background: var(--halo-bg-main);
    color: var(--halo-text-muted);
    font-size: 0.62rem;
    line-height: 1.35;
    cursor: grab;
    font-variant-numeric: tabular-nums;
    /* Safari drags the element itself otherwise, and the pointermoves stop. */
    user-select: none;
    -webkit-user-drag: none;
    touch-action: none;
  }
  .grip:active:not(:disabled) {
    cursor: grabbing;
  }
  .grip:disabled {
    cursor: default;
    opacity: 1;
  }
  /* The dots sit back until the pointer is near: on five thumbnails at once
     they would be five pieces of furniture competing with the art. */
  .grip :global(svg) {
    opacity: 0.6;
  }
  .frame:hover .grip:not(:disabled) {
    background: var(--halo-bg-light);
    color: var(--halo-text-main);
  }
  .frame:hover .grip :global(svg) {
    opacity: 1;
  }
  /* Under the cursor, and out of the way of the drop it is deciding. */
  .ghost {
    position: fixed;
    z-index: 20;
    transform: translate(0.6rem, 0.6rem);
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.3rem;
    border: 1px solid var(--halo-accent);
    border-radius: 5px;
    background: var(--halo-bg-main);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
    color: var(--halo-accent);
    font-size: 0.65rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.9;
    pointer-events: none;
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
  /* The run in order, under the bar it belongs to. It spans every frame column
     but is a row of its own steps, because the steps are not frames — two of
     them can name one frame, and that is what a hold IS. */
  .seq {
    grid-column: 2 / -1;
    display: flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.1rem 0;
    min-width: 0;
  }
  .step {
    flex: none;
    min-width: 1.3rem;
    padding: 0.05rem 0.25rem;
    border: 1px solid var(--halo-border);
    border-radius: 3px;
    background: var(--halo-bg-main);
    color: var(--halo-text-muted);
    font: inherit;
    font-size: 0.65rem;
    font-variant-numeric: tabular-nums;
    cursor: grab;
    /* Same reason as the frame grip: a press-and-move on a button is a native
       element drag in Safari unless it is told not to be. */
    user-select: none;
    -webkit-user-drag: none;
    touch-action: none;
  }
  .step:hover {
    border-color: var(--halo-accent);
    color: var(--halo-accent);
  }
  .step:active {
    cursor: grabbing;
  }
  .step.head {
    background: var(--halo-accent);
    border-color: var(--halo-accent);
    color: var(--halo-bg-main);
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
