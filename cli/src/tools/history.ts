import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  bestOffset,
  carryEdits,
  frameEdits,
  fromJson,
  isPartRef,
  type SpriteBody,
  type SpriteFile,
} from "dab-core";
import { z } from "zod";

import { fail, type Store } from "../store";
import { checkFrame, findNode, parseNode, ruled, where } from "../text";
import { arg, guard, registerWrite, say, summarise } from "./common";

// What changed, and carrying it: the two questions a model has after a person
// has drawn in the editor. Both are measured from a version this server has
// read or written — the one the model last saw — since that is what "what did
// they change" means.

const from = z
  .string()
  .describe("A version you read or wrote earlier — the file as it was before the change");

/** The file as it was at `version`, from what this server has seen. */
function earlier(store: Store, file: string, version: string): SpriteFile {
  const text =
    store.textAt(file, version) ??
    fail(
      `${file} at version ${version} is not one this server has seen — it keeps every version ` +
        `it read or wrote since it started. Read the file now, and measure from that.`,
      "missing",
    );
  const parsed = fromJson(text);
  if ("errors" in parsed) fail(`${file} at version ${version} no longer parses as a sprite`);
  return parsed.sprite;
}

/** Every node of a sprite with its path: the sprite, its levels, its own parts. */
function nodes(s: SpriteBody): Map<string, SpriteBody> {
  const out = new Map<string, SpriteBody>([["", s]]);
  for (const l of s.levels ?? []) out.set(`@${l.name}`, l);
  const walk = (n: SpriteBody, path: string[]) => {
    for (const p of n.parts ?? []) {
      if (isPartRef(p)) continue;
      const sub = [...path, p.name];
      out.set(sub.join("/"), p);
      walk(p, sub);
    }
  };
  walk(s, []);
  return out;
}

/** Up to this many frames are shown as grids; the rest are named. */
const SHOWN = 4;

/** One node's changes: the summary, then each changed frame before and after. */
function nodeDiff(a: SpriteBody, b: SpriteBody): string[] {
  const out = summarise(a, b);
  if (a.w !== b.w || a.h !== b.h) return out;
  let shown = 0;
  for (let f = 0; f < Math.min(a.frames.length, b.frames.length); f++) {
    const cells = frameEdits(a.frames[f], b.frames[f]);
    if (!cells.length) continue;
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    const x0 = Math.max(0, Math.min(...xs) - 1);
    const y0 = Math.max(0, Math.min(...ys) - 1);
    const x1 = Math.min(b.w - 1, Math.max(...xs) + 1);
    const y1 = Math.min(b.h - 1, Math.max(...ys) + 1);
    const head = `frame ${f}: ${cells.length} cell${cells.length === 1 ? "" : "s"}, x ${x0}–${x1}, y ${y0}–${y1}`;
    if (shown++ >= SHOWN) {
      out.push(head);
      continue;
    }
    const crop = (rows: string[]) => rows.slice(y0, y1 + 1).map((r) => r.slice(x0, x1 + 1));
    out.push(
      `${head}\nbefore:\n${ruled(crop(a.frames[f]), x0, y0)}\nafter:\n${ruled(crop(b.frames[f]), x0, y0)}`,
    );
  }
  return out;
}

