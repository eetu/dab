import {
  type Box,
  COLOUR,
  composite,
  encodePng,
  flattenSprite,
  groupBox,
  type Pose,
  type SpriteBody,
  TRANSPARENT,
} from "dab-core";

import { fail } from "./store";

// Images are for looking, and image tokens are not free: every render is
// scaled by a whole number to about `size` pixels on its long side, and is a
// PNG of exactly the colours drawn.

export const SIZE = 512;
/** Behind the art, so a dark pixel on nothing is not a dark pixel on black. */
export const BACKDROP = "#3a3a3a";
/** Between the cells of a strip, so art that reaches its edge stays apart. */
export const GUTTER = "#1c1c1c";

/** A node with its parts baked in, every frame, in a colourway — the picture
 *  the editor's canvas shows. `box` is where it sits in the node's coordinates
 *  (parts may reach past the node's own edges). */
export function assembled(
  node: SpriteBody,
  resolve: (name: string) => SpriteBody | null,
  variant?: string | null,
): { body: SpriteBody; box: Box } {
  const flat = flattenSprite(node, { resolve, variant });
  return {
    body: { w: flat.w, h: flat.h, palette: flat.palette, frames: flat.frames },
    box: groupBox(node, resolve),
  };
}

/** `w × h` cells of a body from (x, y) in its own grid; what falls outside it
 *  is nothing. A view for a picture, so it never reaches a file. */
export function crop(body: SpriteBody, x: number, y: number, w: number, h: number): SpriteBody {
  const blank = TRANSPARENT.repeat(w);
  const frames = body.frames.map((rows) =>
    Array.from({ length: h }, (_, j) => {
      const row = rows[y + j];
      if (row === undefined) return blank;
      let out = "";
      for (let i = 0; i < w; i++) out += row[x + i] ?? TRANSPARENT;
      return out;
    }),
  );
  return { ...body, w, h, frames };
}

export const solid = (w: number, h: number, hex: string): SpriteBody => ({
  w,
  h,
  palette: { B: hex },
  frames: [Array.from({ length: h }, () => "B".repeat(w))],
});

/** A backdrop argument: a colour, "none", or the default. */
export function backdrop(arg: string | undefined): string | null {
  if (arg === undefined) return BACKDROP;
  if (arg === "none") return null;
  if (!COLOUR.test(arg)) fail(`backdrop ${arg} is not a #rrggbb colour or "none"`);
  return arg;
}

export type Placed = { pose: Pose; x: number; y: number };

/** Poses on one canvas of `w × h` cells, as a PNG about `size` pixels long. */
export async function png(
  placed: Placed[],
  w: number,
  h: number,
  size = SIZE,
): Promise<{ data: string; scale: number; px: [number, number] }> {
  if (w < 1 || h < 1) fail("there is nothing to render: the area is empty");
  const scale = Math.max(1, Math.floor(size / Math.max(w, h)));
  const pic = composite(placed, w, h, scale);
  const bytes = await encodePng(pic);
  return { data: Buffer.from(bytes).toString("base64"), scale, px: [pic.w, pic.h] };
}

/** Columns for `n` cells of `w × h` laid out near square, so a long strip
 *  of a wide sprite does not shrink to a line. */
export function columns(n: number, w: number, h: number): number {
  let best = 1;
  let bestSide = Infinity;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const side = Math.max(cols * (w + 1), rows * (h + 1));
    if (side < bestSide) {
      bestSide = side;
      best = cols;
    }
  }
  return best;
}
