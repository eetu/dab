<script lang="ts">
  // The controls for a turn in progress, over the canvas rather than in a dialog.
  //
  // A dialog would have to show its own preview, and a preview of a rotated door
  // says nothing without the car under it. So the canvas stays exactly where it
  // is and this sits over the bottom of it, close enough to the art to compare
  // against but out of the middle of it.
  import {
    applyTurn,
    type Axis,
    cancelTurn,
    setAxis,
    setTurn,
    setTurnFrames,
    turning,
  } from "./editor.svelte";
  import SegmentedControl from "./SegmentedControl.svelte";

  // Three turns, and only one of them is a rotation. Z spins the art where it
  // lies; Y and X swing it out of the picture on a hinge, which an orthographic
  // view shows as the art getting narrower — a door, a bonnet, a lid.
  const AXES = [
    { id: "z", label: "Spin", hint: "In the picture plane — a wheel" },
    { id: "y", label: "Swing", hint: "About a vertical hinge — a door opening toward you" },
    { id: "x", label: "Tilt", hint: "About a horizontal hinge — a bonnet lifting" },
  ];

  const hinged = $derived(turning.axis !== "z");

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
    <span class="what">{turning.whole ? "Turning everything" : "Turning the selection"}</span>

    <SegmentedControl
      label="Which way it turns"
      options={AXES}
      value={turning.axis}
      onchange={(id) => setAxis(id as Axis)}
    />

    <div class="angle">
      {#if !hinged}
        <button
          class="quarter"
          title="A quarter turn left — exact, and free"
          onclick={() => bump(-90)}>↺</button
        >
      {/if}
      <!-- A hinge only opens: past a quarter turn the face is edge-on, and what
           is behind it is the artist's to draw, not the sampler's to guess. -->
      <input
        type="range"
        min={hinged ? 0 : -180}
        max={hinged ? 90 : 180}
        step="1"
        aria-label="Angle"
        value={turning.angle}
        oninput={(e) => setTurn(Number(e.currentTarget.value))}
      />
      {#if !hinged}
        <button
          class="quarter"
          title="A quarter turn right — exact, and free"
          onclick={() => bump(90)}>↻</button
        >
      {/if}
      <input
        class="deg"
        type="number"
        min={hinged ? 0 : -180}
        max={hinged ? 90 : 180}
        step="1"
        aria-label="Angle in degrees"
        value={turning.angle}
        oninput={(e) =>
          setTurn(
            hinged
              ? Math.max(0, Math.min(90, Number(e.currentTarget.value)))
              : wrap(Number(e.currentTarget.value)),
          )}
      />
      <span class="unit">°</span>
    </div>

    <!-- How many frames Apply writes, stepping from where the art is now to the
         angle above. A door closed-to-open is four of these, and doing it by
         hand is four turns of the same block. -->
    <label
      class="frames"
      title={turning.whole ? undefined : "A run of frames turns the whole node"}
    >
      frames
      <input
        type="number"
        min="1"
        max="24"
        step="1"
        disabled={!turning.whole}
        aria-label="Frames to write"
        value={turning.frames}
        oninput={(e) => setTurnFrames(Number(e.currentTarget.value))}
      />
    </label>

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
  .frames {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--halo-text-muted);
    white-space: nowrap;
  }
  .frames input {
    width: 3rem;
    background: var(--halo-bg-light);
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    color: inherit;
    font: inherit;
    padding: 0.1rem 0.2rem;
    text-align: right;
  }
  .frames input:disabled {
    opacity: 0.4;
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
