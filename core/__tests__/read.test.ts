import { describe, expect, test } from "vitest";

import {
  assembly,
  flattenSprite,
  frameAt,
  layers,
  levelNamed,
  type Part,
  pixels,
  type SpriteBody,
  wordOf,
} from "../src/index.ts";
import { car, spoke } from "./fixtures.ts";

const resolve = (name: string) => (name === "spoke" ? spoke : null);

const body = (rows: string[], palette: Record<string, string>, parts?: Part[]): SpriteBody => ({
  w: rows[0].length,
  h: rows.length,
  palette,
  frames: [rows],
  ...(parts ? { parts } : {}),
});

/** A flattened frame as packed words, for comparing with an assembly. */
const wordsOf = (flat: ReturnType<typeof flattenSprite>, frame = 0) =>
  Uint32Array.from(flat.frames[frame].join(""), (ch) =>
    ch === "." ? 0 : wordOf(flat.palette[ch]),
  );

describe("layers", () => {
  test("walks behind parts, the grid, then the rest, each where it sits", () => {
    const got = layers(car(), 0, { resolve });
    expect(got.map((l) => [l.path.join("/"), l.x, l.y, l.flip])).toEqual([
      ["", 0, 0, undefined],
      ["doorL", 2, 1, undefined],
      ["wheel", 1, 3, undefined],
      ["wheelR", 4, 3, "h"],
    ]);
  });

  test("puts behind parts first, leaves out what is hidden or unresolved", () => {
    const seat = { name: "seat", x: 0, y: 0, behind: true, ...body(["S"], { S: "#00ff00" }) };
    const got = layers(
      body(["A"], { A: "#ff0000" }, [seat, { name: "x", x: 0, y: 0, use: "nope" }]),
    );
    expect(got.map((l) => l.path.join("/"))).toEqual(["seat", ""]);
    expect(layers(car(), 0, { resolve, hidden: (p) => p[0] === "doorL" }).length).toBe(3);
  });

  test("lets parts play along, each clamped to its own strip", () => {
    const at = (f: number) => layers(car(), f, { resolve }).map((l) => l.frame);
    expect(at(1)).toEqual([1, 1, 0, 0]);
    expect(at(5)).toEqual([1, 2, 0, 0]);
    const held = layers(car(), 1, { resolve, frameOf: (p) => (p[0] === "doorL" ? 2 : 0) });
    expect(held.map((l) => l.frame)).toEqual([0, 2, 0, 0]);
  });

  test("mirrors the whole subject: places mirrored, flips composed", () => {
    const got = layers(car(), 0, { resolve, flip: "h" });
    expect(got.map((l) => [l.path.join("/"), l.x, l.flip])).toEqual([
      ["", 0, "h"],
      ["doorL", 2, "h"],
      ["wheel", 3, "h"],
      ["wheelR", 0, undefined],
    ]);
  });
});

describe("frameAt", () => {
  test("loops an animation either way, holds and all", () => {
    const s = { ...body(["A"], { A: "#ff0000" }), animations: { walk: [0, 1, 1, 2] } };
    expect([0, 1, 2, 3, 4, 5.9, -1].map((n) => frameAt(s, "walk", n))).toEqual([
      0, 1, 1, 2, 0, 1, 2,
    ]);
  });

  test("refuses a name the sprite has not got", () => {
    expect(() => frameAt(car(), "drive", 0)).toThrow(/no animation "drive"/);
  });
});

describe("pixels", () => {
  test("packs each cell as the ImageData word, in a variant, mirrored", () => {
    const s = {
      ...body(["AB", ".A"], { A: "#ff0000", B: "#00ff0080" }),
      variants: { night: { A: "#000080" } },
    };
    expect([...pixels(s).px]).toEqual([0xff0000ff, 0x8000ff00, 0, 0xff0000ff]);
    expect([...pixels(s, 0, { variant: "night" }).px]).toEqual([
      0xff800000, 0x8000ff00, 0, 0xff800000,
    ]);
    expect([...pixels(s, 0, { flip: "h" }).px]).toEqual([0x8000ff00, 0xff0000ff, 0xff0000ff, 0]);
  });
});

describe("assembly", () => {
  test("lays a subject into one grid exactly as flatten does", () => {
    const flat = flattenSprite(car(), { resolve });
    for (const frame of [0, 1]) {
      const one = assembly(car(), frame, { resolve });
      expect([one.w, one.h]).toEqual([flat.w, flat.h]);
      expect([...one.px]).toEqual([...wordsOf(flat, frame)]);
    }
  });

  test("blends glass over paint as a canvas does", () => {
    const glass = { name: "g", x: 0, y: 0, ...body(["G"], { G: "#ffffff80" }) };
    const one = assembly(body(["A"], { A: "#000000" }, [glass]));
    expect([...one.px]).toEqual([
      ...wordsOf(flattenSprite(body(["A"], { A: "#000000" }, [glass]))),
    ]);
  });

  test("mirrored, is the mirror image of itself", () => {
    const plain = assembly(car(), 0, { resolve });
    const mirrored = assembly(car(), 0, { resolve, flip: "h" });
    const rows = (p: typeof plain) =>
      Array.from({ length: p.h }, (_, y) => [...p.px.slice(y * p.w, (y + 1) * p.w)]);
    expect(rows(mirrored)).toEqual(rows(plain).map((r) => [...r].reverse()));
  });

  test("says where its own grid sits when parts reach outside it", () => {
    const lamp = { name: "lamp", x: -1, y: -2, ...body(["L"], { L: "#ffff00" }) };
    const one = assembly(body(["AA"], { A: "#ff0000" }, [lamp]));
    expect([one.x, one.y, one.w, one.h]).toEqual([1, 2, 3, 3]);
    const mirrored = assembly(body(["AA"], { A: "#ff0000" }, [lamp]), 0, { flip: "h" });
    expect([mirrored.x, mirrored.y]).toEqual([0, 2]);
  });
});

describe("levelNamed", () => {
  test("is the sprite for none, the level by name, and refuses one it has not got", () => {
    const far = { name: "far", ...body(["A"], { A: "#ff0000" }) };
    const s = { ...car(), levels: [far] };
    expect(levelNamed(s, null)).toBe(s);
    expect(levelNamed(s, "far")).toBe(far);
    expect(() => levelNamed(s, "near")).toThrow(/no level/);
  });
});
