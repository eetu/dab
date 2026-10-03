<script lang="ts">
  // The palette: pick the ink, edit a colour, move a colour to a different
  // character, and drop one. Each swatch shows its character, because the
  // character is what ends up in the file and in the diff.
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import Plus from "@lucide/svelte/icons/plus";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import {
    alphaOf,
    cellColour,
    COLOUR,
    type Cycle,
    cyclesOf,
    PALETTE_CHARS,
    TRANSPARENT,
    unusedChars,
    variantNames,
  } from "dab-core";

  import ColourPicker from "./ColourPicker.svelte";
  import {
    activeNode,
    addColour,
    addCycle,
    addVariant,
    adoptFromBundle,
    allNodes,
    clashingChars,
    clearVariantColour,
    cycleShowing,
    duplicateVariant,
    editor,
    frameOf,
    movePaletteChar,
    paletteElsewhere,
    pushColour,
    pushPalette,
    pushTargets,
    removeColour,
    removeCycle,
    removeUnusedColours,
    removeVariant,
    renameChar,
    renameCycle,
    renameVariant,
    reverseCycle,
    selectColour,
    setColour,
    setPlaying,
    setVariantColour,
  } from "./editor.svelte";
  import IconButton from "./IconButton.svelte";
  import { type MenuItem, openMenu } from "./menu.svelte";
  import Panel from "./Panel.svelte";

  // Every node keeps its own palette: a B on the body and a B on the door are
  // not the same colour, and inheriting would make a cell's colour depend on a
  // parent the consumer may not have.
  const node = $derived(activeNode());
  const entries = $derived(Object.entries(node.palette));
  const unused = $derived(new Set(unusedChars(node)));
  const variants = $derived(variantNames(node));
  /** How many cells of a character the frame being drawn has. */
  const drawnHere = (ch: string) =>
    (node.frames[frameOf(editor.path, node)] ?? []).join("").split(ch).length - 1;

  /** A cycle is several variants in the file and one thing here: its phases are
   *  listed as a single row, where the first of them is declared. */
  const cycles = $derived(cyclesOf(node));
  const phaseOf = $derived(new Map(cycles.flatMap((c) => c.phases.map((p) => [p, c] as const))));
  type Row = { kind: "variant"; name: string } | { kind: "cycle"; cycle: Cycle };
  const rows = $derived(
    variants.flatMap((name): Row[] => {
      const c = phaseOf.get(name);
      if (!c) return [{ kind: "variant", name }];
      return name === c.phases[0] ? [{ kind: "cycle", cycle: c }] : [];
    }),
  );
  const showing = $derived(cycleShowing());
  /** The cycle on screen, when it is this node's — its phases are not edited
   *  by hand, so the per-colour editor gives way to what the cycle turns. */
  const showingHere = $derived(editor.variant ? (phaseOf.get(editor.variant) ?? null) : null);

  // A RUN of swatches: click one, shift-click another, and everything between
  // them in palette order is taken — the order a cycle turns them in, and the
  // order you arranged them in by dragging. The ink is the anchor, the way the
  // first click is in any list.
  let runTo = $state<string | null>(null);
  const run = $derived.by(() => {
    const chars = entries.map(([ch]) => ch);
    const a = chars.indexOf(editor.ink);
    const b = runTo ? chars.indexOf(runTo) : -1;
    if (a < 0 || b < 0 || a === b) return [];
    return chars.slice(Math.min(a, b), Math.max(a, b) + 1);
  });
  const inRun = $derived(new Set(run));

  function cycleRun() {
    if (addCycle(run)) runTo = null;
  }

  /** "Cycle these", or why not yet. On a swatch's own menu only when that swatch
   *  is in the run — offered on any other, it would cycle something you did not
   *  point at. */
  const cycleItem = (ch?: string): MenuItem =>
    run.length > 1 && (!ch || inRun.has(ch))
      ? { label: "Cycle these", hint: `${run.length} colours`, run: cycleRun }
      : { label: "Cycle a run", hint: "shift-click to take one", disabled: true, run: () => {} };

  /** A cycle's colours side by side, as hard stops — the row's swatch. */
  const stripe = (c: Cycle) =>
    `linear-gradient(to right, ${c.chars
      .map((ch, i) => {
        const hex = node.palette[ch] ?? "transparent";
        return `${hex} ${(i / c.chars.length) * 100}% ${((i + 1) / c.chars.length) * 100}%`;
      })
      .join(", ")})`;

  function cycleMenu(e: MouseEvent, c: Cycle) {
    const on = showing?.name === c.name;
    openMenu(e, c.name, [
      {
        label: on ? "Show the palette instead" : "Show it",
        run: () => (editor.variant = on ? null : c.phases[0]),
      },
      {
        label: "Play it",
        hint: "P",
        run: () => {
          editor.variant = c.phases[0];
          editor.playhead = 0;
          setPlaying(true);
        },
      },
      { label: "Reverse", hint: c.chars.join(" "), run: () => reverseCycle(c.name) },
      { kind: "separator" },
      {
        label: "Remove",
        hint: `${c.phases.length} variants`,
        danger: true,
        run: () => removeCycle(c.name),
      },
    ]);
  }

  /** Past this, the 69-character budget is close enough to say out loud. */
  const BUDGET_NOTE_AT = 50;

  // Colours travel between nodes by hand, not by inheritance — the file keeps
  // one palette per node, and the tool is what saves you retyping it. So: what
  // the bundle has that this node has not, what this node could send to the
  // rest, and where one character already means two colours.
  const shared = $derived(allNodes().length > 1);
  const elsewhere = $derived(shared ? paletteElsewhere() : []);
  const clashes = $derived(new Map(clashingChars().map((c) => [c.ch, c])));
  const sendable = $derived(
    shared ? new Map(entries.map(([ch]) => [ch, pushTargets(ch)])) : new Map<string, string[]>(),
  );
  const sendableAll = $derived([...sendable.values()].filter((t) => t.length).length);

  /** `variant`, `variant 2`, … — a name to rename rather than a prompt to fill. */
  function nextVariantName() {
    if (!variants.includes("variant")) return "variant";
    for (let i = 2; ; i++) if (!variants.includes(`variant ${i}`)) return `variant ${i}`;
  }

  /** A variant row's verbs — the same set a palette swatch answers with, said
   *  about a colourway instead of a colour. */
  function variantMenu(e: MouseEvent, name: string) {
    openMenu(e, name, [
      {
        label: editor.variant === name ? "Show the palette instead" : "Show it",
        run: () => (editor.variant = editor.variant === name ? null : name),
      },
      { label: "Duplicate", run: () => duplicateVariant(name) },
      { kind: "separator" },
      { label: "Remove", danger: true, run: () => removeVariant(name) },
    ]);
  }

  /** The entry the detail strip is about: whatever the ink is set to. */
  const current = $derived(entries.find(([ch]) => ch === editor.ink) ?? null);

  /** Whether a colour is light enough that its character needs dark ink. Also
   *  true of a very see-through one, which sits on the pale checker. */
  function light(hex: string): boolean {
    const n = parseInt(hex.slice(1, 7), 16) || 0;
    const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return alphaOf(hex) < 110 || l > 140;
  }

  let renaming = $state<string | null>(null);
  /** Whether a native colour input is mid-sweep — see the variant rows. */
  let sweep = false;
  /** The character being picked, and the swatch the popover hangs off. */
  let picking = $state<string | null>(null);
  let at = $state<DOMRect | null>(null);

  // Reordering, by dragging a swatch.
  //
  // The swatch is the handle because it is the row's identity, and because the
  // rest of the row is fields you have to be able to click into. A press that
  // never travels is still "paint with this" — the same rule the canvas uses
  // for a click against a drag, and the reason `moved` is measured in pixels
  // rather than in whether the index changed: a drag that comes back to where
  // it started was still a drag.
  let list: HTMLDivElement | null = $state(null);
  let drag = $state<{ ch: string; from: number; over: number } | null>(null);
  let moved = false;
  /** Where the press landed. Travel is measured from here, not from the
   *  swatch's centre: a swatch is wider than the dead zone, so a press near its
   *  edge read as a drag on the first pixel of jitter and lost the click. */
  let press = { x: 0, y: 0 };

  const DEAD_ZONE = 6;

  function grab(e: PointerEvent, ch: string, from: number) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag = { ch, from, over: from };
    moved = false;
    press = { x: e.clientX, y: e.clientY };
  }

  function slide(e: PointerEvent) {
    if (!drag || !list) return;
    const cells = [...list.querySelectorAll<HTMLElement>("[data-swatch]")];
    if (!cells.length) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > DEAD_ZONE) moved = true;
    // Nearest centre, because a grid wraps: "the row above" is not a direction
    // a swatch can be dragged in, but "that one there" always is.
    let over = drag.over;
    let best = Infinity;
    cells.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      if (d < best) {
        best = d;
        over = i;
      }
    });
    if (over !== drag.over) drag = { ...drag, over };
  }

  function drop() {
    if (drag && moved && drag.over !== drag.from) movePaletteChar(drag.ch, drag.over);
    drag = null;
  }

  function commitRename(from: string, e: Event) {
    const to = (e.target as HTMLInputElement).value.trim();
    renaming = null;
    if (to.length === 1) renameChar(from, to);
  }

  /** One swatch's actions. In a menu rather than as buttons on the row: the row
   *  is five columns already, and the list of things you can do to a colour only
   *  grows. */
  function itemsFor(ch: string, hex: string): MenuItem[] {
    const send = sendable.get(ch) ?? [];
    const clash = clashes.get(ch);
    return [
      { label: "Rename character…", hint: ch, run: () => (renaming = ch) },
      {
        label: "Select its pixels",
        hint: drawnHere(ch) ? String(drawnHere(ch)) : "none on this frame",
        disabled: !drawnHere(ch),
        run: () => selectColour(ch),
      },
      cycleItem(ch),
      ...(send.length
        ? [
            {
              label: `Send to ${send.length === 1 ? send[0] : `${send.length} parts`}`,
              hint: send.length > 1 ? send.join(", ") : undefined,
              swatch: hex,
              run: () => pushColour(ch),
            } satisfies MenuItem,
          ]
        : []),
      ...(clash
        ? [
            {
              label: `Take ${clash.where}'s colour`,
              hint: clash.theirs,
              swatch: clash.theirs,
              run: () => setColour(ch, clash.theirs),
            } satisfies MenuItem,
          ]
        : []),
      { kind: "separator" as const },
      {
        label: "Remove",
        hint: unused.has(ch) ? "unused" : "erases its pixels",
        danger: true,
        run: () => removeColour(ch),
      },
    ];
  }

  /** What can move between this node and the rest of the subject. */
  function bundleItems(): MenuItem[] {
    return [
      ...(elsewhere.length
        ? [
            {
              label: `Take ${elsewhere.length} colour${elsewhere.length > 1 ? "s" : ""} from the rest`,
              hint: elsewhere.map((c) => c.ch).join(""),
              run: adoptFromBundle,
            } satisfies MenuItem,
          ]
        : []),
      ...(sendableAll
        ? [
            {
              label: "Send this palette to the rest",
              hint: `${sendableAll} colour${sendableAll > 1 ? "s" : ""}`,
              run: pushPalette,
            } satisfies MenuItem,
          ]
        : []),
    ];
  }
