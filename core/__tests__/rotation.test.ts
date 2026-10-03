import { describe, expect, test } from "vitest";

import {
  alphaOf,
  COLOUR,
  colourGap,
  hingeRows,
  insertFrames,
  oklab,
  PALETTE_CHARS,
  rotateRows,
  SAME_COLOUR,
  validateSprite,
} from "../src";

describe("rotation", () => {
  // An oblong with a distinguishable corner, so a turn that went the wrong way
  // round shows up as a wrong answer rather than a symmetrical one.
  const pal = { A: "#ff0000", B: "#00ff00" };
  const rows = ["AAB", "A..", "A.."];

  test("a quarter turn is exact: the sides swap and no colour is invented", () => {
    const r = rotateRows(rows, pal, 90, { grow: true });
    // Clockwise: the left column becomes the top row.
    expect(r.rows).toEqual(["AAA", "..A", "..B"]);
    expect([r.w, r.h]).toEqual([3, 3]);
    expect(r.added).toEqual([]);
    expect(r.palette).toBe(pal);
  });

  test("four quarter turns come back to where they started", () => {
    let out = rows;
    for (let i = 0; i < 4; i++) out = rotateRows(out, pal, 90, { grow: true }).rows;
    expect(out).toEqual(rows);
  });

  test("a quarter turn of an oblong swaps the sides, or crops if told not to", () => {
    const wide = ["ABBB", "A..."];
    expect(rotateRows(wide, pal, 90, { grow: true })).toMatchObject({ w: 2, h: 4 });
    // Kept in its own bounds it cannot fit, so it crops the long side about the
    // centre — the same bargain resize makes.
    const kept = rotateRows(wide, pal, 90, { grow: false });
    expect([kept.w, kept.h]).toEqual([4, 2]);
    expect(kept.rows.every((r) => r.length === 4)).toBe(true);
  });

  test("half a turn needs no growing, and is its own inverse", () => {
    const half = rotateRows(rows, pal, 180, {});
    expect(half.rows).toEqual(["..A", "..A", "BAA"]);
    expect(rotateRows(half.rows, pal, 180, {}).rows).toEqual(rows);
  });

  test("no turn at all is the identity, whatever the smoothing", () => {
    const r = rotateRows(rows, pal, 0, { samples: 4 });
    expect(r.rows).toBe(rows);
    expect(r.added).toEqual([]);
  });

  test("nearest neighbour invents nothing: the palette comes back untouched", () => {
    const r = rotateRows(rows, pal, 37, { samples: 1, grow: true });
    expect(r.added).toEqual([]);
    expect(Object.keys(r.palette)).toEqual(["A", "B"]);
    // Every character written is one that was already in the palette.
    for (const row of r.rows) for (const ch of row) expect("AB.").toContain(ch);
  });

  test("smoothing invents blend colours, and says how many", () => {
    const r = rotateRows(rows, pal, 37, { samples: 4, grow: true });
    expect(r.added.length).toBeGreaterThan(0);
    for (const ch of r.added) expect(r.palette[ch]).toMatch(COLOUR);
  });

  test("an edge against nothing fades to transparent, not to a guessed colour", () => {
    // A solid block on its own: every blend at its edge is red at part opacity,
    // because there is nothing behind it to blend toward.
    const solid = ["AAAA", "AAAA", "AAAA", "AAAA"];
    const r = rotateRows(solid, { A: "#ff0000" }, 30, { samples: 4, grow: true });
    for (const ch of r.added) {
      const hex = r.palette[ch];
      expect(alphaOf(hex)).toBeLessThan(255);
      // Still red. A blend toward the editor's backdrop would have muddied it.
      expect(hex.slice(0, 7)).toBe("#ff0000");
    }
  });

  test("rotating the same source to a series of angles stops costing colours", () => {
    // The animation workflow, and the reason it is the one to use: the same
    // source at a new angle wants blends the earlier angles already paid for.
    let palette: Record<string, string> = { T: "#222228", H: "#c8c8d0", S: "#8a8a96" };
    const wheel = ["..TT..", ".TSST.", "TSHHST", "TSHHST", ".TSST.", "..TT.."];
    const cost: number[] = [];
    for (const deg of [15, 30, 45, 60, 75]) {
      const r = rotateRows(wheel, palette, deg, { samples: 3 });
      cost.push(r.added.length);
      palette = r.palette;
    }
    expect(cost[0]).toBeGreaterThan(0);
    // It converges: by the last angles it is asking for nothing new.
    expect(cost[cost.length - 1]).toBe(0);
    expect(cost[0]).toBeGreaterThan(cost[cost.length - 1]);
  });

  test("a palette with no room left reuses instead of failing", () => {
    // Fill every character, then ask for a smooth turn: there is nowhere to put
    // a blend, so it takes the nearest colour it has and still returns a sprite.
    const full: Record<string, string> = {};
    [...PALETTE_CHARS].forEach((ch, i) => (full[ch] = `#${i.toString(16).padStart(6, "0")}`));
    const art = ["AB", "BA"];
    const r = rotateRows(art, full, 33, { samples: 4, grow: true });
    expect(r.added).toEqual([]);
    expect(r.rows.length).toBe(r.h);
    for (const row of r.rows) for (const ch of row) expect(ch === "." || ch in full).toBe(true);
  });

  test("colours are compared by eye, not by RGB arithmetic", () => {
    // Equal RGB steps, wildly unequal to look at: green carries most of the
    // perceived brightness, blue almost none. An RGB metric would call these
    // two gaps the same and merge the wrong pair.
    const greens = colourGap(oklab("#008000"), oklab("#00a000"));
    const blues = colourGap(oklab("#000080"), oklab("#0000a0"));
    expect(greens).toBeGreaterThan(blues);
    // And opacity is its own axis: the same red, seen through and not.
    expect(colourGap(oklab("#ff0000"), oklab("#ff000080"))).toBeGreaterThan(SAME_COLOUR);
  });
});

