// Slices: the sprite in depth, a node by path, kept in step with the frames, coloured by the
// sprite's palette, and written one row a line as the front is.
import { describe, expect, test } from "vitest";

import {
  addFrame,
  addSlice,
  depthOf,
  fromJson,
  nodeAt,
  removeColour,
  removeFrame,
  removeSlice,
  renameChar,
  renameSlice,
  resizeSprite,
  setColour,
  setPixels,
  slicePath,
  type SpriteFile,
  toJson,
  unusedChars,
  validateSprite,
  withNode,
} from "../src/index.ts";

/** A 3x2 box: blue in front, a green ring behind, red at the back, the ring named. */
const box = (): SpriteFile => ({
  name: "box",
  w: 3,
  h: 2,
  palette: { R: "#ff0000", G: "#00ff00", B: "#0000ff", Y: "#ffff00" },
  frames: [["BBB", "BBB"]],
  slices: [{ name: "ring", frames: [["G.G", "GGG"]] }, { frames: [["RRR", "RRR"]] }],
});

describe("slices", () => {
  test("a slice is a node: drawn on through its path, the sprite's size and colours its own", () => {
    const s = box();
    expect(depthOf(s)).toBe(3);
    const node = nodeAt(s, slicePath(1));
    expect(node?.frames).toEqual([["G.G", "GGG"]]);
    expect(node?.palette).toBe(s.palette);
    expect(node?.w).toBe(3);
    const drawn = withNode(s, slicePath(1), (n) => ({
      ...n,
      frames: [setPixels(n.frames[0], [[1, 0]], "Y")],
    }));
    expect(drawn.slices?.[0].frames).toEqual([["GYG", "GGG"]]);
    expect(drawn.frames).toEqual(s.frames);
    expect(validateSprite(drawn)).toEqual([]);
    expect(nodeAt(s, slicePath(3))).toBeNull();
  });

  test("a colour changed while a slice is in hand is the sprite's, and colours every slice", () => {
    const s = withNode(box(), slicePath(2), (n) => setColour(n, "R", "#800000"));
    expect(s.palette.R).toBe("#800000");
    expect(s.slices?.[1].frames).toEqual([["RRR", "RRR"]]);
  });

  test("frames come and go in every slice at once", () => {
    const two = addFrame(box());
    expect(two.slices?.map((l) => l.frames.length)).toEqual([2, 2]);
    expect(validateSprite(two)).toEqual([]);
    const one = removeFrame(two, 0);
    expect(one.slices?.map((l) => l.frames.length)).toEqual([1, 1]);
  });

  test("a colour dropped or renamed is dropped or renamed behind the front too", () => {
    const dropped = removeColour(box(), "R");
    expect(dropped.slices?.[1].frames).toEqual([["...", "..."]]);
    expect(validateSprite(dropped)).toEqual([]);
    const renamed = renameChar(box(), "G", "g");
    expect(renamed.slices?.[0].frames).toEqual([["g.g", "ggg"]]);
    expect(validateSprite(renamed)).toEqual([]);
    // A colour only a slice uses is in use.
    expect(unusedChars(box())).toEqual(["Y"]);
  });

  test("the slices grow and shrink with the grid", () => {
    const big = resizeSprite(box(), 4, 3);
    expect(big.slices?.[1].frames).toEqual([["RRR.", "RRR.", "...."]]);
    expect(validateSprite(big)).toEqual([]);
  });

  test("a new slice is a copy of the one in front of it; the last one gone, the key goes", () => {
    const s = addSlice(box(), 0);
    expect(s.slices?.map((l) => l.frames[0][0])).toEqual(["BBB", "G.G", "RRR"]);
    const back = addSlice(box());
    expect(back.slices?.[2].frames).toEqual([["RRR", "RRR"]]);
    expect(removeSlice(box(), 1).slices?.map((l) => l.frames[0][0])).toEqual(["RRR"]);
    const flat = removeSlice(removeSlice(box(), 1), 1);
    expect(flat.slices).toBeUndefined();
    expect(depthOf(flat)).toBe(1);
  });

  test("a name is a label: drawing, frames, colours and size all keep it", () => {
    const s = box();
    const kept = [
      withNode(s, slicePath(1), (n) => ({ ...n, frames: [setPixels(n.frames[0], [[1, 0]], "Y")] })),
      addFrame(s),
      renameChar(s, "G", "g"),
      resizeSprite(s, 4, 3),
    ];
    for (const t of kept) expect(t.slices?.[0].name).toBe("ring");
    const named = renameSlice(s, 2, " back ");
    expect(named.slices?.[1]).toEqual({ name: "back", frames: [["RRR", "RRR"]] });
    expect(validateSprite(named)).toEqual([]);
    expect(renameSlice(s, 1, "").slices?.[0]).toEqual({ frames: [["G.G", "GGG"]] });
    expect(renameSlice(s, 1, "ring")).toBe(s);
    expect(renameSlice(s, 3, "x")).toBe(s);
    expect(validateSprite({ ...s, slices: [{ name: " ", frames: s.frames }] })).not.toEqual([]);
  });

  test("written one row a line, right after the front's frames, and read back as it was", () => {
    const text = toJson(box());
    expect(text).toContain('"slices": [');
    expect(text.indexOf('"slices"')).toBeGreaterThan(text.indexOf('"frames"'));
    expect(text).toMatch(/\n\s+"G\.G",\n\s+"GGG"\n/);
    expect(text).toMatch(/\{\n\s+"name": "ring",\n\s+"frames": \[/);
    const back = fromJson(text);
    expect("sprite" in back && back.sprite.slices).toEqual(box().slices);
  });
});
