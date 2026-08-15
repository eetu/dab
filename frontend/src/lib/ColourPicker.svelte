<script lang="ts">
  // Picking a colour, opacity and all.
  //
  // Ours rather than `<input type="color">`, for one reason: the native picker
  // has no alpha, and alpha is part of a colour here. Putting it anywhere else
  // makes it look like a separate property with a switch, which it is not.
  //
  // The native one is still in here though, as a button. It brings the system
  // eyedropper, the saved swatches and the colour spaces, none of which is
  // worth losing to own the popover — so it sets the hue and the alpha stays
  // where it was.
  //
  // A popover at the swatch rather than a modal — a colour is judged against
  // the art, so the art has to stay visible while you move the marker.
  import { alphaOf, withAlpha } from "dab-core";

  import { fromHsv, type Hsv, toHsv } from "./colour";

  type Props = {
    /** The swatch this belongs to, or null when nothing is being picked. */
    at: DOMRect | null;
    value: string;
    /**  is true at the START of a gesture: a drag through a hundred hues
     *  is one edit, so only its first value may open an undo entry — the same
     *  rule a paint stroke follows. */
    onchange: (hex: string, fresh: boolean) => void;
    onclose: () => void;
  };

  let { at, value, onchange, onclose }: Props = $props();

  let hsv = $state<Hsv>({ h: 0, s: 0, v: 0 });
  let alpha = $state(255);
  let text = $state("");
  /** Whether the native chip is mid-sweep — its input events stream like a drag. */
  let sweeping = false;
  let vw = $state(0);
  let vh = $state(0);

  const W = 232;
  const PAD = 8;

  // Opening reads the colour once. After that the markers own it, so dragging
  // through grey or black does not lose the hue you were working in.
  $effect(() => {
    if (!at) return;
    hsv = toHsv(value);
    alpha = alphaOf(value);
    text = value;
  });

  const rgb = $derived(fromHsv(hsv));
  const shown = $derived(withAlpha(rgb, alpha));

  const x = $derived(at ? Math.max(PAD, Math.min(at.left, vw - W - PAD)) : 0);
  const y = $derived(at ? (at.bottom + 250 > vh ? Math.max(PAD, at.top - 250) : at.bottom + 6) : 0);

  function emit(fresh: boolean) {
    text = shown;
    onchange(shown, fresh);
  }

  /** A press anywhere in a strip is a value, and a drag keeps giving values —
   *  the same gesture the canvas uses, so nothing here needs a handle. */
  function track(e: PointerEvent, set: (fx: number, fy: number) => void) {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    const read = (ev: PointerEvent, fresh: boolean) => {
      const r = el.getBoundingClientRect();
      set(
        Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)),
        Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)),
      );
      emit(fresh);
    };
    read(e, true);
    const move = (ev: PointerEvent) => read(ev, false);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} onresize={onclose} />

{#if at}
  <div class="veil" role="presentation" onpointerdown={onclose} onwheel={onclose}></div>
  <div
    class="pop"
    role="dialog"
    aria-label="Colour"
    tabindex="-1"
    style:left={`${x}px`}
    style:top={`${y}px`}
    style:width={`${W}px`}
    onkeydown={(e) => {
      if (e.key === "Escape" || e.key === "Enter") onclose();
      e.stopPropagation();
    }}
  >
    <!-- Saturation across, value down, over the hue underneath. -->
    <div
      class="sv"
      role="slider"
      tabindex="0"
      aria-label="Saturation and brightness"
      aria-valuenow={Math.round(hsv.v * 100)}
      style:--hue={fromHsv({ h: hsv.h, s: 1, v: 1 })}
      onpointerdown={(e) => track(e, (fx, fy) => (hsv = { ...hsv, s: fx, v: 1 - fy }))}
    >
      <span class="dot" style:left={`${hsv.s * 100}%`} style:top={`${(1 - hsv.v) * 100}%`}></span>
    </div>

    <div
      class="strip hue"
      role="slider"
      tabindex="0"
      aria-label="Hue"
      aria-valuenow={Math.round(hsv.h)}
      onpointerdown={(e) => track(e, (fx) => (hsv = { ...hsv, h: fx * 360 }))}
    >
      <span class="grip" style:left={`${(hsv.h / 360) * 100}%`}></span>
    </div>

    <!-- Alpha, in the same picker as everything else it is part of. -->
    <div
      class="strip alpha"
      role="slider"
      tabindex="0"
      aria-label="Opacity"
      aria-valuenow={Math.round((alpha / 255) * 100)}
      style:--solid={rgb}
      onpointerdown={(e) => track(e, (fx) => (alpha = Math.round(fx * 255)))}
    >
      <span class="grip" style:left={`${(alpha / 255) * 100}%`}></span>
    </div>

    <div class="foot">
      <span class="now" style:--fill={shown}></span>
      <input
        class="hex"
        value={text}
        spellcheck="false"
        aria-label="Hex"
        oninput={(e) => {
          const v = (e.target as HTMLInputElement).value.trim();
          text = v;
          if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v)) {
            hsv = toHsv(v);
            alpha = alphaOf(v);
            onchange(v, true);
          }
        }}
      />
      <output>{Math.round((alpha / 255) * 100)}%</output>
      <label class="native" title="System colour picker — eyedropper, swatches">
        <input
          type="color"
          value={rgb}
          aria-label="System colour picker"
          oninput={(e) => {
            hsv = toHsv((e.target as HTMLInputElement).value);
            emit(!sweeping);
            sweeping = true;
          }}
          onchange={() => (sweeping = false)}
        />
      </label>
    </div>
  </div>
{/if}

