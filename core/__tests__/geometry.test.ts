import { describe, expect, test } from "vitest";

import { duplicateFrame, resizeSprite, setPixel, setPixels } from "../src/index.ts";
import { sprite } from "./fixtures.ts";

describe("pixels", () => {
  test("setPixel replaces one cell and leaves the row's length alone", () => {
    const frame = ["....", "...."];
    const out = setPixel(frame, 2, 1, "A");
    expect(out[1]).toBe("..A.");
    expect(out[0]).toBe("....");
    expect(out[1].length).toBe(4);
  });

  test("writing off the edge is a no-op, not a ragged row", () => {
    const frame = ["...."];
    expect(setPixel(frame, 9, 0, "A")).toBe(frame);
    expect(setPixel(frame, 0, -1, "A")).toBe(frame);
  });

  test("an edit that changes nothing returns the same array", () => {
    // The editor's undo stack pushes on identity, so a no-op stroke must not
    // fill history with copies of the same frame.
    const frame = ["A..."];
    expect(setPixel(frame, 0, 0, "A")).toBe(frame);
    expect(setPixels(frame, [[0, 0]], "A")).toBe(frame);
  });

  test("setPixels writes a whole stroke at once", () => {
    const out = setPixels(
      ["....", "...."],
      [
        [0, 0],
        [1, 1],
        [9, 9],
      ],
      "A",
    );
    expect(out).toEqual(["A...", ".A.."]);
  });
});

describe("resize", () => {
  const s = sprite(["AB", "CD"], { A: "#000000", B: "#111111", C: "#222222", D: "#333333" });

  test("growing pads with transparent and keeps the art where it was", () => {
    const out = resizeSprite(s, 4, 3);
    expect(out.frames[0]).toEqual(["AB..", "CD..", "...."]);
    expect(out.w).toBe(4);
    expect(out.h).toBe(3);
  });

  test("shrinking crops rather than scaling — pixel art has no resample", () => {
    expect(resizeSprite(s, 1, 1).frames[0]).toEqual(["A"]);
  });

  test("centred growth puts the old art in the middle", () => {
    expect(resizeSprite(s, 4, 4, "center").frames[0]).toEqual(["....", ".AB.", ".CD.", "...."]);
  });

  test("every frame resizes, not just the first", () => {
    const two = duplicateFrame(s, 0);
    const out = resizeSprite(two, 3, 2);
    expect(out.frames).toHaveLength(2);
    for (const f of out.frames) expect(f.every((r) => r.length === 3)).toBe(true);
  });
});