describe("hinging", () => {
  // A door: four columns of paint with a marked leading edge, so a swing that
  // compressed the wrong way round shows as the wrong column surviving.
  const pal = { A: "#ff0000", B: "#00ff00" };
  const door = ["AAAB", "AAAB"];

  test("0° is the art itself, and costs nothing", () => {
    const r = hingeRows(door, pal, 0);
    expect(r.rows).toEqual(door);
    expect(r.added).toEqual([]);
    expect([r.w, r.h]).toEqual([4, 2]);
  });

  test("a swing narrows the art to cos θ about the hinge, keeping the grid", () => {
    // cos 60° = 0.5: four columns of door project onto two, hinged at the left.
    const r = hingeRows(door, pal, 60, { axis: "y", hinge: 0 });
    expect([r.w, r.h]).toEqual([4, 2]);
    for (const row of r.rows) {
      expect(row.length).toBe(4);
      // Painted where the door now is, transparent where it no longer reaches.
      expect(row.slice(0, 2)).not.toContain(".");
      expect(row.slice(2)).toBe("..");
    }
    // Nearest neighbour: every character is one the palette already had.
    expect(r.added).toEqual([]);
  });

  test("the hinge is what stays put — the far edge is what moves", () => {
    const right = hingeRows(door, pal, 60, { axis: "y", hinge: 4 });
    // Hinged at the right, the art collapses toward the right instead.
    for (const row of right.rows) {
      expect(row.slice(0, 2)).toBe("..");
      expect(row.slice(2)).not.toContain(".");
    }
    // And the leading edge — the B column at x=3 — is the one against the hinge.
    expect(right.rows[0][3]).toBe("B");
  });

  test("a horizontal hinge is the same thing on its side", () => {
    const lid = ["AA", "AA", "AA", "BB"];
    const r = hingeRows(lid, pal, 60, { axis: "x", hinge: 0 });
    expect([r.w, r.h]).toEqual([2, 4]);
    expect(r.rows.slice(2)).toEqual(["..", ".."]);
    expect(r.rows[0]).toBe("AA");
  });

  test("sign does not matter: toward and away project the same", () => {
    const a = hingeRows(door, pal, 55, { axis: "y", hinge: 0 });
    const b = hingeRows(door, pal, -55, { axis: "y", hinge: 0 });
    expect(a.rows).toEqual(b.rows);
  });

  test("edge-on is nothing at all, and past it stays edge-on", () => {
    for (const deg of [90, 120, 180]) {
      const r = hingeRows(door, pal, deg, { axis: "y", hinge: 0 });
      expect(r.rows).toEqual(["....", "...."]);
    }
  });

  test("smoothing blends the columns that land together, and says what it cost", () => {
    const crisp = hingeRows(door, pal, 45, { axis: "y", hinge: 0 });
    expect(crisp.added).toEqual([]);
    const smooth = hingeRows(door, pal, 45, { axis: "y", hinge: 0, samples: 4 });
    // The A/B boundary falls inside one destination column, so it wants a mix.
    expect(smooth.added.length).toBeGreaterThan(0);
    for (const ch of smooth.added) expect(smooth.palette[ch]).toMatch(COLOUR);
    // And a second swing against the grown palette reuses what the first paid for.
    const again = hingeRows(door, smooth.palette, 45, { axis: "y", hinge: 0, samples: 4 });
    expect(again.added).toEqual([]);
  });
});

describe("generated frames", () => {
  const door = {
    w: 2,
    h: 1,
    palette: { A: "#ff0000" },
    frames: [["AA"], [".A"], ["A."]],
    animations: { shut: [0], swing: [1, 2] },
  };

  test("a run of frames lands together, and the animations after it shift once", () => {
    const next = insertFrames(door, 0, [["A."], [".."]]);
    expect(next.frames.map((f) => f[0])).toEqual(["AA", "A.", "..", ".A", "A."]);
    // shut was frame 0 and stays; swing was 1,2 and is now 3,4.
    expect(next.animations).toEqual({ shut: [0], swing: [3, 4] });
    expect(validateSprite({ ...next, name: "door" })).toEqual([]);
  });

  test("inserting nothing is the sprite itself", () => {
    expect(insertFrames(door, 0, [])).toBe(door);
  });
});
