import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { drawOrder, levelOf, type SpriteBody, type SpriteFile, withNode } from "dab-core";
import { z } from "zod";

import { checkVersion, type Store, ToolError } from "../store";
import { changed, findNode, parseNode, ruled, where } from "../text";

export type Result = CallToolResult;

export const say = (...lines: (string | false | undefined)[]): Result => ({
  content: [{ type: "text", text: lines.filter(Boolean).join("\n") }],
});

/** A tool body whose refusals come back as an error the model can read and
 *  act on, rather than as a protocol failure. */
export const guard =
  <A>(fn: (args: A) => Promise<Result>) =>
  async (args: A): Promise<Result> => {
    try {
      return await fn(args);
    } catch (e) {
      if (e instanceof ToolError) return { ...say(e.message), isError: true };
      throw e;
    }
  };

export const arg = {
  file: z.string().describe("A sprite in the folder: `car`, `car.json` or `cars/car.json`"),
  node: z
    .string()
    .optional()
    .describe('Which node: omit for the sprite, "doorL/handle" for a part, "@far" for a level'),
  frame: z.number().int().min(0).describe("Frame index, from 0"),
  version: z
    .string()
    .describe(
      "The version your last read of this file returned. A write against an older one is refused",
    ),
  show: z.boolean().optional().describe("Also return the changed cells as a ruled grid"),
};

export type Target = { file: string; version: string };

type Context = { label: string; notes: string[] };

/**
 * One edit, planned: the node it is to, what to do to that node, and how to
 * report it. Every write tool is a plan; `editNode` runs one, `batch` runs
 * several against one load and one save.
 *
 * `shared` is for what a level follows rather than owns — frames and
 * animations — and does it to the sprite when a level is named.
 */
export type Plan = {
  node?: string;
  fn: (node: SpriteBody, ctx: Context) => SpriteBody;
  shared?: boolean;
  frame?: number;
  show?: boolean;
};

/** A plan applied in memory: the sprite after it, and what to say about it. */
export function applyPlan(
  sprite: SpriteFile,
  file: string,
  plan: Plan,
): { sprite: SpriteFile; label: string; lines: string[]; shown?: string } {
  let path = parseNode(plan.node);
  const notes: string[] = [];
  if (plan.shared && levelOf(path) !== null) {
    notes.push(`a level follows the sprite's frames and animations, so this went to the sprite`);
    path = [];
  }
  const label = where(file, path);
  const before = findNode(sprite, file, path);
  const after = plan.fn(before, { label, notes });
  return {
    sprite: withNode(sprite, path, () => after),
    label,
    lines: [...summarise(before, after), ...notes],
    shown:
      plan.show && plan.frame !== undefined ? showChange(before, after, plan.frame) : undefined,
  };
}

/**
 * Every write: load, check the version, apply the plan, save through core's
 * validator and writer. One call, one write — so one undo entry in the editor.
 */
export async function editNode(store: Store, t: Target, plan: Plan): Promise<Result> {
  const loaded = await store.load(t.file);
  checkVersion(loaded.file, t.version, loaded.version);
  const done = applyPlan(loaded.sprite, loaded.file, plan);
  const saved = await store.save(loaded.file, loaded.version, done.sprite);
  if (!saved.changed) {
    return say(`${done.label}: nothing changed; version is still ${saved.version}`, ...done.lines);
  }
  return say(
    `${done.label}: version ${loaded.version} → ${saved.version}`,
    ...done.lines,
    done.shown,
  );
}

/** The write tools, by name: what each takes, and the plan it makes — so a
 *  batch takes the same arguments as the tools it is made of. */
export const writes = new Map<string, { schema: z.ZodType; plan: (args: never) => Plan }>();

