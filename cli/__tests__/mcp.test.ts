import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { fromJson, type SpriteFile, toJson } from "dab-core";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createServer } from "../src/server";
import { Store } from "../src/store";
import { ruled } from "../src/text";

let root: string;
let client: Client;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "dab-mcp-"));
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0" });
  await Promise.all([createServer(await Store.open(root)).connect(a), client.connect(b)]);
});

afterEach(async () => {
  await client.close();
  await rm(root, { recursive: true, force: true });
});

type Content = { type: string; text?: string; data?: string };

async function call(name: string, args: Record<string, unknown> = {}) {
  const r = await client.callTool({ name, arguments: args });
  const content = r.content as Content[];
  const text = content.flatMap((c) => (c.type === "text" ? [c.text!] : [])).join("\n");
  return { text, error: !!r.isError, content };
}

/** The version a result ends on: a read's, or a write's new one. */
const versionIn = (text: string) => [...text.matchAll(/\b([0-9a-f]{12})\b/g)].at(-1)![1];

const put = (name: string, s: SpriteFile) => writeFile(path.join(root, `${name}.json`), toJson(s));
const disk = async (name: string) => {
  const read = fromJson(await readFile(path.join(root, `${name}.json`), "utf8"));
  if ("errors" in read) throw new Error(read.errors.join("; "));
  return read.sprite;
};

const PAL = { A: "#ff0000", B: "#0000ff" };

