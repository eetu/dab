<script lang="ts">
  // The controls for a turn in progress, over the canvas rather than in a dialog.
  //
  // A dialog would have to show its own preview, and a preview of a rotated door
  // says nothing without the car under it. So the canvas stays exactly where it
  // is and this sits over the bottom of it, close enough to the art to compare
  // against but out of the middle of it.
  import { applyTurn, cancelTurn, setTurn, turning } from "./editor.svelte";
  import SegmentedControl from "./SegmentedControl.svelte";

  const SMOOTH = [
    { id: 1, label: "Crisp", hint: "Nearest neighbour — jagged, and costs no colours" },
    { id: 2, label: "2×", hint: "A little blending at the edges" },
    { id: 3, label: "3×", hint: "Blended, and the usual choice" },
    { id: 4, label: "4×", hint: "Smoothest, and the most colours" },
  ];

  /** Wrapped to ±180, so dragging past the end reads as turning the other way
   *  rather than as a number that keeps climbing. */
  const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

  function bump(by: number) {
    setTurn(wrap(turning.angle + by));
  }
</script>

{#if turning.on}
  <!-- Pointer events STOP here. The bar floats inside the canvas pane, whose
       pointerdown captures the pointer for strokes — and a captured pointer
       retargets the release, so the browser never synthesised a click on these
       buttons: the whole bar was dead to the mouse while looking perfectly
       enabled. Chrome over a canvas must never share its gestures with it. -->
  <div class="bar" role="group" aria-label="Rotate" onpointerdown={(e) => e.stopPropagation()}>
    <span class="what">{turning.whole ? "Rotating everything" : "Rotating the selection"}</span>

    <div class="angle">
      <button
        class="quarter"
        title="A quarter turn left — exact, and free"
        onclick={() => bump(-90)}>↺</button
      >
      <input
        type="range"
        min="-180"
        max="180"
        step="1"
        aria-label="Angle"
        value={turning.angle}
        oninput={(e) => setTurn(Number(e.currentTarget.value))}
      />
      <button
        class="quarter"
        title="A quarter turn right — exact, and free"
        onclick={() => bump(90)}>↻</button
      >
      <input
        class="deg"
        type="number"
        min="-180"
        max="180"
        step="1"
        aria-label="Angle in degrees"
        value={turning.angle}
        oninput={(e) => setTurn(wrap(Number(e.currentTarget.value)))}
      />
      <span class="unit">°</span>
    </div>

    <SegmentedControl
      label="Smoothing"
      options={SMOOTH}
      value={turning.smooth}
      onchange={(id) => setTurn(turning.angle, Number(id))}
    />

    <!-- The number that decides whether this is worth doing: a sprite has 69
         characters in total, and a smooth turn can want dozens of them. -->
    <span class="cost" class:none={turning.added === 0} data-testid="cost">
      {turning.added === 0
        ? "no new colours"
        : `+${turning.added} colour${turning.added > 1 ? "s" : ""}`}
    </span>

    <div class="go">
      <button onclick={cancelTurn}>Cancel</button>
      <button class="apply" onclick={applyTurn}>Apply</button>
    </div>
  </div>
{/if}

<style>
  .bar {
    position: absolute;
    left: 50%;
    bottom: 0.6rem;
    transform: translateX(-50%);
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 0.6rem;
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
  .angle {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  input[type="range"] {
    width: 9rem;
    accent-color: var(--halo-accent);
  }
  .quarter {
    background: none;
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    color: var(--halo-text-muted);
    font-size: 0.85rem;
    line-height: 1;
    padding: 0.15rem 0.3rem;
    cursor: pointer;
  }
  .quarter:hover {
    color: var(--halo-accent);
    border-color: var(--halo-accent);
  }
  .deg {
    width: 3.2rem;
    background: var(--halo-bg-light);
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    color: inherit;
    font: inherit;
    padding: 0.1rem 0.2rem;
    text-align: right;
  }
  .unit {
    color: var(--halo-text-muted);
    margin-left: -0.2rem;
  }
  .cost {
    color: var(--halo-accent);
    white-space: nowrap;
  }
  .cost.none {
    color: var(--halo-text-muted);
  }
  .go {
    display: flex;
    gap: 0.3rem;
  }
  .go button {
    background: var(--halo-bg-light);
    border: 1px solid var(--halo-border);
    border-radius: 5px;
    color: inherit;
    font: inherit;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
  }
  .go button:hover {
    border-color: var(--halo-accent);
  }
  .go .apply {
    background: var(--halo-accent-soft);
    color: var(--halo-accent);
    border-color: var(--halo-accent);
  }
</style>
