<script lang="ts">
  // The preview: the sprite actually animating, at a size you can judge.
  //
  // Highlighting a cell in the frame strip tells you which frame is up; it does
  // not tell you whether the wheel looks like it is turning or whether the sign
  // flickers or strobes. That is the whole reason a multi-frame sprite exists,
  // so it gets its own window — and it owns the play head, which the strip then
  // follows, so the two can never disagree.
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import SkipBack from "@lucide/svelte/icons/skip-back";

  import {
    activeNode,
    clipRun,
    editor,
    frameOf,
    pathKey,
    resolvePart,
    stageBox,
  } from "./editor.svelte";
  import IconButton from "./IconButton.svelte";
  import { type MenuItem, openMenu } from "./menu.svelte";
  import Panel from "./Panel.svelte";
  import { recallPrefs, rememberPrefs } from "./persist";
  import { paintAssembly } from "./render";
  import SegmentedControl from "./SegmentedControl.svelte";
  import type { Backdrop } from "./viewport.svelte";

  let { backdrop = "checker" as Backdrop }: { backdrop?: Backdrop } = $props();

  let canvas: HTMLCanvasElement | null = $state(null);
  let paneW = $state(0);
  /** "fit", or a whole zoom the user pinned. Part of the desk, so it comes back
   *  after a reload with the rest of the prefs. */
  let zoomMode = $state<"fit" | number>(recallPrefs().previewZoom ?? "fit");
  $effect(() => rememberPrefs({ previewZoom: zoomMode }));

  const sprite = $derived(editor.sprite);
  const node = $derived(activeNode());
  const frames = $derived(node.frames);
  /** The run the play head walks: a named clip, or the whole strip. */
  const run = $derived(clipRun(node));
  const animated = $derived(run.length > 1);
  /** The preview shows the whole subject, parts and all — it is the closest
   *  thing in the tool to what the game will actually draw. */
  const box = $derived(stageBox());

  // The play head. One interval, here, because this component is the reason it
  // exists; the strip reads editor.playhead. It runs on the node being edited:
  // every other part sits on the frame it was put on, or follows this one.
  $effect(() => {
    if (!editor.playing || !animated) return;
    const steps = run.length;
    const id = setInterval(
      () => (editor.playhead = (editor.playhead + 1) % steps),
      1000 / Math.max(1, editor.fps),
    );
    return () => clearInterval(id);
  });

  // Stopped, the preview shows the frame being edited — so it doubles as a
  // clean look at the current frame without the grid and the cursor over it.
  const shown = $derived(editor.playing ? run[editor.playhead % run.length] : editor.frame);

  const ZOOMS = [
    { id: "fit", label: "Fit" },
    { id: 1, label: "×1" },
    { id: 2, label: "×2" },
    { id: 4, label: "×4" },
    { id: 8, label: "×8" },
  ] as const;

  /** Height budget inside the stage box, in pixels — see `.stage` below. */
  const STAGE_H = 88;

  // Fit both ways, so a 5×5 spoke fills the box instead of sitting in the middle
  // of it at ×8 while a 72×18 car is still bounded by the panel's width.
  const zoom = $derived(
    zoomMode === "fit"
      ? Math.max(
          1,
          Math.min(
            16,
            Math.floor(Math.min((paneW - 12) / Math.max(1, box.w), STAGE_H / Math.max(1, box.h))),
          ),
        )
      : zoomMode,
  );

  $effect(() => {
    const el = canvas;
    if (!el) return;
    el.width = box.w;
    el.height = box.h;
    const g = el.getContext("2d");
    if (!g) return;
    void editor.shown;
    void editor.hidden;
    g.clearRect(0, 0, el.width, el.height);
    paintAssembly(g, sprite, -box.x, -box.y, {
      // The node being edited plays; the rest sit where they were put. Hidden
      // parts stay hidden, because the preview answers "does this look right"
      // for the state on screen and not for some other one.
      frameOf: (path, n) =>
        pathKey(path) === pathKey(editor.path)
          ? Math.min(shown, n.frames.length - 1)
          : frameOf(path, n, shown),
      resolve: resolvePart,
      variant: editor.variant,
      hidden: (path) => !!editor.hidden[pathKey(path)],
    });
  });

  function rewind() {
    editor.playhead = 0;
    if (!editor.playing) editor.frame = 0;
  }

  /** The header buttons, said at the pointer — plus the zooms, which live below
   *  the picture and are what a right-click on it usually wants. */
  function previewMenu(e: MouseEvent) {
    openMenu(e, editor.clip ? `preview · ${editor.clip}` : "preview", [
      {
        label: editor.playing ? "Stop" : "Play",
        hint: animated ? undefined : "a single frame has nothing to play",
        disabled: !animated,
        run: () => (editor.playing = !editor.playing),
      },
      { label: "Rewind", run: rewind },
      ...(editor.clip
        ? [
            {
              label: "Show the whole strip",
              hint: `stop following ${editor.clip}`,
              run: () => (editor.clip = null),
            } satisfies MenuItem,
          ]
        : []),
      { kind: "separator" },
      ...ZOOMS.map((z): MenuItem => ({
        label: z.id === "fit" ? "Fit" : `×${z.id}`,
        hint: zoomMode === z.id ? "now" : undefined,
        run: () => (zoomMode = z.id === "fit" ? "fit" : Number(z.id)),
      })),
    ]);
  }