describe("the dab MCP server", () => {
  test("a sprite made, drawn on and read back is the file on disk, written by core", async () => {
    const made = await call("create_sprite", { file: "sign", w: 4, h: 3, palette: PAL });
    expect(made.error).toBe(false);
    let v = versionIn(made.text);

    const drawn = await call("put_rows", {
      file: "sign",
      version: v,
      frame: 0,
      x: 1,
      y: 1,
      rows: ["AB", "BA"],
    });
    expect(drawn.text).toContain("4 on frame 0");
    v = versionIn(drawn.text);
    const filled = await call("draw", {
      file: "sign",
      version: v,
      frame: 0,
      shape: "line",
      x0: 0,
      y0: 0,
      x1: 3,
      y1: 0,
      ch: "A",
    });
    v = versionIn(filled.text);

    expect((await disk("sign")).frames[0]).toEqual(["AAAA", ".AB.", ".BA."]);
    // One frame row per line — the writer's, not JSON.stringify's.
    expect(await readFile(path.join(root, "sign.json"), "utf8")).toContain('      "AAAA",\n');

    const read = await call("read_frame", { file: "sign", frames: [0], plain: true });
    expect(read.text).toContain(`version ${v}`);
    expect(read.text).toContain("AAAA\n.AB.\n.BA.");
  });

  test("a write against a version someone has since saved over is refused, and changes nothing", async () => {
    await put("sign", { name: "sign", w: 2, h: 1, palette: PAL, frames: [["AB"]] });
    const v = versionIn((await call("read_sprite", { file: "sign" })).text);

    // The person saves in the editor.
    await put("sign", { name: "sign", w: 2, h: 1, palette: PAL, frames: [["BB"]] });
    const stale = await call("set_pixels", {
      file: "sign",
      version: v,
      frame: 0,
      pixels: [[0, 0, "A"]],
    });
    expect(stale.error).toBe(true);
    expect(stale.text).toMatch(/changed on disk since version \w+ .*Read it again/s);
    expect((await disk("sign")).frames[0]).toEqual(["BB"]);

    const fresh = versionIn((await call("read_sprite", { file: "sign" })).text);
    const ok = await call("set_pixels", {
      file: "sign",
      version: fresh,
      frame: 0,
      pixels: [[0, 0, "A"]],
    });
    expect(ok.error).toBe(false);
    expect((await disk("sign")).frames[0]).toEqual(["AB"]);
  });

  test("nothing outside the folder can be named", async () => {
    const out = await call("read_sprite", { file: "../elsewhere" });
    expect(out.error).toBe(true);
    expect(out.text).toContain("outside the sprite folder");
  });

  test("refusals say where and what to do", async () => {
    await put("sign", { name: "sign", w: 2, h: 1, palette: PAL, frames: [["AB"]] });
    const v = versionIn((await call("read_sprite", { file: "sign" })).text);
    const colour = await call("set_pixels", {
      file: "sign",
      version: v,
      frame: 0,
      pixels: [[0, 0, "Z"]],
    });
    expect(colour.text).toContain(
      `"Z" is not in sign.json's palette (AB, and . for nothing); add it with the palette tool first`,
    );
    const frame = await call("set_pixels", {
      file: "sign",
      version: v,
      frame: 3,
      pixels: [[0, 0, "A"]],
    });
    expect(frame.text).toContain("frame 3 is out of range: sign.json has 1 frame, 0–0");
    const part = await call("read_frame", { file: "sign", node: "door", frames: [0] });
    expect(part.text).toContain("sign.json has no part door; it has none");

    // Some cells off the grid: the rest land and the miss is reported.
    const edge = await call("set_pixels", {
      file: "sign",
      version: v,
      frame: 0,
      pixels: [
        [1, 0, "A"],
        [5, 0, "A"],
      ],
    });
    expect(edge.text).toContain("1 cell was off the 2×1 (x 0–1, y 0–0) grid and skipped: (5,0)");
    expect((await disk("sign")).frames[0]).toEqual(["AA"]);
  });

  test("a part is addressed by path; a borrowed one points at its own file", async () => {
    await put("wheel", { name: "wheel", w: 1, h: 1, palette: PAL, frames: [["B"]] });
    await put("car", {
      name: "car",
      w: 4,
      h: 2,
      palette: PAL,
      frames: [["AAAA", "...."]],
      parts: [
        { name: "door", x: 1, y: 0, w: 2, h: 1, palette: PAL, frames: [[".."]] },
        { name: "wheel", x: 0, y: 1, use: "wheel" },
      ],
    });
    const outline = await call("read_sprite", { file: "car" });
    expect(outline.text).toContain("door at 1,0: 2×1, 1 frame");
    expect(outline.text).toContain("wheel at 0,1: borrows wheel.json, 1×1");
    const v = versionIn(outline.text);

    const door = await call("put_rows", {
      file: "car",
      version: v,
      node: "door",
      frame: 0,
      rows: ["BB"],
    });
    expect(door.text).toContain("car.json › door");
    const sprite = await disk("car");
    expect(sprite.frames[0]).toEqual(["AAAA", "...."]);
    expect(sprite.parts?.[0]).toMatchObject({ frames: [["BB"]] });

    const wheel = await call("read_frame", { file: "car", node: "wheel", frames: [0] });
    expect(wheel.text).toContain("car.json › wheel borrows wheel.json — edit that file instead");

    const moved = await call("move_part", {
      file: "car",
      version: versionIn(door.text),
      part: "wheel",
      x: 3,
    });
    expect(moved.text).toContain("wheel moved to 3,1");
  });

  test("a frame edit named on a level is the sprite's, and the levels stay in step", async () => {
    await put("deer", { name: "deer", w: 2, h: 2, palette: PAL, frames: [["AB", "BA"]] });
    let v = versionIn((await call("read_sprite", { file: "deer" })).text);
    const level = await call("level", {
      file: "deer",
      version: v,
      op: "derive",
      name: "far",
      w: 1,
      h: 1,
    });
    expect(level.text).toContain("levels: @far 1×1");
    v = versionIn(level.text);
    const added = await call("frames", {
      file: "deer",
      version: v,
      node: "@far",
      op: "duplicate",
      index: 0,
    });
    expect(added.text).toContain("this went to the sprite");
    const s = await disk("deer");
    expect(s.frames).toHaveLength(2);
    expect(s.levels?.[0].frames).toHaveLength(2);
  });

  test("palette edits follow through variants and report the key they used", async () => {
    await put("sign", { name: "sign", w: 2, h: 1, palette: PAL, frames: [["AB"]] });
    let v = versionIn((await call("read_sprite", { file: "sign" })).text);
    const added = await call("palette", { file: "sign", version: v, op: "add", hex: "#00ff00" });
    expect(added.text).toContain("the new colour's key is C");
    v = versionIn(added.text);
    const night = await call("palette", {
      file: "sign",
      version: v,
      op: "set",
      ch: "A",
      hex: "#110000",
      variant: "night",
    });
    v = versionIn(night.text);
    const gone = await call("palette", { file: "sign", version: v, op: "remove", ch: "A" });
    expect(gone.text).toContain("palette lost A");
    const s = await disk("sign");
    expect(s.frames[0]).toEqual([".B"]);
    expect(s.variants).toEqual({ night: {} });
  });

  test("render is a PNG about 512 px; a lineup stands sprites on one baseline at one scale", async () => {
    await put("tall", {
      name: "tall",
      w: 2,
      h: 4,
      palette: PAL,
      frames: [
        ["AA", "AA", "AA", "AA"],
        ["BB", "BB", "BB", "BB"],
      ],
    });
    await put("short", { name: "short", w: 2, h: 2, palette: PAL, frames: [["BB", "BB"]] });
    const size = (data: string) => {
      const png = Buffer.from(data, "base64");
      return [png.readUInt32BE(16), png.readUInt32BE(20)];
    };

    const one = await call("render", { file: "tall" });
    expect(one.content[0].type).toBe("image");
    expect(size(one.content[0].data!)).toEqual([256, 512]);
    expect(one.text).toContain("at ×128");

    const strip = await call("render", { file: "tall", frames: [0, 1] });
    expect(strip.text).toContain("2 across");
    // Two 2×4 cells and a gutter: 5×4 cells, ×102.
    expect(size(strip.content[0].data!)).toEqual([510, 408]);

    const lineup = await call("render_lineup", { sprites: [{ file: "tall" }, { file: "short" }] });
    expect(lineup.text).toContain("1. tall.json frame 0: 2×4, x 0–1");
    expect(lineup.text).toContain("2. short.json frame 0: 2×2, x 4–5");
    expect(size(lineup.content[0].data!)).toEqual([510, 340]);
  });

  test("a ruled grid labels each ten and numbers each row", () => {
    const row = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh";
    expect(ruled([row.slice(8), row.slice(8)], 8, 9)).toBe(
      [
        "    8  10         20         30",
        "    89 0123456789 0123456789 0123",
        " 9  IJ KLMNOPQRST UVWXYZabcd efgh",
        "10  IJ KLMNOPQRST UVWXYZabcd efgh",
      ].join("\n"),
    );
  });
});