<style>
  .veil {
    position: fixed;
    inset: 0;
    z-index: 42;
  }
  .pop {
    position: fixed;
    z-index: 43;
    display: grid;
    gap: 0.45rem;
    padding: 0.5rem;
    background: var(--halo-bg-main);
    border: 1px solid var(--halo-border);
    border-radius: var(--halo-radius);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    font-family: var(--halo-font-body);
    color: var(--halo-text-main);
  }
  .pop:focus-visible {
    outline: none;
  }
  .sv {
    position: relative;
    height: 7.5rem;
    border-radius: 4px;
    cursor: crosshair;
    touch-action: none;
    background:
      linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, var(--hue));
    box-shadow: inset 0 0 0 1px var(--halo-border);
  }
  .strip {
    position: relative;
    height: 0.85rem;
    border-radius: 999px;
    cursor: pointer;
    touch-action: none;
    box-shadow: inset 0 0 0 1px var(--halo-border);
  }
  .hue {
    background: linear-gradient(
      to right,
      #f00 0%,
      #ff0 17%,
      #0f0 33%,
      #0ff 50%,
      #00f 67%,
      #f0f 83%,
      #f00 100%
    );
  }
  /* The checker shows through, which is the whole point of the strip. */
  .alpha {
    background:
      linear-gradient(to right, transparent, var(--solid)),
      repeating-conic-gradient(#3a3a3a 0% 25%, #1e1e1e 0% 50%) 0 0 / 8px 8px;
  }
  .dot,
  .grip {
    position: absolute;
    pointer-events: none;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
  }
  .dot {
    width: 0.7rem;
    height: 0.7rem;
    transform: translate(-50%, -50%);
  }
  .grip {
    top: 50%;
    width: 0.7rem;
    height: 0.7rem;
    transform: translate(-50%, -50%);
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .now {
    flex: none;
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 3px;
    box-shadow: 0 0 0 1px var(--halo-border);
    background:
      linear-gradient(var(--fill), var(--fill)),
      repeating-conic-gradient(#3a3a3a 0% 25%, #1e1e1e 0% 50%) 0 0 / 8px 8px;
  }
  .hex {
    flex: 1;
    min-width: 0;
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
    background: var(--halo-bg-light);
    color: var(--halo-text-main);
    border: 1px solid var(--halo-border);
    border-radius: 3px;
    padding: 0.2rem 0.3rem;
  }
  .hex:focus-visible {
    outline: 2px solid var(--halo-accent);
    outline-offset: -1px;
  }
  /* The system picker, as a chip. It has no idea about alpha, so it is given
     the opaque colour and the alpha is put back around it. */
  .native {
    flex: none;
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 3px;
    overflow: hidden;
    cursor: pointer;
    box-shadow: 0 0 0 1px var(--halo-border);
    background: conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00) content-box;
    padding: 2px;
  }
  .native input {
    opacity: 0;
    width: 100%;
    height: 100%;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  output {
    flex: none;
    font-size: 0.7rem;
    color: var(--halo-text-light);
    font-variant-numeric: tabular-nums;
  }
</style>
