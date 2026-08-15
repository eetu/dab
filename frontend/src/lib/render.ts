// Drawing an assembly: a node's grid, its parts in order, and the parts of
// those.
//
// Shared by the canvas and the preview rather than written twice, so the two
// cannot disagree about what a sprite looks like. It is deliberately the same
// loop a consumer writes — behind-parts, own grid, the rest — because the format
// is the contract and this is the thing that proves the contract is small.
import { cellColour, flipRows, isPartRef, type Part, type SpriteBody, TRANSPARENT } from "dab-core";

/** How one node is drawn. The editor dims everything but the node being edited;
 *  the preview draws the whole thing full, because that is what will be drawn. */
export type NodeStyle = "full" | "dim" | "outline";

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
): void {
  g.globalAlpha = style === "dim" ? DIM_ALPHA : 1;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === TRANSPARENT) continue;
      if (style === "outline" && !onEdge(rows, x, y)) continue;
      const colour = style === "outline" ? OUTLINE_INK : cellColour(node, row[x], variant);
      if (!colour) continue;
      g.fillStyle = style === "dim" ? drained(colour) : colour;
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
  const parts = node.parts ?? [];
  for (const p of parts) if (p.behind) paintPart(g, p, ox, oy, opts, path);
  if (!opts.hidden?.(path)) {
    paintRows(
      g,
      node.frames[opts.frameOf(path, node)] ?? [],
      node,
      ox,
      oy,
      opts.variant,
      opts.style?.(path) ?? "full",
    );
  }
  for (const p of parts) if (!p.behind) paintPart(g, p, ox, oy, opts, path);
}

function paintPart(
  g: CanvasRenderingContext2D,
  p: Part,
  ox: number,
  oy: number,
  opts: PaintOptions,
  path: string[],
): void {
  const sub = [...path, p.name];
  // A shared part is a leaf: its own parts, if it has any, are not expanded.
  const node = isPartRef(p) ? opts.resolve(p.use) : p;
  // A name the folder has not got draws nothing. It is reported in the tree
  // rather than here — silently dropping the entry is the unrecoverable thing.
  if (!node) return;
  // A leaf has nothing under it, so hidden is the end of the matter. A part
  // with pixels of its own goes through paintAssembly, which asks again for
  // each node it reaches.
  if ((isPartRef(p) || p.flip) && opts.hidden?.(sub)) return;
  if (p.flip) {
    // A flipped part carries no parts of its own, so mirroring its grid is the
    // whole job — no child offsets to mirror with it.
    paintRows(
      g,
      flipRows(node.frames[opts.frameOf(sub, node)] ?? [], p.flip),
      node,
      ox + p.x,
      oy + p.y,
      opts.variant,
      opts.style?.(sub) ?? "full",
    );
    return;
  }
  if (isPartRef(p)) {
    paintRows(
      g,
      node.frames[opts.frameOf(sub, node)] ?? [],
      node,
      ox + p.x,
      oy + p.y,
      opts.variant,
      opts.style?.(sub) ?? "full",
    );
    return;
  }
  paintAssembly(g, node, ox + p.x, oy + p.y, opts, sub);
}