</script>

<Panel id="palette" title="Palette" badge={editor.path.length ? editor.path.join("/") : undefined}>
  {#snippet actions()}
    <IconButton size="sm" label="Add a colour" onclick={() => addColour("#ffffff")}>
      <Plus size={13} />
    </IconButton>
    <IconButton
      size="sm"
      ghost
      label="Palette actions"
      onclick={(e) =>
        openMenu(e, "Palette", [
          {
            label: unused.size
              ? `Remove ${unused.size} unused colour${unused.size > 1 ? "s" : ""}`
              : "Remove unused colours",
            hint: unused.size ? undefined : "every colour is in use",
            disabled: !unused.size,
            danger: true,
            run: removeUnusedColours,
          },
          cycleItem(),
        ])}
    >
      <Ellipsis size={13} />
    </IconButton>
  {/snippet}

  <!--
    A grid of swatches, and one editor for whichever is selected.

    Which is what every palette-first editor has done since Deluxe Paint: the
    palette is the colours, and everything you can do TO a colour is in a
    requester for the current one. A row per colour carrying its own hex field,
    its own edit chip and its own menu button is four controls where one swatch
    would do — and none of them is reachable until you have decided which
    colour you meant anyway.

    The character is drawn ON the swatch, small, because unlike a palette index
    it is the thing that lands in the file — you have to be able to find your
    red by looking.
  -->
  <div class="grid" bind:this={list} role="listbox" aria-label="Palette" tabindex="-1">
    <button
      class="cell transparent"
      class:on={editor.ink === TRANSPARENT}
      role="option"
      aria-selected={editor.ink === TRANSPARENT}
      onclick={() => {
        editor.ink = TRANSPARENT;
        runTo = null;
      }}
      oncontextmenu={(e) =>
        openMenu(e, "Transparent", [
          { label: "Paint with it", run: () => (editor.ink = TRANSPARENT) },
          { label: "Edit", hint: "`.` is fixed", disabled: true, run: () => {} },
        ])}
      title="Transparent — the empty cell"
      aria-label="Transparent"
    >
      <span class="tag dark">.</span>
    </button>

    {#each entries as [ch, hex], i (ch)}
      <button
        data-swatch={ch}
        class="cell"
        class:on={editor.ink === ch}
        class:in-run={inRun.has(ch)}
        class:unused={unused.has(ch)}
        class:clash={clashes.has(ch)}
        class:sheer={alphaOf(hex) < 255}
        class:lifted={drag?.ch === ch}
        class:over={drag && drag.ch !== ch && drag.over === i}
        role="option"
        aria-selected={editor.ink === ch}
        style:--fill={hex}
        onpointerdown={(e) => grab(e, ch, i)}
        onpointermove={slide}
        onpointerup={drop}
        onpointercancel={drop}
        onclick={(e) => {
          if (moved) return;
          if (e.shiftKey && editor.ink !== TRANSPARENT) runTo = ch;
          else {
            editor.ink = ch;
            runTo = null;
          }
        }}
        ondblclick={(e) => {
          picking = ch;
          at = (e.currentTarget as HTMLElement).getBoundingClientRect();
        }}
        oncontextmenu={(e) => openMenu(e, `Colour ${ch}`, itemsFor(ch, hex))}
        title={`${ch} — ${hex}${unused.has(ch) ? " · unused" : ""}`}
        aria-label={`Colour ${ch}, ${hex}`}
      >
        <span class="tag" class:dark={light(hex)}>{ch}</span>
      </button>
    {/each}
  </div>

  {#if run.length > 1}
    <div class="run">
      <span>{run.length} colours, {run[0]} to {run[run.length - 1]}</span>
      <button class="share" onclick={cycleRun} title="Rotate these colours, one variant per step">
        <RefreshCw size={11} /> Cycle these
      </button>
    </div>
  {/if}

  <!-- The current colour, and everything you can do to it. One of these rather
       than one per entry: you have already said which colour you meant. -->
  {#if current}
    {@const hex = current[1]}
    {@const ch = current[0]}
    <div class="now">
      {#if renaming === ch}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="ch"
          maxlength="1"
          value={ch}
          autofocus
          onblur={(e) => commitRename(ch, e)}
          onkeydown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      {:else}
        <button class="ch" onclick={() => (renaming = ch)} title="Rename this character">
          {ch}
        </button>
      {/if}
      <input
        class="hextext"
        value={hex}
        spellcheck="false"
        aria-label={`Hex for ${ch}`}
        onchange={(e) => {
          const v = (e.target as HTMLInputElement).value.trim();
          if (COLOUR.test(v)) setColour(ch, v);
        }}
      />
      <button
        class="edit"
        class:sheer={alphaOf(hex) < 255}
        style:--fill={hex}
        title={`Edit ${ch}`}
        aria-label={`Edit colour ${ch}`}
        onclick={(e) => {
          picking = ch;
          at = (e.currentTarget as HTMLElement).getBoundingClientRect();
        }}
      ></button>
      <!-- The same trigger the parts rows use: one glyph for "actions",
           everywhere it is said. -->
      <IconButton
        size="sm"
        ghost
        label={`Actions for ${ch}`}
        onclick={(e) => openMenu(e, `Colour ${ch}`, itemsFor(ch, hex))}
      >
        <Ellipsis size={13} />
      </IconButton>
    </div>
  {:else}
    <p class="note">Transparent — the cell with nothing in it. `.` in the file.</p>
  {/if}

  {#if shared && (elsewhere.length || sendableAll)}
    <button class="share" onclick={(e) => openMenu(e, "Colours across the parts", bundleItems())}>
      Share colours…
      <span class="tally">
        {elsewhere.length ? `${elsewhere.length} in` : ""}{elsewhere.length && sendableAll
          ? " · "
          : ""}{sendableAll ? `${sendableAll} out` : ""}
      </span>
    </button>
  {/if}
</Panel>

<ColourPicker
  at={picking ? at : null}
  value={picking ? (node.palette[picking] ?? "#000000") : "#000000"}
  onchange={(v, fresh) => picking && setColour(picking, v, fresh)}
  onclose={() => {
    picking = null;
    at = null;
  }}
/>

<!-- Variants: alternate colours for some of the characters above, so one
     drawing can be recoloured without being redrawn. Picking one switches what
     the canvas and the previews show — a consumer draws exactly this. -->
<Panel id="variants" title="Variants" badge={rows.length ? String(rows.length) : undefined}>
  {#snippet actions()}
    <IconButton
      size="sm"
      label="Add a variant from the palette"
      onclick={() => addVariant(nextVariantName())}
    >
      <Plus size={13} />
    </IconButton>
  {/snippet}

  <ul>
    <li class="look">
      <button
        class="swatch flat"
        class:on={editor.variant === null}
        onclick={() => (editor.variant = null)}
        title="Show the palette itself"
        aria-label="Show the palette"
      ></button>
      <span class="hex">no variant</span>
    </li>
    {#each rows as row (row.kind === "cycle" ? `cycle ${row.cycle.name}` : row.name)}
      {#if row.kind === "cycle"}
        {@const c = row.cycle}
        <li class="named cycle" oncontextmenu={(e) => cycleMenu(e, c)}>
          <button
            class="swatch"
            class:on={showing?.name === c.name}
            style:background={stripe(c)}
            onclick={() => (editor.variant = c.phases[0])}
            title={`Show this sprite cycling ${c.chars.join(" ")}`}
            aria-label={`Show cycle ${c.name}`}
          ></button>
          <input
            class="hextext"
            value={c.name}
            spellcheck="false"
            onchange={(e) => renameCycle(c.name, (e.target as HTMLInputElement).value)}
          />
          <span class="count" title={`${c.phases.length} phases, one variant each`}>
            <RefreshCw size={10} />{c.phases.length}
          </span>
          <button class="drop" onclick={() => removeCycle(c.name)} title="Remove this cycle">
            ×
          </button>
        </li>
      {:else}
        {@const name = row.name}
        <li class="named" oncontextmenu={(e) => variantMenu(e, name)}>
          <button
            class="swatch flat"
            class:on={editor.variant === name}
            onclick={() => (editor.variant = name)}
            title={`Show this sprite in ${name}`}
            aria-label={`Show variant ${name}`}
          ></button>
          <input
            class="hextext"
            value={name}
            spellcheck="false"
            onchange={(e) => renameVariant(name, (e.target as HTMLInputElement).value)}
          />
          <button class="drop" onclick={() => removeVariant(name)} title="Remove this variant">
            ×
          </button>
        </li>
      {/if}
    {/each}
  </ul>
  {#if showingHere}
    <p class="note">
      Cycling <strong>{showingHere.name}</strong>: {showingHere.chars.join(" ")}{showingHere.reverse
        ? ", backwards"
        : ""}. Its colours follow the palette — change them there. P plays it.
    </p>
  {:else if editor.variant}
    <p class="note">
      Editing <strong>{editor.variant}</strong>. A colour it does not name falls back to the
      palette's, so a two-tone recolour only names two.
    </p>
    <ul>
      {#each entries as [ch] (ch)}
        {@const own = node.variants?.[editor.variant]?.[ch]}
        <li>
          <span class="ch">{ch}</span>
          <!-- input streams through a sweep of the system picker: the first
               value opens the undo entry, the rest ride it, change closes. -->
          <input
            class="hex"
            type="color"
            value={cellColour(node, ch, editor.variant) ?? "#000000"}
            oninput={(e) => {
              setVariantColour(editor.variant!, ch, (e.target as HTMLInputElement).value, !sweep);
              sweep = true;
            }}
            onchange={() => (sweep = false)}
          />
          {#if own}
            <button
              class="drop"
              onclick={() => clearVariantColour(editor.variant!, ch)}
              title="Fall back to the palette's colour"
            >
              ×
            </button>
          {:else}
            <span class="hex">inherited</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if unused.size}
    <p class="note">{unused.size} unused {unused.size === 1 ? "colour" : "colours"} (dimmed).</p>
  {/if}
  {#if entries.length >= BUDGET_NOTE_AT}
    <!-- addColour quietly no-ops when the characters run out; the budget has to
         be visible before that, not discovered as a + that stopped working. -->
    <p class="note">{entries.length} of {PALETTE_CHARS.length} characters used.</p>
  {/if}
</Panel>

<style>
  /* Deluxe Paint's shape: the palette IS the colours, laid out as a block you
     can scan. Six across fits a 16rem rail with room for a cell big enough to
     hit and to read a character on. */
  .grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.2rem;
  }
  .grid:focus-visible {
    outline: none;
  }
  .cell {
    position: relative;
    aspect-ratio: 1;
    padding: 0;
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    cursor: pointer;
    touch-action: none;
    background: var(--fill);
  }
  /* A colour you can see through is drawn over a checker, the same way the
     canvas draws the emptiness behind the art — otherwise a pale glass and a
     pale solid are the same square. */
  .cell.sheer {
    background:
      linear-gradient(var(--fill), var(--fill)),
      repeating-conic-gradient(#3a3a3a 0% 25%, #1e1e1e 0% 50%) 0 0 / 8px 8px;
  }
  .transparent {
    background: repeating-conic-gradient(#3a3a3a 0% 25%, #1e1e1e 0% 50%) 0 0 / 8px 8px;
  }
  .cell.on {
    outline: 2px solid var(--halo-accent);
    outline-offset: 1px;
  }
  .cell:hover:not(.on) {
    border-color: var(--halo-text-light);
  }
  /* Unused is quieter, not hidden: it is still a colour the file carries. */
  .cell.unused .tag {
    opacity: 0.4;
  }
  /* Taken into a run: selected, so the accent — thinner than the ink's, which
     is the run's anchor and the colour that paints. */
  .cell.in-run:not(.on) {
    outline: 1px solid var(--halo-accent);
    outline-offset: 1px;
  }
  .cell.lifted {
    opacity: 0.45;
  }
  .cell.over {
    outline: 2px solid var(--halo-accent);
    outline-offset: 1px;
  }
  /* The character, on the swatch. Ink chosen against the colour under it, so a
     pale yellow and a near-black both stay readable. */
  .tag {
    position: absolute;
    left: 2px;
    bottom: 0;
    font-size: 0.68rem;
    line-height: 1.2;
    font-family: ui-monospace, monospace;
    color: #fff;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.9);
    pointer-events: none;
  }
  .tag.dark {
    color: #000;
    text-shadow: 0 0 2px rgba(255, 255, 255, 0.9);
  }
  /* One character means two colours somewhere else in the subject. */
  .cell.clash::after {
    content: "";
    position: absolute;
    right: -2px;
    top: -2px;
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: var(--halo-accent);
    box-shadow: 0 0 0 1px var(--halo-bg-light);
  }

  /* The current colour: its character, its hex, the picker, the menu. */
  .now {
    display: grid;
    grid-template-columns: 1.4rem 1fr 1.6rem 1.2rem;
    gap: 0.3rem;
    align-items: center;
  }
  .ch {
    height: 1.4rem;
    padding: 0;
    font-family: ui-monospace, monospace;
    font-size: 0.85rem;
    text-align: center;
    background: none;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--halo-text-main);
    cursor: pointer;
  }
  .ch:hover,
  input.ch {
    border-color: var(--halo-border);
    background: var(--halo-bg-main);
  }
  .hextext {
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
    background: var(--halo-bg-main);
    color: var(--halo-text-main);
    border: 1px solid var(--halo-border);
    border-radius: 3px;
    padding: 0.15rem 0.3rem;
    min-width: 0;
  }
  /* Sized rather than left to its content: there is no content, and a button
     with none is two borders and a gap. */
  .edit {
    width: 1.6rem;
    height: 1.4rem;
    padding: 0;
    border: 1px solid var(--halo-border);
    border-radius: 3px;
    cursor: pointer;
    background: var(--fill);
  }
  .edit.sheer {
    background:
      linear-gradient(var(--fill), var(--fill)),
      repeating-conic-gradient(#3a3a3a 0% 25%, #1e1e1e 0% 50%) 0 0 / 6px 6px;
  }
  .edit:hover {
    border-color: var(--halo-text-light);
  }
  .share {
    font-size: 0.68rem;
    padding: 0.2rem 0.3rem;
    background: none;
    color: var(--halo-text-muted);
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
  }
  .run {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    font-size: 0.68rem;
    color: var(--halo-text-muted);
  }
  .run .share {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
  .count {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    font-size: 0.68rem;
    color: var(--halo-text-muted);
    font-variant-numeric: tabular-nums;
  }
  .tally {
    color: var(--halo-text-light);
    font-size: 0.64rem;
  }
  .share:hover {
    color: var(--halo-text-main);
    border-color: var(--halo-accent);
  }
  .note {
    margin: 0;
    font-size: 0.72rem;
    color: var(--halo-text-muted);
    line-height: 1.45;
  }

  /* The variants list keeps its rows: a variant is a name and a set of
     overrides, which is a list rather than a block of colours. */
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.2rem;
  }
  li.look {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  li.look .hex {
    white-space: nowrap;
  }
  li {
    display: grid;
    grid-template-columns: 1.4rem 1.2rem 1.6rem 1fr 1.2rem;
    gap: 0.3rem;
    align-items: center;
  }
  /* A named row — a variant, a cycle — is swatch, name, and remove; the name
     takes the width, or it is one letter wide in a column sized for a colour. */
  li.named {
    grid-template-columns: 1.4rem 1fr 1.2rem;
  }
  li.named.cycle {
    grid-template-columns: 1.4rem 1fr auto 1.2rem;
  }
  .swatch {
    width: 1.4rem;
    height: 1.4rem;
    border: 1px solid var(--halo-border);
    border-radius: 3px;
    padding: 0;
    cursor: pointer;
    background: var(--fill);
  }
  .swatch.flat {
    background: none;
  }
  .swatch.on {
    outline: 2px solid var(--halo-accent);
    outline-offset: 1px;
  }
  .hex {
    font-size: 0.75rem;
    color: var(--halo-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .drop {
    background: none;
    border: 0;
    color: var(--halo-text-muted);
    cursor: pointer;
    padding: 0;
  }
  .drop:hover {
    color: var(--halo-error);
  }
</style>
