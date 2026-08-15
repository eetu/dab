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

  import { frameOf, resolvePart } from "./editor.svelte";
  import { paintAssembly, paintRows } from "./render";

  type Props = {
    node: SpriteBody;
    frame: number;
    variant?: string | null;
    /** Draw the node's parts too — the whole subject rather than one grid. */
    assembly?: boolean;
    /** Fixed box, so a strip of them does not jump as the art changes shape. */
    height?: string;
  };

  let { node, frame, variant = null, assembly = false, height = "3rem" }: Props = $props();

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
      paintAssembly(g, node, 0, 0, {
        frameOf: (path, n) => frameOf(path, n, frame),
        resolve: resolvePart,
        variant,
      });
    } else {
      paintRows(g, rows, node, 0, 0, variant);
    }
  });
</script>

<canvas bind:this={canvas} style:aspect-ratio={`${node.w} / ${node.h}`} style:max-height={height}
></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    image-rendering: pixelated;
    /* Wide sprites (72×18) and tall ones (5×26) share a strip, so the box is
       fixed and the art letterboxes inside it rather than the row jumping. */
    object-fit: contain;
  }
</style>
