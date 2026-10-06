import { describe, expect, test } from "vitest";

import { readStamp, setPixels, stampCells } from "../src/index.ts";

describe("blocks", () => {
  const frame = ["AB..", ".C..", "....", "...."];

  test("a stamp keeps the shape and offsets it from its own corner", () => {
    const s = readStamp(frame, [
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    expect([s.w, s.h]).toEqual([2, 2]);
    expect(s.cells).toEqual([
      { dx: 0, dy: 0, ch: "A" },
      { dx: 1, dy: 0, ch: "B" },
      { dx: 1, dy: 1, ch: "C" },
    ]);
  });

  test("putting one down moves the pixels, and the hole travels with them", () => {
    // The 2×2 box around the art, including its transparent corner.
    const pts: [number, number][] = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    const s = readStamp(frame, pts);
    const lifted = setPixels(frame, pts, ".");
    expect(stampCells(lifted, s, 2, 2)).toEqual(["....", "....", "..AB", "...C"]);
  });

  test("a stamp covers, and its gaps show through", () => {
    // A box round the art takes the empty corner with it. Put that down on a
    // full row and the corner must not rub a hole in what it lands on — that is
    // what makes a paste safe to shove into place over other art.
    const s = readStamp(frame, [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]);
    const onto = ["....", "....", "DDDD", "DDDD"];
    expect(stampCells(onto, s, 0, 2)).toEqual(["....", "....", "ABDD", "DCDD"]);
  });

  test("a block dragged off the edge loses what left, and does not wrap", () => {
    const s = readStamp(frame, [
      [0, 0],
      [1, 0],
    ]);
    // The A lands in the last column; the B that followed it is simply gone.
    expect(stampCells(frame, s, 3, 0)).toEqual(["AB.A", ".C..", "....", "...."]);
  });

  test("an empty selection is an empty stamp, and puts nothing down", () => {
    const s = readStamp(frame, []);
    expect(s).toEqual({ w: 0, h: 0, cells: [] });
    expect(stampCells(frame, s, 0, 0)).toBe(frame);
  });
});
