<script lang="ts">
  // A node, small.
  //
  // Was FrameThumb, which only ever drew the open sprite's own grid. A parts row
  // needs the same picture — you identify a layer by looking at it, not by
  // reading its name — and so will an export preview. So it takes any node, at
  // any frame, and optionally with its parts drawn in place.
  //
  // Its own component so the paint is an $effect over the rows it draws: as an
  // action on a parent's canvas it only re-ran when the *index* changed, so
  // opening a different sprite left every thumbnail showing the previous one's
  // art — with the previous one's colours.
  import type { SpriteBody } from "dab-core";

  import { frameOf, resolvePart, stepOf } from "./editor.svelte";
  import { paintAssembly, paintRows } from "./render";

  type Props = {
    node: SpriteBody;
    frame: number;
    variant?: string | null;
    /** Draw the node's parts too — the whole subject rather than one grid. */
    assembly?: boolean;
    /** Where the node is in the open sprite, so its parts are asked for their
     *  frames under their own paths. */
    base?: readonly string[];
    /** Fixed box, so a strip of them does not jump as the art changes shape. */
    height?: string;
  };

  let {
    node,
    frame,
    variant = null,
    assembly = false,
    base = [],
    height = "3rem",
  }: Props = $props();

  let canvas: HTMLCanvasElement | null = $state(null);

  $effect(() => {
    const el = canvas;
    const rows = node.frames[frame];
    if (!el || !rows) return;
    el.width = node.w;
    el.height = node.h;
    const g = el.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, el.width, el.height);
    if (assembly) {
      // A picture of THIS frame: its parts at the step this frame is in the run
      // selected, never at the play head, or a strip would walk while playing.
      paintAssembly(g, node, 0, 0, {
        frameOf: (path, n) => frameOf([...base, ...path], n, frame, stepOf(frame)),
        resolve: resolvePart,
        variant,
      });
    } else {
      paintRows(g, rows, node, 0, 0, variant);
    }
  });
</script>

<canvas bind:this={canvas} style:height></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    image-rendering: pixelated;
    /* The box is FIXED — height set, not capped. Wide sprites (72×18) and tall
       ones (5×26) share a strip, and the art letterboxes inside the box rather
       than the box following the art: a `max-height` here meant rotating a wide
       rectangle 90° grew its thumbnail and bumped the whole layout. */
    object-fit: contain;
  }
</style>
