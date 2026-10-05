// Carrying one frame's edit to the others — the deer case: spots painted on
// the walk's first frame belong on every frame, but the deer bobs and strides,
// and in one frame a leg swings across where a spot would go.
import { describe, expect, test } from "vitest";

import { bestOffset, carryEdits, frameEdits } from "../src/index.ts";

/** The deer's walk, before the spots. Its body ends at x 7 with the shoulder. */
const WALK = [
  // 0: standing
  ["............", "..BBBBBB....", "..BBBBBB....", "..B....B....", "..L....L....", "............"],
  // 1: bobbed down a row
  ["............", "............", "..BBBBBB....", "..BBBBBB....", "..B....B....", "..L....L...."],
  // 2: a stride to the right
  ["............", "...BBBBBB...", "...BBBBBB...", "...B....B...", "...L....L...", "............"],
  // 3: standing, a front leg swung up across the flank
  ["............", "..BBBBBB....", "..BBBBLB....", "..B....B....", "..L....L....", "............"],
];

/** Frame 0 with two spots on the shoulder. */
const SPOTTED = [
  "............",
  "..BBBBWB....",
  "..BBBBWB....",
  "..B....B....",
  "..L....L....",
  "............",
];

describe("carrying an edit across frames", () => {
  const edits = frameEdits(WALK[0], SPOTTED);

  test("an edit is the cells that changed, and what each was", () => {
    expect(edits).toEqual([
      { x: 6, y: 1, was: "B", now: "W" },
      { x: 6, y: 2, was: "B", now: "W" },
    ]);
  });

  test("it finds where the shoulder went: down a row, then a step right", () => {
    expect(bestOffset(WALK[0], edits, WALK[1])).toMatchObject({ dx: 0, dy: 1 });
    expect(bestOffset(WALK[0], edits, WALK[2])).toMatchObject({ dx: 1, dy: 0 });
    // Where nothing moved, nothing moves — even with a leg in the way.
    expect(bestOffset(WALK[0], edits, WALK[3])).toMatchObject({ dx: 0, dy: 0 });
  });

  test("the spots land on the body wherever it went", () => {
    expect(carryEdits(WALK[1], edits, 0, 1).rows).toEqual([
      "............",
      "............",
      "..BBBBWB....",
      "..BBBBWB....",
      "..B....B....",
      "..L....L....",
    ]);
    expect(carryEdits(WALK[2], edits, 1, 0).rows[1]).toBe("...BBBBWB...");
  });

  test("a cell the frame has moved on from is reported, never painted over", () => {
    const carried = carryEdits(WALK[3], edits, 0, 0);
    expect(carried.placed).toEqual([{ x: 6, y: 1, was: "B", now: "W" }]);
    expect(carried.mismatched).toEqual([{ x: 6, y: 2, has: "L", want: "B" }]);
    expect(carried.rows[2]).toBe("..BBBBLB....");
    // Unless asked to: then the leg is painted over too.
    expect(carryEdits(WALK[3], edits, 0, 0, { match: false }).rows[2]).toBe("..BBBBWB....");
  });

  test("what falls off the grid is counted", () => {
    expect(carryEdits(WALK[0], edits, 9, 0).off).toBe(2);
  });
});
