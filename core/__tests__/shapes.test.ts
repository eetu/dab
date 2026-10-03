// The sprite format and its edit operations. Every tool in the editor ends in
// one of these functions, so this is where a paint bug is caught — a canvas is
// the worst place to find out that flood fill leaks through a diagonal.
import { describe, expect, test } from "vitest";

import {
  charPoints,
  ellipsePoints,
  floodPoints,
  linePoints,
  rectPoints,
  shapePoints,
} from "../src";

describe("shapes", () => {
  test("a line is a Bresenham run with no gaps and no doubled pixels", () => {
    const pts = linePoints(0, 0, 5, 2);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([5, 2]);
    expect(new Set(pts.map((p) => p.join(","))).size).toBe(pts.length);
    for (let i = 1; i < pts.length; i++) {
      expect(Math.abs(pts[i][0] - pts[i - 1][0])).toBeLessThanOrEqual(1);
      expect(Math.abs(pts[i][1] - pts[i - 1][1])).toBeLessThanOrEqual(1);
    }
  });

  test("a line drawn backwards covers the same pixels", () => {
    const key = (p: [number, number][]) =>
      p
        .map((q) => q.join(","))
        .sort()
        .join(" ");
    expect(key(linePoints(1, 4, 7, 0))).toBe(key(linePoints(7, 0, 1, 4)));
  });

  test("an unfilled rectangle is its border only", () => {
    const pts = rectPoints(0, 0, 3, 2, false);
    expect(pts.length).toBe(4 * 2 + (3 - 1) * 2 - 2 * 2 + 2); // perimeter of 4x3
    expect(pts.some(([x, y]) => x === 1 && y === 1)).toBe(false);
    expect(rectPoints(0, 0, 3, 2, true).length).toBe(12);
  });

  test("a rectangle is the same whichever corner the drag started from", () => {
    const key = (p: [number, number][]) =>
      p
        .map((q) => q.join(","))
        .sort()
        .join(" ");
    expect(key(rectPoints(3, 2, 0, 0, true))).toBe(key(rectPoints(0, 0, 3, 2, true)));
  });

  test("a square drag gives a circle, and the outline is hollow", () => {
    const filled = ellipsePoints(0, 0, 8, 8, true);
    const ring = ellipsePoints(0, 0, 8, 8, false);
    expect(ring.length).toBeLessThan(filled.length);
    expect(ring.some(([x, y]) => x === 4 && y === 4)).toBe(false);
    expect(filled.some(([x, y]) => x === 4 && y === 4)).toBe(true);
    // Round, not square: the corners of the drag box are outside the disc.
    expect(filled.some(([x, y]) => x === 0 && y === 0)).toBe(false);
  });
});

describe("flood fill", () => {
  const frame = ["AA..", "A.B.", "..BB", "AAAA"];

  test("it takes the connected run and stops at a different colour", () => {
    const pts = floodPoints(frame, 0, 0);
    expect(pts).toContainEqual([0, 0]);
    expect(pts).toContainEqual([1, 0]);
    expect(pts).toContainEqual([0, 1]);
    expect(pts).not.toContainEqual([2, 2]); // B
    expect(pts).not.toContainEqual([0, 3]); // same colour, not connected
  });

  test("it is 4-connected: it does not leak through a diagonal", () => {
    // The `.` at (1,1) reaches (1,2) and (0,2) straight down and left. The `.`
    // at (2,0) is the same colour and touches the region only at a corner —
    // an 8-connected fill would take it, a 4-connected one must not.
    const pts = floodPoints(frame, 1, 1);
    expect(pts).toContainEqual([0, 2]);
    expect(pts).not.toContainEqual([2, 0]);
    expect(pts).not.toContainEqual([2, 2]); // B, a different colour
  });

  test("a seed outside the frame fills nothing", () => {
    expect(floodPoints(frame, -1, 0)).toEqual([]);
    expect(floodPoints(frame, 0, 99)).toEqual([]);
  });
});

describe("shape select", () => {
  // Two shapes: an A/B blob top-left and a lone A bottom-right. The colours are
  // deliberately shared across shapes, so a colour-based flood would join them.
  const frame = ["AB..", "BB..", "....", "...A"];

  test("it takes every connected pixel, whatever colour it is", () => {
    const pts = shapePoints(frame, 0, 0);
    expect(pts).toHaveLength(4);
    expect(pts).toContainEqual([1, 0]); // B, a different colour, same shape
    expect(pts).not.toContainEqual([3, 3]); // same colour, a different shape
  });

  test("empty space is not a shape: a transparent seed selects nothing", () => {
    expect(shapePoints(frame, 3, 0)).toEqual([]);
    expect(shapePoints(frame, 0, 2)).toEqual([]);
  });

  test("a seed outside the frame selects nothing", () => {
    expect(shapePoints(frame, -1, 0)).toEqual([]);
    expect(shapePoints(frame, 0, 99)).toEqual([]);
  });
});

describe("select by colour", () => {
  test("every cell of the character, connected or not, and nothing for empty", () => {
    const frame = ["AB.A", "..BA", "A..."];
    expect(charPoints(frame, "A")).toEqual([
      [0, 0],
      [3, 0],
      [3, 1],
      [0, 2],
    ]);
    expect(charPoints(frame, ".")).toEqual([]);
    expect(charPoints(frame, "Z")).toEqual([]);
  });
});
