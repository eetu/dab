import path from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  addColour,
  addFrame,
  addLevel,
  addPart,
  blankSprite,
  COLOUR,
  cyclesOf,
  deriveLevel,
  duplicateFrame,
  flipRows,
  isPaletteKey,
  levelOf,
  liftPart,
  moveFrame,
  movePaletteChar,
  moveParts,
  orderPart,
  padSprite,
  refreshCycles,
  removeColour,
  removeFrame,
  removeLevel,
  removeParts,
  renameChar,
  renameLevel,
  resizeSprite,
  rotateRows,
  setColour,
  type SpriteBody,
  type SpriteFile,
} from "dab-core";
import { z } from "zod";

import { fail, type Store } from "../store";
import { checkFrame, findNode, parseNode, where } from "../text";
import { arg, guard, type Plan, registerWrite, say } from "./common";

const hex = z.string().describe("#rrggbb, or #rrggbbaa to see through it");

function checkHex(value: string | undefined): string {
  if (value === undefined) fail("this needs `hex`, a #rrggbb or #rrggbbaa colour");
  if (!COLOUR.test(value)) fail(`${value} is not a #rrggbb or #rrggbbaa colour`);
  return value;
}

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) fail(`this needs \`${what}\``);
  return value;
}

/** Refuse an edit core declined, with the reason it would have had. */
function changedOr<T>(before: T, after: T, why: string): T {
  if (after === before) fail(why);
  return after;
}