</script>

<div class="wrap" bind:clientWidth={paneW}>
  <Panel id="preview" title="Preview" badge={editor.clip ?? undefined}>
    {#snippet actions()}
      <IconButton size="sm" label="Back to the first frame" onclick={rewind}>
        <SkipBack size={13} />
      </IconButton>
      <IconButton
        size="sm"
        active={editor.playing}
        disabled={!animated}
        label={editor.playing ? "Stop" : "Play"}
        hint={animated ? undefined : "A single frame has nothing to play"}
        onclick={() => (editor.playing = !editor.playing)}
      >
        {#if editor.playing}<Pause size={13} />{:else}<Play size={13} />{/if}
      </IconButton>
    {/snippet}

    <div class="stage" data-bg={backdrop} oncontextmenu={previewMenu} role="presentation">
      <canvas
        bind:this={canvas}
        data-testid="preview"
        style:width={`${box.w * zoom}px`}
        style:height={`${box.h * zoom}px`}
      ></canvas>
    </div>

    <div class="controls">
      <label>
        <span>fps</span>
        <input type="range" min="1" max="30" bind:value={editor.fps} disabled={!animated} />
        <output>{editor.fps}</output>
      </label>
      <SegmentedControl
        fill
        label="Preview zoom"
        options={ZOOMS}
        value={zoomMode}
        onchange={(id) => (zoomMode = id === "fit" ? "fit" : Number(id))}
      />
      <p class="read">
        {#if animated}
          frame {shown + 1}/{frames.length} · ×{zoom}
        {:else}
          single frame · ×{zoom}
        {/if}
      </p>
    </div>
  </Panel>
</div>

<style>
  .wrap {
    min-width: 0;
  }
  .stage {
    display: grid;
    place-items: center;
    /* A fixed box: the preview must not resize as the frames play, or a sprite
       with a tall frame makes the whole panel jump. */
    min-height: 6rem;
    padding: 0.4rem;
    border: 1px solid var(--halo-border);
    border-radius: var(--halo-radius);
    overflow: hidden;
    background-image:
      linear-gradient(45deg, #2a2a2a 25%, transparent 25%),
      linear-gradient(-45deg, #2a2a2a 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #2a2a2a 75%),
      linear-gradient(-45deg, transparent 75%, #2a2a2a 75%);
    background-size: 10px 10px;
    background-position:
      0 0,
      0 5px,
      5px -5px,
      -5px 0;
    background-color: #1e1e1e;
  }
  .stage[data-bg="night"] {
    background-image: none;
    background-color: #0b0714;
  }
  .stage[data-bg="dark"] {
    background-image: none;
    background-color: #141414;
  }
  .stage[data-bg="light"] {
    background-image: none;
    background-color: #e9e9ee;
  }
  canvas {
    display: block;
    image-rendering: pixelated;
    max-width: 100%;
  }
  .controls {
    display: grid;
    gap: 0.3rem;
  }
  label {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: var(--halo-text-muted);
  }
  output {
    font-variant-numeric: tabular-nums;
    min-width: 1.2rem;
    text-align: right;
  }
  input[type="range"] {
    width: 100%;
    accent-color: var(--halo-accent);
  }
  .read {
    margin: 0;
    font-size: 0.7rem;
    color: var(--halo-text-light);
    font-variant-numeric: tabular-nums;
  }
</style>
