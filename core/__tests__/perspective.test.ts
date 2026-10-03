import { describe, expect, test } from "vitest";

import { framePoint, type Plane, planeGrid, planePoint, projectRows } from "../src";

/** A 4×4 brush with a diagonal, so a crisp stamp and a smooth one differ. */
const BRUSH = ["AB..", "ABB.", "ABBB", "AAAA"];
const PAL = { A: "#ff0000", B: "#0000ff" };

const facing = (over: Partial<Plane> = {}): Plane => ({
  tilt: 0,
  turn: 0,
  spin: 0,
  distance: 64,
  x: 16,
  y: 16,
  ...over,
});

describe("perspective", () => {
  test("a plane facing the eye puts the brush down exactly as it is", () => {
    const out = projectRows(BRUSH, PAL, facing(), { x: 10, y: 12 })!;
    expect(out).toMatchObject({ x: 8, y: 10, w: 4, h: 4, added: [] });
    expect(out.rows).toEqual(BRUSH);
  });

  test("leaning a plane back foreshortens the brush top to bottom, not across", () => {
    const flat = projectRows(BRUSH, PAL, facing({ tilt: 60, distance: 1e6 }), { x: 16, y: 16 })!;
    expect(flat.w).toBe(4);
    // cos 60° = ½: four rows of brush become two of frame.
    expect(flat.h).toBe(2);
  });

  test("on a floor, the brush is bigger where the floor is nearer", () => {
    const floor = facing({ tilt: 60, distance: 24 });
    const near = projectRows(BRUSH, PAL, floor, { x: 16, y: 22 })!;
    const far = projectRows(BRUSH, PAL, floor, { x: 16, y: 10 })!;
    expect(near.w).toBeGreaterThan(far.w);
    expect(near.h).toBeGreaterThan(far.h);
  });

  test("past the horizon there is no floor to stamp on", () => {
    const floor = facing({ tilt: 60, distance: 24 });
    // The horizon of a floor leaned 60° sits f·cot 60° ≈ 13.9 above the anchor.
    expect(planePoint(floor, 16, 16 - 15)).toBeNull();
    expect(projectRows(BRUSH, PAL, floor, { x: 16, y: 1 })).toBeNull();
  });

  test("crisp invents no colours; smoothing blends the edges it makes", () => {
    const plane = facing({ tilt: 35, turn: 25, spin: 10, distance: 40 });
    expect(projectRows(BRUSH, PAL, plane, { x: 16, y: 18 })!.added).toEqual([]);
    expect(
      projectRows(BRUSH, PAL, plane, { x: 16, y: 18 }, { samples: 3 })!.added.length,
    ).toBeGreaterThan(0);
  });

  test("crisp keeps a brush thinner than a pixel as a line, in its own colours", () => {
    // Five rows above the anchor this floor is under a pixel deep: one sample
    // per pixel finds nothing there, coverage finds the stripe.
    const out = projectRows(BRUSH, PAL, facing({ tilt: 60, distance: 24, x: 12, y: 8 }), {
      x: 12,
      y: 3,
    })!;
    expect(out.rows.join("").replace(/\./g, "").length).toBeGreaterThan(0);
    expect(out.added).toEqual([]);
  });

  test("frame to plane and back is the same point", () => {
    const plane = facing({ tilt: 40, turn: -30, spin: 15, distance: 50 });
    const [s, t] = planePoint(plane, 20, 21)!;
    const [x, y] = framePoint(plane, s, t)!;
    expect(x).toBeCloseTo(20, 9);
    expect(y).toBeCloseTo(21, 9);
  });

  test("a floor's grid converges toward the horizon", () => {
    const lines = planeGrid(facing({ tilt: 60, distance: 24 }), 4, 40);
    // The line straight through the anchor, running into the distance, stays
    // put; the ones beside it lean in toward it as they recede.
    expect(lines.some(([x0, , x1]) => x0 === 16 && x1 === 16)).toBe(true);
    // Four plane pixels right of it: x at its far (upper) end is nearer 16.
    const right = lines.find(([x0, y0, x1, y1]) => x0 > 16 && x1 > 16 && y0 !== y1)!;
    const [far, near] = right[1] < right[3] ? [right[0], right[2]] : [right[2], right[0]];
    expect(far).toBeLessThan(near);
  });
});
