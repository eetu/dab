import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ellipsePoints,
  floodPoints,
  linePoints,
  rectPoints,
  setPixels,
  type SpriteBody,
  TRANSPARENT,
} from "dab-core";
import { z } from "zod";

import type { Store } from "../store";
import { fail } from "../store";
import { checkChars, checkFrame, unspaced } from "../text";
import { arg, editNode, guard } from "./common";

type Cell = readonly [number, number, string];

/**
 * Put cells down on one frame through core's `setPixels`, a call per character.
 * The last word on a cell wins; cells off the grid are reported, and a write
 * that lands nowhere is refused rather than reported as done.
 */
function paint(
  n: SpriteBody,
  frame: number,
  cells: Iterable<Cell>,
  ctx: { label: string; notes: string[] },
): SpriteBody {
  const last = new Map<string, Cell>();
  const off: Cell[] = [];
  for (const c of cells) {
    const [x, y] = c;
    if (x < 0 || y < 0 || x >= n.w || y >= n.h) off.push(c);
    else last.set(`${x},${y}`, c);
  }
  const grid = `${n.w}×${n.h} (x 0–${n.w - 1}, y 0–${n.h - 1})`;
  if (!last.size) fail(`every cell is off ${ctx.label}, which is ${grid}`);
  if (off.length) {
    const some = off
      .slice(0, 6)
      .map(([x, y]) => `(${x},${y})`)
      .join(" ");
    ctx.notes.push(
      `${off.length} cell${off.length === 1 ? " was" : "s were"} off the ${grid} grid and skipped: ${some}${off.length > 6 ? " …" : ""}`,
    );
  }
  const byChar = new Map<string, [number, number][]>();
  for (const [x, y, ch] of last.values()) {
    if (!byChar.has(ch)) byChar.set(ch, []);
    byChar.get(ch)!.push([x, y]);
  }
  let rows = n.frames[frame];
  for (const [ch, pts] of byChar) rows = setPixels(rows, pts, ch);
  const frames = [...n.frames];
  frames[frame] = rows;
  return { ...n, frames };
}

const ch = z.string().length(1).describe("A palette key, or . to erase");

export function registerDraw(server: McpServer, store: Store) {
  server.registerTool(
    "set_pixels",
    {
      description:
        "Set cells of one frame. Each entry is [x, y, ch]: zero-based in the node's pixels, ch a " +
        "palette key or . to erase. Later entries win over earlier ones for the same cell.",
      inputSchema: {
        file: arg.file,
        version: arg.version,
        node: arg.node,
        frame: arg.frame,
        pixels: z.array(z.tuple([z.number().int(), z.number().int(), ch])).min(1),
        show: arg.show,
      },
    },
    guard(async (a) =>
      editNode(
        store,
        a,
        (n, ctx) => {
          checkFrame(n, ctx.label, a.frame);
          checkChars(
            n,
            ctx.label,
            a.pixels.map((p) => p[2]),
          );
          return paint(n, a.frame, a.pixels, ctx);
        },
        { frame: a.frame, show: a.show },
      ),
    ),
  );

  server.registerTool(
    "draw",
    {
      description:
        "Draw a shape on one frame with one character, as the editor's tools do: a line from " +
        "(x0,y0) to (x1,y1), a rect or an ellipse inside that box (filled or outline), or a fill " +
        "of the 4-connected area of one character at (x0,y0).",
      inputSchema: {
        file: arg.file,
        version: arg.version,
        node: arg.node,
        frame: arg.frame,
        shape: z.enum(["line", "rect", "ellipse", "fill"]),
        x0: z.number().int(),
        y0: z.number().int(),
        x1: z.number().int().optional(),
        y1: z.number().int().optional(),
        filled: z.boolean().optional().describe("rect and ellipse: fill the inside; default false"),
        ch,
        show: arg.show,
      },
    },
    guard(async (a) =>
      editNode(
        store,
        a,
        (n, ctx) => {
          checkFrame(n, ctx.label, a.frame);
          checkChars(n, ctx.label, [a.ch]);
          const points = shape(n.frames[a.frame], a);
          return paint(
            n,
            a.frame,
            points.map(([x, y]) => [x, y, a.ch] as const),
            ctx,
          );
        },
        { frame: a.frame, show: a.show },
      ),
    ),
  );

  server.registerTool(
    "put_rows",
    {
      description:
        "Write a block of rows onto one frame with its top-left at (x, y) — the way to draw " +
        "anything larger than a few cells. Rows are strings of palette keys; . erases unless " +
        "`matte`, where it leaves what is there. Spaces are ignored, so a read_frame grid's rows " +
        "can be written back without the ruler's row numbers.",
      inputSchema: {
        file: arg.file,
        version: arg.version,
        node: arg.node,
        frame: arg.frame,
        x: z.number().int().optional().describe("Left column; default 0"),
        y: z.number().int().optional().describe("Top row; default 0"),
        rows: z.array(z.string()).min(1),
        matte: z.boolean().optional().describe(". is a gap rather than an eraser; default false"),
        show: arg.show,
      },
    },
    guard(async (a) =>
      editNode(
        store,
        a,
        (n, ctx) => {
          checkFrame(n, ctx.label, a.frame);
          const rows = unspaced(a.rows);
          checkChars(n, ctx.label, rows.join(""));
          const x0 = a.x ?? 0;
          const y0 = a.y ?? 0;
          const cells: Cell[] = [];
          rows.forEach((row, j) => {
            for (let i = 0; i < row.length; i++) {
              if (a.matte && row[i] === TRANSPARENT) continue;
              cells.push([x0 + i, y0 + j, row[i]]);
            }
          });
          if (!cells.length) fail("those rows hold nothing to write: every cell is a matte .");
          return paint(n, a.frame, cells, ctx);
        },
        { frame: a.frame, show: a.show },
      ),
    ),
  );
}

function shape(
  rows: string[],
  a: {
    shape: "line" | "rect" | "ellipse" | "fill";
    x0: number;
    y0: number;
    x1?: number;
    y1?: number;
    filled?: boolean;
  },
): [number, number][] {
  if (a.shape === "fill") {
    const pts = floodPoints(rows, a.x0, a.y0);
    if (!pts.length) fail(`(${a.x0},${a.y0}) is off the grid; a fill starts inside it`);
    return pts;
  }
  if (a.x1 === undefined || a.y1 === undefined)
    fail(`a ${a.shape} needs x1 and y1 as well as x0 and y0`);
  if (a.shape === "line") return linePoints(a.x0, a.y0, a.x1, a.y1);
  if (a.shape === "rect") return rectPoints(a.x0, a.y0, a.x1, a.y1, !!a.filled);
  return ellipsePoints(a.x0, a.y0, a.x1, a.y1, !!a.filled);
}