/** Register a write tool: the tool itself, and its entry in `writes`. */
export function registerWrite<S extends z.ZodRawShape>(
  server: McpServer,
  store: Store,
  name: string,
  config: { description: string; inputSchema: S },
  plan: (args: z.infer<z.ZodObject<S>>) => Plan,
) {
  writes.set(name, { schema: z.object(config.inputSchema), plan });
  server.registerTool(
    name,
    config,
    guard(async (a: z.infer<z.ZodObject<S>>) => editNode(store, a as Target, plan(a))) as never,
  );
}

/** What an edit did to a node, a line per kind of change. */
export function summarise(a: SpriteBody, b: SpriteBody): string[] {
  const out: string[] = [];
  if (a.w !== b.w || a.h !== b.h) out.push(`size ${a.w}×${a.h} → ${b.w}×${b.h}`);
  if (a.frames.length !== b.frames.length) {
    out.push(`frames ${a.frames.length} → ${b.frames.length}`);
  } else if (a.w === b.w && a.h === b.h) {
    const per = a.frames
      .map((f, i) => [i, changed(f, b.frames[i]).length] as const)
      .filter(([, n]) => n);
    if (per.length)
      out.push(`cells changed: ${per.map(([i, n]) => `${n} on frame ${i}`).join(", ")}`);
  }
  const keys = (p: Record<string, string>) => Object.keys(p);
  const gained = keys(b.palette).filter((c) => !(c in a.palette));
  const lost = keys(a.palette).filter((c) => !(c in b.palette));
  const recoloured = keys(b.palette).filter((c) => c in a.palette && a.palette[c] !== b.palette[c]);
  if (gained.length)
    out.push(`palette gained ${gained.map((c) => `${c} ${b.palette[c]}`).join(", ")}`);
  if (lost.length) out.push(`palette lost ${lost.join(" ")}`);
  if (recoloured.length) {
    out.push(
      `recoloured ${recoloured.map((c) => `${c} ${a.palette[c]} → ${b.palette[c]}`).join(", ")}`,
    );
  }
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  if (!same(a.variants, b.variants))
    out.push(`variants: ${Object.keys(b.variants ?? {}).join(", ") || "none"}`);
  if (!same(a.animations, b.animations)) {
    const list = Object.entries(b.animations ?? {}).map(([n, f]) => `${n} [${f.join(" ")}]`);
    out.push(`animations: ${list.join(", ") || "none"}`);
  }
  if (
    !same(
      a.levels?.map((l) => l.name),
      b.levels?.map((l) => l.name),
    )
  ) {
    out.push(
      `levels: ${(b.levels ?? []).map((l) => `@${l.name} ${l.w}×${l.h}`).join(", ") || "none"}`,
    );
  }
  for (const p of b.parts ?? []) {
    const q = a.parts?.find((x) => x.name === p.name);
    if (q && (q.x !== p.x || q.y !== p.y)) out.push(`${p.name} moved to ${p.x},${p.y}`);
  }
  const order = (n: SpriteBody) => drawOrder(n).map((p) => p?.name ?? "(its own grid)");
  if (a.parts?.length && b.parts?.length && !same(order(a), order(b)))
    out.push(`drawn: ${order(b).join(", ")}`);
  return out;
}

/** The changed cells of one frame and a cell around them, ruled. */
function showChange(a: SpriteBody, b: SpriteBody, frame: number): string | undefined {
  const after = b.frames[frame];
  if (!after) return undefined;
  const cells = a.w === b.w && a.h === b.h ? changed(a.frames[frame] ?? [], after) : [];
  if (!cells.length) return `frame ${frame} now:\n${ruled(after)}`;
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const x0 = Math.max(0, Math.min(...xs) - 1);
  const y0 = Math.max(0, Math.min(...ys) - 1);
  const x1 = Math.min(b.w - 1, Math.max(...xs) + 1);
  const y1 = Math.min(b.h - 1, Math.max(...ys) + 1);
  const rows = after.slice(y0, y1 + 1).map((r) => r.slice(x0, x1 + 1));
  return `frame ${frame}, x ${x0}–${x1}, y ${y0}–${y1}:\n${ruled(rows, x0, y0)}`;
}
