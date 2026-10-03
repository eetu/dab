<script lang="ts">
  // Export: the sprite as a file something other than dab can open — an
  // indexed PNG of the frame on screen, or a GIF of the run that plays.
  import { alphaOf } from "dab-core";

  import { editor, exportImage, type ExportKind, exportPlan } from "./editor.svelte";
  import { downloadBytes } from "./files";
  import Modal from "./Modal.svelte";
  import SegmentedControl from "./SegmentedControl.svelte";

  type Props = { open: boolean; onclose: () => void };
  let { open, onclose }: Props = $props();

  const KINDS = [
    { id: "png", label: "PNG", hint: "The frame on screen, every colour and its opacity" },
    { id: "gif", label: "GIF", hint: "The run that plays, at the play bar's fps" },
  ];
  const SCALES = [1, 2, 4, 8].map((k) => ({
    id: k,
    label: `×${k}`,
    hint:
      k === 1 ? "One pixel per pixel — what a game draws from" : "Each pixel repeated, to look at",
  }));

  let kind = $state<ExportKind>("png");
  let scale = $state(1);
  let busy = $state(false);

  const plan = $derived(open ? exportPlan(kind) : null);
  const size = $derived.by(() => {
    const body = plan?.poses[0]?.body;
    return body ? `${body.w * scale}×${body.h * scale}` : "";
  });
  /** GIF transparency is on or off: say so when there is glass to lose. */
  const glass = $derived(
    kind === "gif" &&
      !!plan?.poses.some((p) => Object.values(p.body.palette).some((c) => alphaOf(c) < 255)),
  );

  async function go() {
    if (busy) return;
    busy = true;
    try {
      const out = await exportImage(kind, scale);
      downloadBytes(out.name, out.bytes, out.type);
      editor.status = `exported ${out.name}${out.frames > 1 ? ` · ${out.frames} frames` : ""}`;
      editor.statusBad = false;
      onclose();
    } finally {
      busy = false;
    }
  }
</script>

<Modal {open} title="Export" {onclose} onconfirm={go}>
  <div class="row">
    <SegmentedControl
      label="Format"
      options={KINDS}
      value={kind}
      onchange={(id) => (kind = id as ExportKind)}
    />
    <SegmentedControl
      label="Scale"
      options={SCALES}
      value={scale}
      onchange={(id) => (scale = Number(id))}
    />
  </div>

  {#if plan}
    <p class="what">
      <code>{plan.name}</code> · {size}
      {#if kind === "gif"}· {plan.poses.length} frame{plan.poses.length === 1 ? "" : "s"} at {plan.fps}
        fps{/if}
    </p>
  {/if}
  <p class="note">
    What the canvas shows: parts as they are posed, hidden ones left out, in the colourway on
    screen. Indexed — the colours are the palette's, nothing is quantised.
  </p>
  {#if glass}
    <p class="warn">
      GIF is see-through or not: a colour half opaque or more draws solid, less is left out. PNG
      keeps every alpha.
    </p>
  {/if}

  {#snippet footer()}
    <span class="gap"></span>
    <button onclick={onclose}>Cancel</button>
    <button class="go" disabled={busy || !plan?.poses.length} onclick={go}>Download</button>
  {/snippet}
</Modal>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  .what {
    margin: 0;
    font-size: 0.78rem;
    color: var(--halo-text-main);
    font-variant-numeric: tabular-nums;
  }
  code {
    font-family: ui-monospace, monospace;
    font-size: 0.74rem;
  }
  .note {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--halo-text-light);
  }
  .warn {
    margin: 0;
    font-size: 0.74rem;
    line-height: 1.45;
    color: var(--halo-text-muted);
    border-left: 2px solid var(--halo-accent);
    padding-left: 0.45rem;
  }
  .gap {
    flex: 1;
  }
  button {
    background: var(--halo-bg-light);
    color: var(--halo-text-main);
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    padding: 0.3rem 0.7rem;
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    border-color: var(--halo-text-light);
  }
  .go {
    border-color: var(--halo-accent);
    color: var(--halo-accent);
    background: var(--halo-accent-soft);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