export function registerHistory(server: McpServer, store: Store) {
  server.registerTool(
    "diff",
    {
      description:
        "What changed in a file between a version you read or wrote and now (or `to`): per " +
        "node — the sprite, its parts, its levels — the size, palette and animation changes, " +
        "and each changed frame's cells before and after, ruled. The way to see what the " +
        "person drew in the editor since you last looked.",
      inputSchema: {
        file: arg.file,
        from,
        to: z.string().optional().describe("Another version to compare with; default: now"),
        node: z.string().optional().describe("Only this node and what is inside it"),
      },
    },
    guard(async (a) => {
      const before = earlier(store, a.file, a.from);
      const now = a.to ? null : await store.load(a.file);
      const after = now?.sprite ?? earlier(store, a.file, a.to!);
      const label = now?.file ?? a.file;
      const toVersion = now?.version ?? a.to!;
      const only = parseNode(a.node).join("/");
      const inside = (key: string) => !a.node || key === only || key.startsWith(`${only}/`);
      const was = nodes(before);
      const is = nodes(after);
      const lines: string[] = [];
      for (const key of new Set([...was.keys(), ...is.keys()])) {
        if (!inside(key)) continue;
        const name = where(label, key ? key.split("/") : []);
        const x = was.get(key);
        const y = is.get(key);
        if (!x) lines.push(`${name}: added, ${y!.w}×${y!.h}`);
        else if (!y) lines.push(`${name}: removed`);
        else {
          const d = nodeDiff(x, y);
          if (d.length) lines.push(`${name}:`, ...d.map((l) => l.replace(/^/gm, "  ")));
        }
      }
      return say(
        `${label}: version ${a.from} → ${toVersion}`,
        ...(lines.length ? lines : ["no change"]),
      );
    }),
  );

  registerWrite(
    server,
    store,
    "carry",
    {
      description:
        "Carry what changed on one frame since an earlier version to other frames — spots " +
        "painted on frame 0 of a walk, onto the rest of it. Each target frame takes the edit " +
        "at an offset: dx/dy as given, or found — where what surrounded the edit is found " +
        "again, within `search` cells (default 4). An edited cell lands only where the target " +
        "still has what it replaced, unless `force`; the rest is reported: cells off the grid, " +
        "and cells the frame has moved on from.",
      inputSchema: {
        file: arg.file,
        version: arg.version,
        node: arg.node,
        from,
        frame: arg.frame.describe("The frame the edit was made on"),
        to: z
          .array(
            z.object({
              frame: arg.frame,
              dx: z.number().int().optional(),
              dy: z.number().int().optional(),
            }),
          )
          .min(1),
        search: z.number().int().min(0).max(16).optional(),
        force: z.boolean().optional().describe("Paint over what the target has; default false"),
      },
    },
    (a) => {
      const base = earlier(store, a.file, a.from);
      return {
        node: a.node,
        fn: (n, { label, notes }) => {
          const was = findNode(base, `${label} at ${a.from}`, parseNode(a.node));
          checkFrame(n, label, a.frame);
          checkFrame(was, `${label} at ${a.from}`, a.frame);
          const edits = frameEdits(was.frames[a.frame], n.frames[a.frame]);
          if (!edits.length) {
            fail(`frame ${a.frame} of ${label} is as it was at ${a.from} — nothing to carry`);
          }
          const frames = [...n.frames];
          for (const t of a.to) {
            checkFrame(n, label, t.frame);
            const found =
              t.dx === undefined || t.dy === undefined
                ? bestOffset(was.frames[a.frame], edits, n.frames[t.frame], a.search ?? 4)
                : null;
            const dx = t.dx ?? found!.dx;
            const dy = t.dy ?? found!.dy;
            const r = carryEdits(frames[t.frame], edits, dx, dy, { match: !a.force });
            frames[t.frame] = r.rows;
            const moved = r.mismatched
              .slice(0, 6)
              .map((m) => `(${m.x},${m.y}) has ${m.has}, not ${m.want}`)
              .join("; ");
            notes.push(
              `frame ${t.frame} at (${dx},${dy})` +
                (found ? `, found: ${found.matched}/${found.of} around the edit matched` : "") +
                `: ${r.placed.length} of ${edits.length} placed` +
                (r.off ? `, ${r.off} off the grid` : "") +
                (r.mismatched.length
                  ? `, ${r.mismatched.length} where the frame has moved on — ${moved}${r.mismatched.length > 6 ? " …" : ""}`
                  : ""),
            );
          }
          return { ...n, frames };
        },
      };
    },
  );
}
