<script lang="ts">
  // The perspective brush's controls, over the canvas — the same place, and
  // for the same reason, as the rotate bar's: what an angle does to a stamp
  // only means something on the art it is about to land on.
  import { brush, endPerspective, perspective, perspectiveAt, setPlane } from "./editor.svelte";
  import SegmentedControl from "./SegmentedControl.svelte";

  const SMOOTH = [
    { id: 1, label: "Crisp", hint: "Nearest neighbour — jagged, and costs no colours" },
    { id: 2, label: "2×", hint: "A little blending at the edges" },
    { id: 3, label: "3×", hint: "Blended, and the usual choice" },
    { id: 4, label: "4×", hint: "Smoothest, and the most colours" },
  ];

  const ANGLES = [
    {
      key: "tilt",
      label: "Tilt",
      min: -85,
      max: 85,
      hint: "Lean back: a floor, or forward: a ceiling",
    },
    {
      key: "turn",
      label: "Turn",
      min: -85,
      max: 85,
      hint: "Swing about the vertical: a wall receding",
    },
    { key: "spin", label: "Spin", min: -180, max: 180, hint: "Turn the brush on the plane" },
  ] as const;

  // Distance on a log scale: 8 to 1024 pixels in a slider's width. Near is
  // where all the change is, and a linear slider spent most of itself on views
  // that all look flat.
  const D_MIN = 8;
  const D_MAX = 1024;
  const toSlider = (d: number) => (Math.log(d / D_MIN) / Math.log(D_MAX / D_MIN)) * 100;
  const fromSlider = (v: number) => Math.round(D_MIN * (D_MAX / D_MIN) ** (v / 100));

  const size = $derived.by(() => {
    const rows = brush();
    return rows ? `${rows[0].length}×${rows.length}` : "";
  });
  /** What the stamp under the pointer would cost, before it is paid. */
  const under = $derived(perspective.at ? perspectiveAt(perspective.at) : null);
</script>

{#if perspective.on}
  <!-- Pointer events stop here, as on every bar over the canvas: the pane
       captures the pointer for strokes, and a captured release never clicks. -->
  <div class="bar" role="group" aria-label="Perspective" onpointerdown={(e) => e.stopPropagation()}>
    <span class="what">Perspective brush <span class="size">{size}</span></span>

    {#each ANGLES as a (a.key)}
      <label class="dial" title={a.hint}>
        {a.label}
        <input
          type="range"
          min={a.min}
          max={a.max}
          step="1"
          value={perspective[a.key]}
          aria-label={`${a.label} in degrees`}
          oninput={(e) => setPlane({ [a.key]: Number(e.currentTarget.value) })}
        />
        <output>{perspective[a.key]}°</output>
      </label>
    {/each}

    <label class="dial" title="Eye to anchor: near is steep, far is flat">
      Distance
      <input
        type="range"
        min="0"
        max="100"
        step="0.5"
        value={toSlider(perspective.distance)}
        aria-label="Distance in pixels"
        oninput={(e) => setPlane({ distance: fromSlider(Number(e.currentTarget.value)) })}
      />
      <output>{perspective.distance}</output>
    </label>

    <SegmentedControl
      label="Smoothing"
      options={SMOOTH}
      value={perspective.smooth}
      onchange={(id) => setPlane({ smooth: Number(id) })}
    />

    <span class="cost" class:none={!under?.added.length} data-testid="cost">
      {#if !perspective.at}
        point at the art
      {:else if !under}
        past the horizon
      {:else if under.added.length}
        +{under.added.length} colour{under.added.length > 1 ? "s" : ""}
      {:else}
        no new colours
      {/if}
    </span>

    <button class="done" onclick={endPerspective} title="Put the brush down (Esc)">Done</button>
  </div>
{/if}

<style>
  /* At the TOP, unlike the other bars: what this brush is for — floors, roads,
     the ground under things — is the bottom of the picture, and so is the
     anchor it is pinned at. */
  .bar {
    position: absolute;
    left: 50%;
    top: 0.6rem;
    transform: translateX(-50%);
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: max-content;
    max-width: calc(100% - 1.2rem);
    flex-wrap: wrap;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--halo-border);
    border-radius: 8px;
    background: var(--halo-bg-main);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
    font-family: var(--halo-font-body);
    font-size: 0.72rem;
    color: var(--halo-text-main);
  }
  .what {
    color: var(--halo-text-muted);
    white-space: nowrap;
  }
  .size {
    color: var(--halo-text-light);
    font-variant-numeric: tabular-nums;
  }
  .dial {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--halo-text-muted);
    white-space: nowrap;
  }
  .dial input[type="range"] {
    width: 5.5rem;
    accent-color: var(--halo-accent);
  }
  output {
    min-width: 2.2rem;
    color: var(--halo-text-main);
    font-variant-numeric: tabular-nums;
  }
  .cost {
    color: var(--halo-accent);
    white-space: nowrap;
  }
  .cost.none {
    color: var(--halo-text-muted);
  }
  .done {
    background: var(--halo-accent-soft);
    color: var(--halo-accent);
    border: 1px solid var(--halo-accent);
    border-radius: 5px;
    font: inherit;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
  }
</style>
