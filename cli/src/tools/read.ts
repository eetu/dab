import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { cyclesOf, drawOrder, groupBox, isPartRef, phaseName, type SpriteBody } from "dab-core";
import { z } from "zod";

import { fail, type Loaded, type Store } from "../store";
import { checkFrame, findNode, legend, parseNode, ruled, where } from "../text";
import { arg, guard, say } from "./common";

export function registerRead(server: McpServer, store: Store) {
  server.registerTool(
    "list_sprites",
    {
      description: "Every sprite in the folder: size, frames, parts, levels and current version.",
    },
    guard(async () => {
      const files = await store.list();
      const lines = await Promise.all(
        files.map(async (f) => {
          const got = await store.load(f).catch((e: Error) => e);
          if (got instanceof Error)
            return `${f}  (not a sprite: ${got.message.split("\n")[1] ?? got.message})`;
          const s = got.sprite;
          const parts = (s.parts ?? []).map((p) => (isPartRef(p) ? `${p.name}→${p.use}` : p.name));
          return [
            `${f}  ${s.w}×${s.h}  ${s.frames.length} frame${s.frames.length === 1 ? "" : "s"}`,
            parts.length && `parts ${parts.join(" ")}`,
            s.levels?.length && `levels ${s.levels.map((l) => `@${l.name}`).join(" ")}`,
            `version ${got.version}`,
          ]
            .filter(Boolean)
            .join("  ");
        }),
      );
      return say(`${store.root}:`, ...(lines.length ? lines : ["(no .json files)"]));
    }),
  );

  server.registerTool(
    "read_sprite",
    {
      description:
        "A sprite's outline as text: palette, variants, colour cycles, animations, the parts tree " +
        "with placements, levels, and the version every write must quote. No pixels — read_frame " +
        "for those.",
      inputSchema: { file: arg.file },
    },
    guard(async ({ file }) => {
      const loaded = await store.load(file);
      return say(outline(loaded, await store.resolver(loaded)));
    }),
  );

  server.registerTool(
    "read_frame",
    {
      description:
        "Rows of one or more frames of a node, as text. Ruled by default: columns split into tens " +
        "with a space and labelled, rows numbered — coordinates are zero-based, x right and y down, " +
        "in the node's own pixels. Pass x/y/w/h for a region. `plain` gives the rows exactly as " +
        "the file holds them.",
      inputSchema: {
        file: arg.file,
        node: arg.node,
        frames: z.array(arg.frame).min(1).describe("Frame indices, e.g. [0] or [0, 1, 2]"),
        x: z.number().int().optional(),
        y: z.number().int().optional(),
        w: z.number().int().min(1).optional(),
        h: z.number().int().min(1).optional(),
        plain: z.boolean().optional(),
      },
    },
    guard(async (a) => {
      const loaded = await store.load(a.file);
      const path = parseNode(a.node);
      const label = where(loaded.file, path);
      const node = findNode(loaded.sprite, loaded.file, path);
      for (const f of a.frames) checkFrame(node, label, f);
      const x0 = Math.max(0, a.x ?? 0);
      const y0 = Math.max(0, a.y ?? 0);
      const x1 = Math.min(node.w, (a.x ?? 0) + (a.w ?? node.w));
      const y1 = Math.min(node.h, (a.y ?? 0) + (a.h ?? node.h));
      if (x1 <= x0 || y1 <= y0) {
        fail(
          `that region is off ${label}, which is ${node.w}×${node.h} (x 0–${node.w - 1}, y 0–${node.h - 1})`,
        );
      }
      const whole = x0 === 0 && y0 === 0 && x1 === node.w && y1 === node.h;
      const blocks = a.frames.map((f) => {
        const rows = node.frames[f].slice(y0, y1).map((r) => r.slice(x0, x1));
        const grid = a.plain ? rows.join("\n") : ruled(rows, x0, y0);
        return { head: `frame ${f}:`, grid, rows };
      });
      return say(
        `${label}  ${node.w}×${node.h}  ${node.frames.length} frames  version ${loaded.version}` +
          (whole ? "" : `  showing x ${x0}–${x1 - 1}, y ${y0}–${y1 - 1}`),
        ...blocks.flatMap((b) => [b.head, b.grid]),
        "colours here:",
        legend(
          node,
          blocks.flatMap((b) => b.rows),
        ),
      );
    }),
  );
}

/** The sprite as an indented outline — the cheap way to see what is there. */
function outline(loaded: Loaded, resolve: (name: string) => SpriteBody | null): string {
  const s = loaded.sprite;
  const lines = [
    `${loaded.file}  version ${loaded.version}`,
    `${s.name}: ${s.w}×${s.h}, ${s.frames.length} frame${s.frames.length === 1 ? "" : "s"}`,
    ...body(s, ""),
  ];
  const box = groupBox(s, resolve);
  if (box.x || box.y || box.w !== s.w || box.h !== s.h) {
    lines.push(
      `with its parts it fills x ${box.x}–${box.x + box.w - 1}, y ${box.y}–${box.y + box.h - 1}`,
    );
  }
  if (s.parts?.length) {
    lines.push("parts, in drawing order (x,y in the parent's pixels):");
    lines.push(...parts(s, "  ", resolve));
  }
  for (const l of s.levels ?? []) {
    lines.push(`level @${l.name}: ${l.w}×${l.h}`, ...body(l, "  "));
  }
  return lines.join("\n");
}

function body(n: SpriteBody, indent: string): string[] {
  const out = [
    `${indent}palette: ${
      Object.entries(n.palette)
        .map(([c, h]) => `${c} ${h}`)
        .join("  ") || "(empty)"
    }`,
  ];
  const cycles = cyclesOf(n);
  const phases = new Set(cycles.flatMap((c) => c.phases));
  for (const c of cycles) {
    out.push(
      `${indent}cycle ${c.name}: turns ${c.chars.join("")}${c.reverse ? " backwards" : ""}, ` +
        `variants ${phaseName(c.name, 0)} … ${phaseName(c.name, c.phases.length - 1)}`,
    );
  }
  for (const [name, v] of Object.entries(n.variants ?? {})) {
    if (phases.has(name)) continue;
    out.push(
      `${indent}variant ${name}: ${Object.entries(v)
        .map(([c, h]) => `${c} ${h}`)
        .join("  ")}`,
    );
  }
  for (const [name, f] of Object.entries(n.animations ?? {})) {
    out.push(`${indent}animation ${name}: [${f.join(" ")}]`);
  }
  return out;
}

/** A node's parts in the order they draw; with any behind it, its own grid among them. */
function parts(
  node: SpriteBody,
  indent: string,
  resolve: (name: string) => SpriteBody | null,
): string[] {
  const order = drawOrder(node);
  return order.flatMap((p) => {
    if (!p) return order[0] ? [`${indent}(its own grid)`] : [];
    const flags = [p.behind && "behind", p.flip && `flip ${p.flip}`].filter(Boolean).join(", ");
    const tail = flags ? `  (${flags})` : "";
    if (isPartRef(p)) {
      const used = resolve(p.use);
      const size = used ? `${used.w}×${used.h}` : "missing from the folder";
      return [`${indent}${p.name} at ${p.x},${p.y}: borrows ${p.use}.json, ${size}${tail}`];
    }
    return [
      `${indent}${p.name} at ${p.x},${p.y}: ${p.w}×${p.h}, ${p.frames.length} frame${p.frames.length === 1 ? "" : "s"}${tail}`,
      ...body(p, `${indent}  `),
      ...parts(p, `${indent}  `, resolve),
    ];
  });
}
