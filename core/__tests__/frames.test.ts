import { describe, expect, test } from "vitest";

import { addFrame, blankSprite, duplicateFrame, moveFrame, removeFrame, setPixel } from "../src";
import { sprite } from "./fixtures";

describe("frames", () => {
  const s = blankSprite("x", 2, 1);

  test("add, duplicate, move and remove", () => {
    let out = addFrame(s);
    expect(out.frames).toHaveLength(2);
    out = { ...out, frames: [["AA"], ["BB"]] };
    out = duplicateFrame(out, 0);
    expect(out.frames.map((f) => f[0])).toEqual(["AA", "AA", "BB"]);
    out = moveFrame(out, 2, 0);
    expect(out.frames.map((f) => f[0])).toEqual(["BB", "AA", "AA"]);
    out = removeFrame(out, 0);
    expect(out.frames.map((f) => f[0])).toEqual(["AA", "AA"]);
  });

  test("the last frame cannot be removed — a sprite with no frames is not a sprite", () => {
    expect(removeFrame(s, 0).frames).toHaveLength(1);
  });

  test("duplicating copies the rows rather than aliasing them", () => {
    const two = duplicateFrame(sprite(["AA"]), 0);
    const edited = { ...two, frames: [setPixel(two.frames[0], 0, 0, "."), two.frames[1]] };
    expect(edited.frames[1][0]).toBe("AA");
  });
});
