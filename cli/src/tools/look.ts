import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { animationFrames, isPartRef, levelOf, type SpriteBody } from "dab-core";
import { z } from "zod";

import { assembled, backdrop, columns, crop, GUTTER, type Placed, png, solid } from "../render";
import { fail, type Store } from "../store";
import { checkFrame, findNode, parseNode, where } from "../text";
import { arg, guard, type Result } from "./common";

const look = {
  variant: z.string().optional().describe("A colourway to draw in (a variant or cycle phase name)"),
  size: z
    .number()
    .int()
    .min(64)
    .max(2048)
    .optional()
    .describe(
      "About how many pixels the long side gets; default 512. Pixels scale by a whole number",
    ),
  backdrop: z
    .string()
    .optional()
    .describe('A #rrggbb behind the art, or "none" for transparent; default #3a3a3a'),
};

/** Variant names anywhere in a node's assembly, as the renderer matches them. */
function variantsIn(n: SpriteBody, resolve: (name: string) => SpriteBody | null): Set<string> {
  const out = new Set(Object.keys(n.variants ?? {}));
  for (const p of n.parts ?? []) {
    const child = isPartRef(p) ? resolve(p.use) : p;
    if (child) for (const v of variantsIn(child, resolve)) out.add(v);
  }
  return out;
}

const image = (data: string, caption: string): Result => ({
  content: [
    { type: "image", data, mimeType: "image/png" },
    { type: "text", text: caption },
  ],
});

export function registerLook(server: McpServer, store: Store) {
  server.registerTool(
    "render",
    {
      description:
        "Look at a node as the editor draws it — parts baked in — as a PNG. One frame, several, or " +
        "an animation's run laid out as a strip (left to right, then down). x/y/w/h crop to a " +
        "region in the node's pixels. For checking shape and colour; read_frame is for coordinates.",
      inputSchema: {
        file: arg.file,
        node: arg.node,
        frames: z.array(arg.frame).min(1).optional().describe("Frame indices; default [0]"),
        animation: z
          .string()
          .optional()
          .describe("Render this animation's run instead of `frames`"),
        x: z.number().int().optional(),
        y: z.number().int().optional(),
        w: z.number().int().min(1).optional(),
        h: z.number().int().min(1).optional(),
        ...look,
      },
    },
    guard(async (a) => {
      const loaded = await store.load(a.file);
      const path = parseNode(a.node);
      const label = where(loaded.file, path);
      const node = findNode(loaded.sprite, loaded.file, path);
      let frames = a.frames ?? [0];
      if (a.animation) {
        // A level plays the sprite's animations.
        const owner = levelOf(path) !== null ? loaded.sprite : node;
        const names = Object.keys(owner.animations ?? {});
        frames =
          animationFrames(owner, a.animation) ??
          fail(
            `${label} has no animation ${a.animation}; ${names.length ? `it has: ${names.join(", ")}` : "it has none"}`,
          );
      }
      for (const f of frames) checkFrame(node, label, f);
      const resolve = await store.resolver(loaded);
      if (a.variant && !variantsIn(node, resolve).has(a.variant)) {
        const names = [...variantsIn(node, resolve)];
        fail(
          `nothing in ${label} has a variant ${a.variant}; ${names.length ? `there is: ${names.join(", ")}` : "there are none"}`,
        );
      }
      const { body, box } = assembled(node, resolve, a.variant);
      const rx = a.x ?? box.x;
      const ry = a.y ?? box.y;
      const rw = a.w ?? box.x + box.w - rx;
      const rh = a.h ?? box.y + box.h - ry;
      if (rw < 1 || rh < 1)
        fail(
          `that region is empty: ${label} fills x ${box.x}–${box.x + box.w - 1}, y ${box.y}–${box.y + box.h - 1}`,
        );
      const cell = crop(body, rx - box.x, ry - box.y, rw, rh);
      const cols = columns(frames.length, rw, rh);
      const rows = Math.ceil(frames.length / cols);
      const W = cols * rw + cols - 1;
      const H = rows * rh + rows - 1;
      const back = backdrop(a.backdrop);
      const placed: Placed[] = [];
      if (back && frames.length > 1)
        placed.push({ pose: { body: solid(W, H, GUTTER), frame: 0 }, x: 0, y: 0 });
      frames.forEach((f, i) => {
        const x = (i % cols) * (rw + 1);
        const y = Math.floor(i / cols) * (rh + 1);
        if (back) placed.push({ pose: { body: solid(rw, rh, back), frame: 0 }, x, y });
        placed.push({ pose: { body: cell, frame: f }, x, y });
      });
      const out = await png(placed, W, H, a.size);
      const what = a.animation
        ? `animation ${a.animation}, frames ${frames.join(" ")}`
        : `frame${frames.length > 1 ? "s" : ""} ${frames.join(" ")}`;
      return image(
        out.data,
        [
          `${label}${a.variant ? ` in ${a.variant}` : ""}: ${what}`,
          frames.length > 1 && `${cols} across, left to right then down`,
          `each ${rw}×${rh} cells from (${rx},${ry}) in the node's pixels, at ×${out.scale}: ${out.px[0]}×${out.px[1]} px`,
        ]
          .filter(Boolean)
          .join("; "),
      );
    }),
  );

  server.registerTool(
    "render_lineup",
    {
      description:
        "Several sprites side by side at ONE scale, standing on a common baseline — to check that " +
        "sizes agree (a deer beside a fox beside a desk). Each entry names its file, and optionally " +
        "node, frame and variant.",
      inputSchema: {
        sprites: z
          .array(
            z.object({
              file: arg.file,
              node: arg.node,
              frame: arg.frame.optional(),
              variant: look.variant,
            }),
          )
          .min(1)
          .max(16),
        gap: z
          .number()
          .int()
          .min(0)
          .max(32)
          .optional()
          .describe("Cells between sprites; default 2"),
        size: look.size,
        backdrop: look.backdrop,
      },
    },
    guard(async (a) => {
      const gap = a.gap ?? 2;
      const items = await Promise.all(
        a.sprites.map(async (s) => {
          const loaded = await store.load(s.file);
          const path = parseNode(s.node);
          const label = where(loaded.file, path);
          const node = findNode(loaded.sprite, loaded.file, path);
          const frame = s.frame ?? 0;
          checkFrame(node, label, frame);
          const { body } = assembled(node, await store.resolver(loaded), s.variant);
          return { label, frame, body };
        }),
      );
      const H = Math.max(...items.map((i) => i.body.h));
      const W = items.reduce((n, i) => n + i.body.w, 0) + gap * (items.length - 1);
      const back = backdrop(a.backdrop);
      const placed: Placed[] = back
        ? [{ pose: { body: solid(W, H, back), frame: 0 }, x: 0, y: 0 }]
        : [];
      const lines: string[] = [];
      let x = 0;
      for (const [k, i] of items.entries()) {
        placed.push({ pose: { body: i.body, frame: i.frame }, x, y: H - i.body.h });
        lines.push(
          `${k + 1}. ${i.label} frame ${i.frame}: ${i.body.w}×${i.body.h}, x ${x}–${x + i.body.w - 1}`,
        );
        x += i.body.w + gap;
      }
      const out = await png(placed, W, H, a.size);
      return image(
        out.data,
        `left to right on one baseline, ×${out.scale} (one cell is ${out.scale} px), ${out.px[0]}×${out.px[1]} px:\n${lines.join("\n")}`,
      );
    }),
  );
}
