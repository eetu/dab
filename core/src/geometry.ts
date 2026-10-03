import { type SpriteBody, TRANSPARENT } from "./format";
import { patch } from "./patch";

export type Anchor = "topLeft" | "center";

/**
 * Resize the canvas — crop or pad, never scale.
 *
 * Pixel art has no meaningful resample: doubling a 72×18 car gives a blurry
 * 144×36 car or a blocky one, and neither is what "make it bigger" means when
 * the grid IS the drawing. Growing pads with transparent, shrinking crops.
 */
export function resizeSprite<T extends SpriteBody>(
  s: T,
  w: number,
  h: number,
  anchor: Anchor = "topLeft",
): T {
  const dx = anchor === "center" ? Math.round((w - s.w) / 2) : 0;
  const dy = anchor === "center" ? Math.round((h - s.h) / 2) : 0;
  return shifted(s, w, h, dx, dy);
}

/**
 * Grow or shrink by an explicit margin on each side.
 *
 * `resizeSprite`'s anchors put the old art at the top-left or in the middle, and
 * neither can pad only the left — which is exactly what "make room for this part"
 * needs when a part wants a pixel off the near edge. Negative margins crop.
 */
export function padSprite<T extends SpriteBody>(
  s: T,
  left: number,
  top: number,
  right: number,
  bottom: number,
): T {
  return shifted(s, s.w + left + right, s.h + top + bottom, left, top);
}

/** Re-canvas to `w × h` with the old art at `(dx, dy)`. Parts travel with the
 *  pixels they were drawn against — a body that slides two right takes its
 *  wheels with it, or the resize silently moves every part relative to the art. */
function shifted<T extends SpriteBody>(s: T, w: number, h: number, dx: number, dy: number): T {
  const frames = s.frames.map((frame) =>
    Array.from({ length: h }, (_, y) => {
      const src = frame[y - dy];
      let row = "";
      for (let x = 0; x < w; x++) {
        const sx = x - dx;
        row += src && sx >= 0 && sx < s.w ? src[sx] : TRANSPARENT;
      }
      return row;
    }),
  );
  return patch(s, {
    w,
    h,
    frames,
    parts: s.parts?.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
  });
}

export const getPixel = (frame: string[], x: number, y: number): string =>
  frame[y]?.[x] ?? TRANSPARENT;

export function setPixel(frame: string[], x: number, y: number, ch: string): string[] {
  if (y < 0 || y >= frame.length || x < 0 || x >= frame[y].length) return frame;
  if (frame[y][x] === ch) return frame;
  const out = [...frame];
  out[y] = out[y].slice(0, x) + ch + out[y].slice(x + 1);
  return out;
}

/** Apply one character to many pixels at once — every shape tool ends here. */
export function setPixels(
  frame: string[],
  points: Iterable<readonly [number, number]>,
  ch: string,
): string[] {
  const rows = frame.map((r) => r.split(""));
  let touched = false;
  for (const [x, y] of points) {
    if (y < 0 || y >= rows.length || x < 0 || x >= rows[y].length) continue;
    if (rows[y][x] === ch) continue;
    rows[y][x] = ch;
    touched = true;
  }
  return touched ? rows.map((r) => r.join("")) : frame;
}
