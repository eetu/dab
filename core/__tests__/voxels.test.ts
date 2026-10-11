import { describe, expect, test } from "vitest";

import { materialAt, type SpriteBody, voxelAt, voxelsOf, wordOf } from "../src/index.ts";

/** A box three voxels deep: blue in front, a green ring behind it, red at the back; and a
 *  second frame where the front has gone yellow. */
const box: SpriteBody = {
  w: 3,
  h: 2,
  palette: { R: "#ff0000", G: "#00ff00", B: "#0000ff", Y: "#ffff00" },
  frames: [
    ["BBB", "BBB"],
    ["YYY", "YYY"],
  ],
  slices: [
    {
      frames: [
        ["G.G", "GGG"],
        ["G.G", "GGG"],
      ],
    },
    {
      frames: [
        ["RRR", "RRR"],
        ["RRR", "RRR"],
      ],
    },
  ],
};

describe("voxels", () => {
  test("its grid the front, its slices behind, a pixel a voxel", () => {
    const v = voxelsOf(box);
    expect([v.w, v.h, v.d]).toEqual([3, 2, 3]);
    expect(voxelAt(v, 0, 0, 2)).toBe(wordOf("#0000ff"));
    expect(voxelAt(v, 1, 0, 1)).toBe(0);
    expect(voxelAt(v, 1, 1, 1)).toBe(wordOf("#00ff00"));
    expect(voxelAt(v, 2, 1, 0)).toBe(wordOf("#ff0000"));
    expect(voxelAt(v, 3, 0, 0)).toBe(0);
    expect(voxelAt(v, 0, 0, -1)).toBe(0);
  });

  test("stacked down: its grid the top, its rows back to front, its slices floors below", () => {
    const v = voxelsOf({ ...box, stack: "down" });
    expect([v.w, v.h, v.d]).toEqual([3, 3, 2]);
    // The top floor is the grid: its first row at the back (z 0), its last at the front.
    expect(voxelAt(v, 0, 0, 0)).toBe(wordOf("#0000ff"));
    expect(voxelAt(v, 0, 0, 1)).toBe(wordOf("#0000ff"));
    // The ring a floor down, its gap at the back; red at the bottom.
    expect(voxelAt(v, 1, 1, 0)).toBe(0);
    expect(voxelAt(v, 1, 1, 1)).toBe(wordOf("#00ff00"));
    expect(voxelAt(v, 2, 2, 1)).toBe(wordOf("#ff0000"));
  });

  test("a frame is a moment: every slice at it", () => {
    const v = voxelsOf(box, { frame: 1 });
    expect(voxelAt(v, 0, 0, 2)).toBe(wordOf("#ffff00"));
    expect(voxelAt(v, 0, 0, 0)).toBe(wordOf("#ff0000"));
  });

  test("its front whole, parts in, and the slices in a variant's colours too", () => {
    const withPart: SpriteBody = {
      ...box,
      variants: { night: { R: "#800000" } },
      parts: [
        { name: "knob", x: 3, y: 0, w: 1, h: 1, palette: { K: "#ffffff" }, frames: [["K"], ["K"]] },
      ],
    };
    const v = voxelsOf(withPart, { variant: "night" });
    expect([v.w, v.d]).toEqual([4, 3]);
    expect(voxelAt(v, 3, 0, 2)).toBe(wordOf("#ffffff"));
    expect(voxelAt(v, 3, 0, 1)).toBe(0);
    expect(voxelAt(v, 0, 0, 0)).toBe(wordOf("#800000"));
  });

  test("each voxel made of what its character is: the front's parts, the slices, stacked down", () => {
    const made: SpriteBody = {
      ...box,
      materials: { B: "glass", R: "steel" },
      parts: [
        {
          ...{ name: "knob", x: 3, y: 0, w: 1, h: 1 },
          ...{ palette: { K: "#ffffff" }, materials: { K: "rubber" }, frames: [["K"], ["K"]] },
        },
      ],
    };
    const v = voxelsOf(made);
    expect(materialAt(v, 0, 0, 2)).toBe("glass");
    expect(materialAt(v, 3, 0, 2)).toBe("rubber");
    // The ring behind is green, which names nothing; the back is steel.
    expect(materialAt(v, 0, 0, 1)).toBeNull();
    expect(materialAt(v, 2, 1, 0)).toBe("steel");
    expect(materialAt(v, 1, 0, 1)).toBeNull();
    const down = voxelsOf({ ...made, parts: undefined, stack: "down" });
    expect(materialAt(down, 0, 0, 0)).toBe("glass");
    expect(materialAt(down, 2, 2, 1)).toBe("steel");
  });

  test("a sprite with no slices is one voxel deep", () => {
    const flat = voxelsOf({ ...box, slices: undefined });
    expect(flat.d).toBe(1);
  });
});
