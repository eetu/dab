// Drawing an assembly: a node's grid, its parts in order, and the parts of
// those.
//
// Shared by the canvas and the preview rather than written twice, so the two
// cannot disagree about what a sprite looks like. The walk is core's `layers`,
// the one a game draws with through `@anarkisti/dab/core`, so what the editor
// shows is what is drawn.
import { cellColour, flipRows, layers, type SpriteBody, TRANSPARENT } from "dab-core";

/** How one node is drawn. The editor dims everything but the node being edited;
 *  the preview draws the whole thing full, because that is what will be drawn.
 *  `ghost` is the onion skin — a frame that is not this one. */
export type NodeStyle = "full" | "dim" | "outline" | "ghost";

export type PaintOptions = {
  /** Which frame a node shows. A part's frame is its own — that is the point of
   *  parts — so this is asked per node rather than read off one index. */
  frameOf: (path: string[], node: SpriteBody) => number;
  /** What a `use` part draws; null for a name the folder has not got. */
  resolve: (name: string) => SpriteBody | null;
  variant: string | null;
  /**
   * Whether a node's OWN grid is hidden. Per node, not per subtree: hiding a
   * body to look at the parts on it is the reason to hide anything here, and a
   * child that should go too has an eye of its own.
   */
  hidden?: (path: string[]) => boolean;
  style?: (path: string[]) => NodeStyle;
};

const DIM_ALPHA = 0.72;
/** How far a dimmed cell is pulled toward grey. Alpha alone had to go so low
 *  to read as background that the art looked broken; most of the work is
 *  better done by draining the colour and leaving the shape solid. */
const DIM_DESATURATE = 0.55;
const OUTLINE_INK = "rgba(190,205,225,0.55)";

/** A colour with most of its chroma taken out, kept at the same lightness —
 *  and at the same opacity, which is a property of the material rather than a
 *  way of drawing it back. */
function drained(hex: string): string {
  if (hex[0] !== "#" || (hex.length !== 7 && hex.length !== 9)) return hex;
  const n = parseInt(hex.slice(1, 7), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const grey = 0.299 * r + 0.587 * g + 0.114 * b;
  const mix = (c: number) => Math.round(c + (grey - c) * DIM_DESATURATE);
  const a = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
  return `rgba(${mix(r)},${mix(g)},${mix(b)},${a})`;
}

/**
 * The onion skin's colour, and how far a cell is pulled toward it.
 *
 * Tinted rather than merely faint, which is what every animation tool that has
 * had this feature for thirty years does — Aseprite washes the past blue and
 * the future red. A ghost in the art's OWN colours is a ghost that can be read
 * as the art, and after Duplicate, where the frame behind is the same drawing,
 * it is indistinguishable from it. Cool, because the thing it must never be
 * mistaken for is the accent, and because a wash toward blue reads as distance.
 */
const GHOST_INK = { r: 90, g: 150, b: 255 };
const GHOST_WASH = 0.75;

/** A colour washed toward the ghost ink, keeping its own lightness so the
 *  drawing's shape survives the tint. */
function ghosted(hex: string): string {
  if (hex[0] !== "#" || (hex.length !== 7 && hex.length !== 9)) return hex;
  const n = parseInt(hex.slice(1, 7), 16);
  const mix = (c: number, to: number) => Math.round(c + (to - c) * GHOST_WASH);
  const a = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
  return `rgba(${mix((n >> 16) & 255, GHOST_INK.r)},${mix((n >> 8) & 255, GHOST_INK.g)},${mix(n & 255, GHOST_INK.b)},${a})`;
}

/** A silhouette is the cells with a hole or the void on one of their sides. */
const onEdge = (rows: string[], x: number, y: number): boolean =>
  (rows[y - 1]?.[x] ?? TRANSPARENT) === TRANSPARENT ||
  (rows[y + 1]?.[x] ?? TRANSPARENT) === TRANSPARENT ||
  (rows[y]?.[x - 1] ?? TRANSPARENT) === TRANSPARENT ||
  (rows[y]?.[x + 1] ?? TRANSPARENT) === TRANSPARENT;

/**
 * One grid, at an offset. The colour rule is the format's whole contract:
 * `variant?.[ch] ?? palette[ch]`, with `.` transparent.
 */
export function paintRows(
  g: CanvasRenderingContext2D,
  rows: string[],
  node: SpriteBody,
  ox: number,
  oy: number,
  variant: string | null,
  style: NodeStyle = "full",
  /**
   * How solid to paint it, for a caller drawing a ghost of something.
   *
   * It has to be a parameter rather than a `globalAlpha` the caller sets around
   * the call, because this function sets that itself for the dim style — so the
   * onion skin, which did exactly that, has been drawing the previous frame at
   * full strength. A duplicated frame under a turned one then reads as one
   * frame holding both, which is how it was found.
   */
  alpha = 1,
): void {
  g.globalAlpha = style === "dim" ? DIM_ALPHA : alpha;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === TRANSPARENT) continue;
      if (style === "outline" && !onEdge(rows, x, y)) continue;
      const colour = style === "outline" ? OUTLINE_INK : cellColour(node, row[x], variant);
      if (!colour) continue;
      g.fillStyle =
        style === "dim" ? drained(colour) : style === "ghost" ? ghosted(colour) : colour;
      g.fillRect(ox + x, oy + y, 1, 1);
    }
  }
  g.globalAlpha = 1;
}

export function paintAssembly(
  g: CanvasRenderingContext2D,
  node: SpriteBody,
  ox: number,
  oy: number,
  opts: PaintOptions,
  path: string[] = [],
): void {
  // A `use` name the folder has not got draws nothing. It is reported in the
  // tree rather than here — silently dropping the entry is the unrecoverable thing.
  const under = (p: string[]) => [...path, ...p];
  const walk = layers(node, 0, {
    resolve: opts.resolve,
    frameOf: (p, n) => opts.frameOf(under(p), n),
    hidden: opts.hidden && ((p) => opts.hidden?.(under(p)) ?? false),
  });
  for (const l of walk) {
    const rows = l.body.frames[l.frame] ?? [];
    const at = under(l.path);
    paintRows(
      g,
      l.flip ? flipRows(rows, l.flip) : rows,
      l.body,
      ox + l.x,
      oy + l.y,
      opts.variant,
      opts.style?.(at) ?? "full",
    );
  }
}
