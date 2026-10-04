import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { checkVersion, fail, type Store, ToolError } from "../store";
import { applyPlan, arg, guard, say, writes } from "./common";

// Several edits as one: cutting a sprite into nine parts is one idea, and
// should be one version, one change on disk and one undo step in the editor —
// not nine of each, with every call passing the last one's version along.

export function registerBatch(server: McpServer, store: Store) {
  server.registerTool(
    "batch",
    {
      description:
        "Several edits to one file as ONE write: one version quoted, one change on disk, one " +
        "undo step in the editor. Each op is { tool, args }: a write tool's name and the " +
        "arguments it takes, without file and version. All or nothing — an op that is refused " +
        "stops the batch and nothing is written. Use it for a run of edits that make one " +
        "change: cutting a sprite into parts, a new colour and the cells that use it.",
      inputSchema: {
        file: arg.file,
        version: arg.version,
        ops: z
          .array(
            z.object({
              tool: z.string(),
              args: z.record(z.string(), z.unknown()).optional(),
            }),
          )
          .min(1)
          .max(200),
      },
    },
    guard(async (a) => {
      const loaded = await store.load(a.file);
      checkVersion(loaded.file, a.version, loaded.version);
      let sprite = loaded.sprite;
      const lines: string[] = [];
      a.ops.forEach((op, i) => {
        const at = `op ${i + 1} (${op.tool})`;
        const write = writes.get(op.tool);
        if (!write) {
          fail(`${at} is not a write tool; a batch takes ${[...writes.keys()].join(", ")}`);
        }
        const args = write.schema.safeParse({ ...op.args, file: a.file, version: a.version });
        if (!args.success) fail(`${at}: ${z.prettifyError(args.error)} — nothing was written`);
        try {
          const done = applyPlan(sprite, loaded.file, write.plan(args.data as never));
          sprite = done.sprite;
          lines.push(`${i + 1}. ${op.tool} ${done.label}: ${done.lines.join("; ") || "no change"}`);
        } catch (e) {
          if (e instanceof ToolError) fail(`${at}: ${e.message} — nothing was written`, e.kind);
          throw e;
        }
      });
      const saved = await store.save(loaded.file, loaded.version, sprite);
      return say(
        saved.changed
          ? `${loaded.file}: version ${loaded.version} → ${saved.version}, ${a.ops.length} ops in one write`
          : `${loaded.file}: nothing changed; version is still ${saved.version}`,
        ...lines,
      );
    }),
  );
}
