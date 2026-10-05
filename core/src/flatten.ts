import { channels } from "./colour.ts";
import {
  alphaOf,
  cellColour,
  flipRows,
  type SpriteBody,
  TRANSPARENT,
  withAlpha,
} from "./format.ts";
import { paletteMapper } from "./mapper.ts";
import { layers } from "./read.ts";
import { groupBox } from "./tree.ts";

export type Flattened = {
  frames: string[][];
  palette: Record<string, string>;
  /** Characters the palette gained holding colours from the parts' palettes
   *  and from glass landing on paint. */
  added: string[];
  w: number;
  h: number;
};

export type FlattenView = {
  /** What a `use` part draws; null for a name the folder has not got. */
  resolve?: (name: string) => SpriteBody | null;
  /** The frame a node shows while output frame `frame` is built. The node
   *  being flattened always shows `frame`; this is asked for its parts.
   *  Default: the parts play along, clamped to their own strips. */
  frameOf?: (path: string[], node: SpriteBody, frame: number) => number;
  /** Whether a node's own grid is left out — the editor's eye toggles. */
  hidden?: (path: string[]) => boolean;
  /** The colourway to bake in, matched by name at every node as the renderer
   *  does. Default: the palettes themselves. */
  variant?: string | null;
  tolerance?: number;
};

/** Source-over in sRGB — the compositing a canvas does, so a flatten produces
 *  the pixels the editor was already showing. Opaque paint simply wins;
 *  glass over paint becomes the colour you were seeing through it. */
function over(fg: string, bg: string | null): string {
  const fa8 = alphaOf(fg);
  if (fa8 >= 255 || !bg) return fg;
  const [fr, fgc, fb] = channels(fg);
  const [br, bgc, bb, ba8] = channels(bg);
  const fa = fa8 / 255;
  const ba = ba8 / 255;
  const oa = fa + ba * (1 - fa);
  if (oa <= 0) return fg;
  const mix = (f: number, b: number) =>
    Math.max(0, Math.min(255, Math.round((f * fa + b * ba * (1 - fa)) / oa)))
      .toString(16)
      .padStart(2, "0");
  return withAlpha(`#${mix(fr, br)}${mix(fgc, bgc)}${mix(fb, bb)}`, oa * 255);
}

/**
 * Bake an assembly into one flat grid per frame: the node's pixels, its parts
 * in draw order, and the parts of those — the same walk the renderer makes.
 *
 * This is the answer to "rotate the whole car". The parts cannot turn together
 * — a borrowed wheel is another sprite's pixels, each part invents blends in
 * its own palette, and every part edge would fade against nothing and halo at
 * the seams. A flat copy turns as one grid and blends across the seams, so the
 * assembly stays the source of truth and the flat copy is what gets posed.
 *
 * Colours composite BEFORE they become characters — glass over paint has to
 * blend, and characters cannot. The result colours then go through the same
 * reuse-or-allocate rule rotation uses, starting from the node's own palette so
 * its art keeps its characters.
 */
export function flattenSprite(node: SpriteBody, view: FlattenView = {}): Flattened {
  const box = groupBox(node, view.resolve);
  const { pal, added, charFor } = paletteMapper(node.palette, view.tolerance);

  const frames = node.frames.map((_, f) => {
    const grid: (string | null)[][] = Array.from({ length: box.h }, () =>
      new Array<string | null>(box.w).fill(null),
    );
    const stamp = (n: SpriteBody, rows: string[], ox: number, oy: number) => {
      for (let y = 0; y < rows.length; y++) {
        for (let x = 0; x < rows[y].length; x++) {
          const ch = rows[y][x];
          if (ch === TRANSPARENT) continue;
          const hex = cellColour(n, ch, view.variant);
          if (!hex) continue;
          const gy = oy + y;
          const gx = ox + x;
          if (gy < 0 || gy >= box.h || gx < 0 || gx >= box.w) continue;
          grid[gy][gx] = over(hex, grid[gy][gx]);
        }
      }
    };
    const walk = layers(node, f, {
      resolve: view.resolve,
      frameOf: view.frameOf,
      hidden: view.hidden,
    });
    for (const l of walk) {
      const rows = l.body.frames[l.frame] ?? [];
      stamp(l.body, l.flip ? flipRows(rows, l.flip) : rows, l.x - box.x, l.y - box.y);
    }
    return grid.map((cells) => cells.map((hex) => (hex ? charFor(hex) : TRANSPARENT)).join(""));
  });

  return { frames, palette: pal, added, w: box.w, h: box.h };
}
