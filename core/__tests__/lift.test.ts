// Making parts: blank, borrowed, or lifted out of what is drawn.
import { describe, expect, test } from "vitest";

import { addPart, freePartName, liftPart, type SpriteBody } from "../src";

const body = (): SpriteBody => ({
  w: 4,
  h: 2,
  palette: { A: "#ff0000", B: "#0000ff" },
  variants: { night: { A: "#110000" } },
  frames: [
    ["AABB", "AB.B"],
    ["BBAA", "B.BA"],
  ],
});

describe("making parts", () => {
  test("a new name never takes a sibling's", () => {
    const parts = [
      { name: "fin", x: 0, y: 0, use: "x" },
      { name: "fin2", x: 0, y: 0, use: "x" },
    ];
    expect(freePartName(parts, "fin")).toBe("fin3");
    expect(freePartName(parts, "nose")).toBe("nose");
  });

  test("a blank part copies the parent's palette; a borrowed one is a name", () => {
    const { node, name } = addPart(body(), { name: "lamp", x: 1, y: 0, w: 2, h: 1 });
    expect(name).toBe("lamp");
    expect(node.parts?.[0]).toEqual({
      name: "lamp",
      x: 1,
      y: 0,
      w: 2,
      h: 1,
      palette: { A: "#ff0000", B: "#0000ff" },
      frames: [[".."]],
    });
    const wheel = addPart(node, { use: "wheel", x: 2 });
    expect(wheel.node.parts?.[1]).toEqual({ name: "wheel", x: 2, y: 0, use: "wheel" });
  });

  test("lifting takes every frame, cropped to the cells, and a cut leaves them empty", () => {
    const cells = [
      [2, 0],
      [3, 0],
      [3, 1],
    ] as const;
    const kept = liftPart(body(), "tail", cells)!;
    expect(kept.node.frames).toEqual(body().frames);

    const { node, name } = liftPart(body(), "tail", cells, { cut: true })!;
    expect(name).toBe("tail");
    const part = node.parts![0] as SpriteBody & { x: number; y: number };
    expect([part.x, part.y, part.w, part.h]).toEqual([2, 0, 2, 2]);
    // (2,1) is inside the box but not a lifted cell, so the part has nothing there.
    expect(part.frames).toEqual([
      ["BB", ".B"],
      ["AA", ".A"],
    ]);
    expect(part.variants).toEqual({ night: { A: "#110000" } });
    expect(node.frames).toEqual([
      ["AA..", "AB.."],
      ["BB..", "B.B."],
    ]);
  });

  test("a piece that moves is lifted from where it is in each frame, and keeps the runs", () => {
    // A leg (L) in front of the body in frame 0 and behind it in frame 1. One
    // cell set for both frames would take body (B) along wherever the leg was
    // in the other frame.
    const walker: SpriteBody = {
      w: 4,
      h: 2,
      palette: { B: "#8a5a34", L: "#6a4426" },
      animations: { walk: [0, 1] },
      frames: [
        ["L...", "BBBB"],
        ["BBL.", "BBBB"],
      ],
    };
    const legs = (_: number, rows: readonly string[]) =>
      rows.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "L" ? [[x, y] as const] : [])));
    const { node } = liftPart(walker, "leg", legs, { cut: true })!;
    const leg = node.parts![0] as SpriteBody & { x: number; y: number };
    expect([leg.x, leg.y, leg.w, leg.h]).toEqual([0, 0, 3, 1]);
    expect(leg.frames).toEqual([["L.."], ["..L"]]);
    expect(leg.animations).toEqual({ walk: [0, 1] });
    // Only the leg's own cells left each frame: the body under frame 1's leg
    // position stays in frame 0, and the other way round.
    expect(node.frames).toEqual([
      ["....", "BBBB"],
      ["BB..", "BBBB"],
    ]);
  });

  test("nothing to lift is no part at all", () => {
    expect(liftPart(body(), "x", [[9, 9]])).toBeNull();
  });
});