export function registerEdit(server: McpServer, store: Store) {
  server.registerTool(
    "create_sprite",
    {
      description:
        "Start a new sprite file: a blank w × h grid with an optional palette and number of frames. " +
        "The sprite's name is the file's name.",
      inputSchema: {
        file: arg.file,
        w: z.number().int().min(1).max(1024),
        h: z.number().int().min(1).max(1024),
        palette: z.record(z.string(), z.string()).optional().describe('e.g. {"A": "#ff2080"}'),
        frames: z.number().int().min(1).max(256).optional(),
      },
    },
    guard(async (a) => {
      const name = path.posix.basename(a.file).replace(/\.json$/, "");
      let s: SpriteFile = blankSprite(name, a.w, a.h);
      for (const [ch, colour] of Object.entries(a.palette ?? {})) {
        if (!isPaletteKey(ch))
          fail(
            `${JSON.stringify(ch)} cannot be a palette key: one printable ASCII character, not .`,
          );
        s = setColour(s, ch, checkHex(colour));
      }
      for (let i = 1; i < (a.frames ?? 1); i++) s = addFrame(s);
      const saved = await store.save(a.file, null, s);
      return say(
        `${saved.file}: created ${a.w}×${a.h}, ${s.frames.length} frame${s.frames.length === 1 ? "" : "s"}; version ${saved.version}`,
      );
    }),
  );

  registerWrite(
    server,
    store,
    "frames",
    {
      description:
        "Add a blank frame after `index` (default: at the end), duplicate, remove or move one. " +
        "Animations are remapped and every level follows, so a level's frames are the sprite's.",
      inputSchema: {
        file: arg.file,
        version: arg.version,
        node: arg.node,
        op: z.enum(["add", "duplicate", "remove", "move"]),
        index: arg.frame.optional(),
        to: arg.frame.optional().describe("move: where the frame ends up"),
      },
    },
    (a) => ({
      node: a.node,
      shared: true,
      fn: (n, { label }) => {
        if (a.index !== undefined) checkFrame(n, label, a.index);
        if (a.op === "add") return addFrame(n, a.index ?? n.frames.length - 1);
        const i = need(a.index, "index");
        if (a.op === "duplicate") return duplicateFrame(n, i);
        if (a.op === "remove") {
          if (n.frames.length === 1) fail(`${label} has one frame, and a node keeps at least one`);
          return removeFrame(n, i);
        }
        const to = need(a.to, "to");
        checkFrame(n, label, to);
        return moveFrame(n, i, to);
      },
    }),
  );

  registerWrite(
    server,
    store,
    "palette",
    {
      description:
        "Edit a node's palette. add: a colour under `ch`, or the next free key. set: recolour `ch` " +
        "(in `variant` if given, which creates it). remove: drop `ch` and erase its pixels (or just " +
        "the variant's override). rename: move `ch`'s pixels and colour to key `to`. move: reorder " +
        "`ch` to `index`. Colour cycles follow every edit.",
      inputSchema: {
        file: arg.file,
        version: arg.version,
        node: arg.node,
        op: z.enum(["add", "set", "remove", "rename", "move"]),
        ch: z.string().optional(),
        hex: hex.optional(),
        to: z.string().optional().describe("rename: the new key"),
        index: z.number().int().min(0).optional().describe("move: the new position"),
        variant: z.string().optional(),
      },
    },
    (a) => ({
      node: a.node,
      fn: (n, { label, notes }) => {
        const known = (c: string | undefined) => {
          const k = need(c, "ch");
          if (!(k in n.palette))
            fail(
              `${label} has no colour ${JSON.stringify(k)}; its keys: ${Object.keys(n.palette).join("") || "(none)"}`,
            );
          return k;
        };
        if (a.op === "add") {
          const colour = checkHex(a.hex);
          if (a.ch === undefined) {
            const next = changedOr(
              n,
              addColour(n, colour),
              `${label}'s palette has every key in use`,
            );
            notes.push(
              `the new colour's key is ${Object.keys(next.palette).find((c) => !(c in n.palette))}`,
            );
            return next;
          }
          if (!isPaletteKey(a.ch))
            fail(
              `${JSON.stringify(a.ch)} cannot be a palette key: one printable ASCII character, not .`,
            );
          if (a.ch in n.palette)
            fail(`${label} already has ${a.ch} (${n.palette[a.ch]}); use op set to recolour it`);
          return setColour(n, a.ch, colour);
        }
        if (a.op === "set") {
          const k = known(a.ch);
          const colour = checkHex(a.hex);
          if (!a.variant) return refreshCycles(setColour(n, k, colour));
          const variants = {
            ...n.variants,
            [a.variant]: { ...n.variants?.[a.variant], [k]: colour },
          };
          return { ...n, variants };
        }
        if (a.op === "remove") {
          const k = known(a.ch);
          if (a.variant) {
            const v = n.variants?.[a.variant];
            if (!v || !(k in v)) fail(`variant ${a.variant} of ${label} does not recolour ${k}`);
            const { [k]: _, ...rest } = v;
            const variants = { ...n.variants };
            if (Object.keys(rest).length) variants[a.variant] = rest;
            else delete variants[a.variant];
            return { ...n, variants: Object.keys(variants).length ? variants : undefined };
          }
          return refreshCycles(removeColour(n, k), cyclesOf(n));
        }
        if (a.op === "rename") {
          const k = known(a.ch);
          const to = need(a.to, "to");
          if (!isPaletteKey(to))
            fail(
              `${JSON.stringify(to)} cannot be a palette key: one printable ASCII character, not .`,
            );
          if (to in n.palette) fail(`${label} already has ${to}; rename it away first`);
          return renameChar(n, k, to);
        }
        return movePaletteChar(n, known(a.ch), need(a.index, "index"));
      },
    }),
  );

  registerWrite(
    server,
    store,
    "animation",
    {
      description:
        "Set an animation's run of frame indices (creating it), rename it, or remove it. A run may " +
        "repeat a frame — that is a hold. A level plays the sprite's animations.",
      inputSchema: {
        file: arg.file,
        version: arg.version,
        node: arg.node,
        name: z.string().min(1),
        frames: z.array(arg.frame).min(1).optional(),
        rename: z.string().min(1).optional(),
        remove: z.boolean().optional(),
      },
    },
    (a) => ({
      node: a.node,
      shared: true,
      fn: (n, { label }) => {
        const ops = [a.frames, a.rename, a.remove].filter((x) => x !== undefined).length;
        if (ops !== 1) fail("pass exactly one of `frames`, `rename` or `remove`");
        const animations = { ...n.animations };
        if (a.frames) {
          for (const f of a.frames) checkFrame(n, label, f);
          animations[a.name] = a.frames;
        } else {
          if (!(a.name in animations)) {
            fail(
              `${label} has no animation ${a.name}; it has: ${Object.keys(animations).join(", ") || "none"}`,
            );
          }
          if (a.rename) {
            if (a.rename in animations) fail(`${label} already has an animation ${a.rename}`);
            const renamed = Object.entries(animations).map(([k, v]) => [
              k === a.name ? a.rename! : k,
              v,
            ]);
            return { ...n, animations: Object.fromEntries(renamed) };
          }
          delete animations[a.name];
        }
        return { ...n, animations: Object.keys(animations).length ? animations : undefined };
      },
    }),
  );

  registerWrite(
    server,
    store,
    "level",
    {
      description:
        "Levels are the subject at other sizes, in step with the sprite. derive: a new level " +
        '`name` at w × h, scaled from the sprite (or from the level `from`, e.g. "@far") as a ' +
        'start to draw over. remove, or rename to `to`. Draw on one as node "@name".',
      inputSchema: {
        file: arg.file,
        version: arg.version,
        op: z.enum(["derive", "remove", "rename"]),
        name: z.string().min(1),
        w: z.number().int().min(1).optional(),
        h: z.number().int().min(1).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      },
    },
    (a) => ({
      fn: (s, { label }) => {
        const names = (s.levels ?? []).map((l) => `@${l.name}`).join(", ") || "none";
        if (a.op === "derive") {
          const fromPath = parseNode(a.from);
          if (fromPath.length && levelOf(fromPath) === null)
            fail('`from` is the sprite (omit it) or a level, like "@far"');
          const source = findNode(s, label, fromPath);
          const level = deriveLevel(source, a.name, need(a.w, "w"), need(a.h, "h"));
          return changedOr(
            s,
            addLevel(s, level),
            `${label} cannot take a level named ${a.name}: the name is taken or has a /; its levels: ${names}`,
          );
        }
        if (a.op === "remove")
          return changedOr(
            s,
            removeLevel(s, a.name),
            `${label} has no level ${a.name}; its levels: ${names}`,
          );
        const to = need(a.to, "to");
        return changedOr(
          s,
          renameLevel(s, a.name, to),
          `cannot rename level ${a.name} to ${to}: no such level, or the new name is taken or has a /; levels: ${names}`,
        );
      },
    }),
  );

  registerWrite(
    server,
    store,
    "transform",
    {
      description:
        "resize: the canvas to w × h — crops or pads, never scales; anchor topLeft or center. " +
        "pad: grow (or with negatives crop) by margins on each side. Parts travel with the art. " +
        "flip: mirror `frames` (default all) on axis h or v. turn: rotate one `frame` by `degrees` " +
        "clockwise inside its box; samples above 1 smooth, inventing colours as needed.",
      inputSchema: {
        file: arg.file,
        version: arg.version,
        node: arg.node,
        op: z.enum(["resize", "pad", "flip", "turn"]),
        w: z.number().int().min(1).optional(),
        h: z.number().int().min(1).optional(),
        anchor: z.enum(["topLeft", "center"]).optional(),
        left: z.number().int().optional(),
        top: z.number().int().optional(),
        right: z.number().int().optional(),
        bottom: z.number().int().optional(),
        axis: z.enum(["h", "v"]).optional(),
        frames: z.array(arg.frame).optional(),
        frame: arg.frame.optional(),
        degrees: z.number().optional(),
        samples: z.number().int().min(1).max(8).optional(),
      },
    },
    (a) => ({
      node: a.node,
      fn: (n, { label, notes }): SpriteBody => {
        if (a.op === "resize") return resizeSprite(n, need(a.w, "w"), need(a.h, "h"), a.anchor);
        if (a.op === "pad")
          return padSprite(n, a.left ?? 0, a.top ?? 0, a.right ?? 0, a.bottom ?? 0);
        if (a.op === "flip") {
          const axis = need(a.axis, "axis");
          const which = a.frames ?? n.frames.map((_, i) => i);
          for (const f of which) checkFrame(n, label, f);
          if (n.parts?.length)
            notes.push("its parts are placed over it, not drawn into it, so they did not flip");
          return {
            ...n,
            frames: n.frames.map((rows, i) => (which.includes(i) ? flipRows(rows, axis) : rows)),
          };
        }
        const frame = need(a.frame, "frame");
        checkFrame(n, label, frame);
        if (n.parts?.length)
          notes.push("only this node's own grid turned; its parts stay where they are");
        const r = rotateRows(n.frames[frame], n.palette, need(a.degrees, "degrees"), {
          samples: a.samples,
        });
        const frames = [...n.frames];
        frames[frame] = r.rows;
        return { ...n, palette: r.palette, frames };
      },
    }),
  );

  registerWrite(
    server,
    store,
    "move_part",
    {
      description:
        "Move a part on its parent: by dx/dy, or to x/y. Coordinates are the parent's pixels.",
      inputSchema: {
        file: arg.file,
        version: arg.version,
        part: z.string().min(1).describe('The part\'s path, e.g. "doorL" or "doorL/handle"'),
        dx: z.number().int().optional(),
        dy: z.number().int().optional(),
        x: z.number().int().optional(),
        y: z.number().int().optional(),
      },
    },
    (a) => ({
      fn: (s, { label }) => {
        const p = parseNode(a.part);
        if (levelOf(p) !== null) fail("a level has no placement to move");
        const parent = findNode(s, label, p.slice(0, -1));
        const name = p[p.length - 1];
        const placed = parent.parts?.find((q) => q.name === name);
        if (!placed) {
          const names = (parent.parts ?? []).map((q) => q.name);
          fail(
            `${where(label, p.slice(0, -1))} has no part ${name}; ${names.length ? `its parts: ${names.join(", ")}` : "it has none"}`,
          );
        }
        const dx = a.x !== undefined ? a.x - placed.x : (a.dx ?? 0);
        const dy = a.y !== undefined ? a.y - placed.y : (a.dy ?? 0);
        return moveParts(s, [p], dx, dy);
      },
    }),
  );

  registerWrite(
    server,
    store,
    "order_part",
    {
      description:
        "Move a part forward or backward in its parent's draw order: the parts drawn behind " +
        "the parent's own grid, then the grid, then the rest. forward/backward go `steps` " +
        "places (default 1), front/back all the way. The grid is one of the steps, so a part " +
        "stepped past it changes sides — a far leg drawn whole goes behind the body hiding it.",
      inputSchema: {
        file: arg.file,
        version: arg.version,
        part: z.string().min(1).describe('The part\'s path, e.g. "doorL" or "doorL/handle"'),
        to: z.enum(["forward", "backward", "front", "back"]),
        steps: z.number().int().min(1).optional(),
      },
    },
    (a) => ({
      fn: (s, { label }) => {
        const p = parseNode(a.part);
        if (levelOf(p) !== null) fail("a level has no place among parts");
        const parent = findNode(s, label, p.slice(0, -1));
        const name = p[p.length - 1];
        if (!parent.parts?.some((q) => q.name === name)) {
          const names = (parent.parts ?? []).map((q) => q.name);
          fail(
            `${where(label, p.slice(0, -1))} has no part ${name}; ${names.length ? `its parts: ${names.join(", ")}` : "it has none"}`,
          );
        }
        return orderPart(s, p, a.to, a.steps);
      },
    }),
  );

  registerWrite(
    server,
    store,
    "part",
    {
      description:
        "Make or remove parts of the node named. add: a blank w × h grid at x,y with the " +
        "node's palette, or `use` another sprite there. lift: cut what is drawn in the " +
        "rectangle x,y,w,h out of the node into a new part, placed where it was — frame by " +
        "frame, so a piece that moves is taken from wherever it is in each. `chars` takes only " +
        "cells of those characters, `attach` adds cells of others touching the piece (a leg's " +
        "hooves), `keep` leaves them in the node too. The part gets the node's animations. A " +
        "piece that moves on its own (a leg, a door, a hull section that falls) is drawn in " +
        "place with the rest and then lifted. remove: take away the part the node names.",
      inputSchema: {
        file: arg.file,
        version: arg.version,
        node: arg.node,
        op: z.enum(["add", "lift", "remove"]),
        name: z.string().optional().describe("add and lift: the new part's name"),
        x: z.number().int().optional(),
        y: z.number().int().optional(),
        w: z.number().int().min(1).optional(),
        h: z.number().int().min(1).optional(),
        use: z.string().optional().describe("add: draw this sprite from the folder instead"),
        chars: z.string().optional().describe("lift: only cells of these characters"),
        attach: z
          .string()
          .optional()
          .describe(
            "lift: and cells of these characters touching the piece, inside the rectangle — a leg's hooves",
          ),
        keep: z.boolean().optional().describe("lift: leave the cells in the node as well"),
      },
    },
    (a): Plan => {
      const path = parseNode(a.node);
      if (a.op === "remove") {
        if (!path.length || levelOf(path) !== null) fail("`node` names the part to remove");
        // Taking a part away is an edit to the tree above it: planned on the sprite.
        return {
          fn: (s, { label }) => {
            const parent = findNode(s, label, path.slice(0, -1));
            if (!parent.parts?.some((p) => p.name === path.at(-1))) {
              const names = (parent.parts ?? []).map((p) => p.name).join(", ") || "none";
              fail(
                `${where(label, path.slice(0, -1))} has no part ${path.at(-1)}; its parts: ${names}`,
              );
            }
            return removeParts(s, [path]);
          },
        };
      }
      if (levelOf(path) !== null) fail("a level has no parts — add them to the sprite");
      return {
        node: a.node,
        fn: (n, { label, notes }) => {
          if (a.op === "add") {
            const made = addPart(n, { name: a.name, x: a.x, y: a.y, w: a.w, h: a.h, use: a.use });
            notes.push(`the new part is ${[...path, made.name].join("/")}`);
            return made.node;
          }
          const x0 = need(a.x, "x");
          const y0 = need(a.y, "y");
          const w = need(a.w, "w");
          const h = need(a.h, "h");
          const only = a.chars ? new Set(a.chars) : null;
          const attach = a.attach ? new Set(a.attach) : null;
          // Each frame's own cells: a piece that moves is wherever it is in that
          // frame, and a cell it covers in another frame is not its to take.
          const pick = (_: number, rows: readonly string[]) => {
            const got = new Map<string, [number, number]>();
            for (let y = y0; y < y0 + h; y++) {
              for (let x = x0; x < x0 + w; x++) {
                const ch = rows[y]?.[x];
                if (ch && ch !== "." && (!only || only.has(ch))) got.set(`${x},${y}`, [x, y]);
              }
            }
            // And what hangs off it in the attached characters — a leg's hoof, a
            // haunch drawn in the body's colour — inside the rectangle, which
            // is what keeps "the body's colour" from meaning the whole body.
            const inRect = (x: number, y: number) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
            const queue = attach ? [...got.values()] : [];
            while (queue.length) {
              const [x, y] = queue.pop()!;
              for (let j = -1; j <= 1; j++) {
                for (let i = -1; i <= 1; i++) {
                  const key = `${x + i},${y + j}`;
                  if (got.has(key) || !inRect(x + i, y + j)) continue;
                  if (!attach!.has(rows[y + j]?.[x + i] ?? ".")) continue;
                  got.set(key, [x + i, y + j]);
                  queue.push([x + i, y + j]);
                }
              }
            }
            return got.values();
          };
          const made = liftPart(n, need(a.name, "name"), pick, { cut: !a.keep });
          if (!made)
            fail(`nothing is drawn there in ${label} to lift${only ? ` in ${a.chars}` : ""}`);
          notes.push(`the new part is ${[...path, made.name].join("/")}`);
          return made.node;
        },
      };
    },
  );
}
