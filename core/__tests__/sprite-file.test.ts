// The sprite format and its edit operations. Every tool in the editor ends in
// one of these functions, so this is where a paint bug is caught — a canvas is
// the worst place to find out that flood fill leaks through a diagonal.
import { describe, expect, test } from "vitest";

import {
  addColour,
  addFrame,
  alphaOf,
  blankSprite,
  cellColour,
  clipFrames,
  cloneSprite,
  COLOUR,
  colourGap,
  duplicateFrame,
  ellipsePoints,
  flipRows,
  floodPoints,
  fromJson,
  groupBox,
  linePoints,
  moveFrame,
  movePaletteChar,
  nodeAt,
  oklab,
  padSprite,
  PALETTE_CHARS,
  type Part,
  readStamp,
  rectPoints,
  removeColour,
  removeFrame,
  renameChar,
  resizeSprite,
  rotateRows,
  SAME_COLOUR,
  setPixel,
  setPixels,
  shapePoints,
  type SpriteFile,
  stampCells,
  toJson,
  unusedChars,
  validateSprite,
  withAlpha,
  withNode,
} from "../src";

const sprite = (
  rows: string[],
  palette: Record<string, string> = { A: "#ff0000" },
): SpriteFile => ({
  name: "test",
  w: rows[0].length,
  h: rows.length,
  palette,
  frames: [rows],
});

describe("validation", () => {
  test("a blank sprite is valid", () => {
    expect(validateSprite(blankSprite("x", 4, 3))).toEqual([]);
  });

  test("it names every way a file can be wrong, not just the first", () => {
    const errors = validateSprite({
      name: "",
      w: 3,
      h: 2,
      palette: { AB: "#fff", C: "nope" },
      frames: [["...", "..", "..."]],
    });
    expect(errors.some((e) => e.includes("name"))).toBe(true);
    expect(errors.some((e) => e.includes("one character"))).toBe(true);
    expect(errors.some((e) => e.includes("#rrggbb"))).toBe(true);
    expect(errors.some((e) => e.includes("rows"))).toBe(true);
  });

  test("a pixel with no colour behind it is an error", () => {
    expect(validateSprite(sprite(["A.Z"]))).toEqual(["frame 0 row 0 uses Z, which has no colour"]);
  });

  test("`.` is transparent and may not be given a colour", () => {
    expect(validateSprite(sprite(["..."], { ".": "#ffffff" })).join(" ")).toContain("transparent");
  });

  test("a character with no colour behind it is an error, whatever it is", () => {
    // Nothing is reserved any more: `N` is just a letter without a palette entry.
    expect(validateSprite(sprite(["NnN"], {})).length).toBeGreaterThan(0);
  });

  test("a colour may carry an alpha, and it is still a colour without one", () => {
    expect(validateSprite(sprite(["A."], { A: "#ff000080" }))).toEqual([]);
    expect(validateSprite(sprite(["A."], { A: "#ff0000" }))).toEqual([]);
    // Variants too — a colourway can change what you see through as well.
    expect(
      validateSprite({ ...sprite(["A."], { A: "#ff0000" }), variants: { g: { A: "#00ff0040" } } }),
    ).toEqual([]);
    // Still strict about everything else.
    expect(validateSprite(sprite(["A."], { A: "#ff00008" })).join(" ")).toContain("#rrggbbaa");
    expect(validateSprite(sprite(["A."], { A: "#ff0000801" })).join(" ")).toContain("#rrggbbaa");
  });

  test("a variant may only recolour characters the palette has", () => {
    const s = sprite(["A."], { A: "#ff0000" });
    expect(validateSprite({ ...s, variants: { cyan: { A: "#00ffff" } } })).toEqual([]);
    expect(validateSprite({ ...s, variants: { cyan: { Z: "#00ffff" } } }).join(" ")).toContain(
      "which the palette does not have",
    );
    expect(validateSprite({ ...s, variants: { cyan: { A: "nope" } } }).join(" ")).toContain(
      "#rrggbb",
    );
  });
});

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

describe("palette", () => {
  test("a new colour takes the next free character", () => {
    const out = addColour(blankSprite("x", 1, 1), "#123456");
    expect(Object.entries(out.palette)).toEqual([["A", "#123456"]]);
    expect(Object.keys(addColour(out, "#654321").palette)).toEqual(["A", "B"]);
  });

  test("dropping a colour erases the pixels that used it", () => {
    const out = removeColour(sprite(["AB.", "BA."], { A: "#000000", B: "#ffffff" }), "B");
    expect(out.frames[0]).toEqual(["A..", ".A."]);
    expect(out.palette).toEqual({ A: "#000000" });
  });

  test("renaming a character rewrites every pixel that used it", () => {
    const out = renameChar(sprite(["AA."], { A: "#000000" }), "A", "Z");
    expect(out.frames[0]).toEqual(["ZZ."]);
    expect(out.palette).toEqual({ Z: "#000000" });
  });

  test("renaming onto a taken character is refused rather than merging two colours", () => {
    const s = sprite(["AB"], { A: "#000000", B: "#ffffff" });
    expect(renameChar(s, "A", "B")).toBe(s);
  });

  test("a colour can be moved, and the order is what the file keeps", () => {
    const s = sprite(["ABC"], { A: "#000000", B: "#111111", C: "#222222" });
    expect(Object.keys(movePaletteChar(s, "C", 0).palette)).toEqual(["C", "A", "B"]);
    expect(Object.keys(movePaletteChar(s, "A", 2).palette)).toEqual(["B", "C", "A"]);
    // The colours travel with their characters, and the pixels are untouched.
    const moved = movePaletteChar(s, "C", 0);
    expect(moved.palette).toEqual({ C: "#222222", A: "#000000", B: "#111111" });
    expect(moved.frames).toEqual(s.frames);
    expect(toJson(moved).indexOf('"C"')).toBeLessThan(toJson(moved).indexOf('"A"'));
  });

  test("moving nowhere, or off the end, is the palette it already was", () => {
    const s = sprite(["AB"], { A: "#000000", B: "#111111" });
    expect(movePaletteChar(s, "A", 0)).toBe(s);
    expect(movePaletteChar(s, "A", 9)).toBe(s);
    expect(movePaletteChar(s, "Z", 0)).toBe(s);
  });

  test("unused entries are reported so they can be swept up", () => {
    expect(unusedChars(sprite(["A."], { A: "#000000", Q: "#ffffff" }))).toEqual(["Q"]);
  });
});

describe("alpha", () => {
  test("a colour with no alpha digits is opaque", () => {
    expect(alphaOf("#ff0000")).toBe(255);
    expect(alphaOf("#ff000000")).toBe(0);
    expect(alphaOf("#ff000080")).toBe(128);
  });

  test("opaque is written the short way, so nothing gains digits it does not need", () => {
    expect(withAlpha("#ff0000", 255)).toBe("#ff0000");
    expect(withAlpha("#ff000080", 255)).toBe("#ff0000");
    expect(withAlpha("#ff0000", 128)).toBe("#ff000080");
    expect(withAlpha("#ff0000", 0)).toBe("#ff000000");
    // Clamped, and whole: half a step of alpha is not a thing.
    expect(withAlpha("#ff0000", 999)).toBe("#ff0000");
    expect(withAlpha("#ff0000", -5)).toBe("#ff000000");
  });

  test("a sprite with glass in it round-trips", () => {
    const s = sprite(["AB"], { A: "#3a7ad0", B: "#e8e8f04d" });
    const back = fromJson(toJson(s));
    expect("sprite" in back && back.sprite).toEqual(s);
    expect(cellColour(s, "B")).toBe("#e8e8f04d");
  });
});

describe("serialisation", () => {
  const s: SpriteFile = {
    name: "sign",
    w: 3,
    h: 2,
    palette: { A: "#ff00ff" },
    variants: { cyan: { A: "#39f6ff" } },
    frames: [
      ["A.A", ".A."],
      ["...", "AAA"],
    ],
  };

  test("a round trip through JSON is the same sprite", () => {
    const back = fromJson(toJson(s));
    expect("sprite" in back && back.sprite).toEqual(s);
  });

  test("one row per line, so a frame reads as a picture in the diff", () => {
    expect(toJson(s)).toContain('      "A.A",\n      ".A."');
  });

  test("a bad file comes back as errors rather than throwing", () => {
    expect(fromJson("{oh no")).toHaveProperty("errors");
    expect(fromJson('{"name":"x"}')).toHaveProperty("errors");
  });

  test("cloning leaves the original alone", () => {
    const copy = cloneSprite(s);
    copy.frames[0][0] = "...";
    copy.palette.A = "#000000";
    expect(s.frames[0][0]).toBe("A.A");
    expect(s.palette.A).toBe("#ff00ff");
  });
});

// ---------- parts and clips ----------

/** A car-shaped fixture: a body, a door of its own, and a wheel it borrows. */
const car = (): SpriteFile => ({
  name: "car",
  w: 6,
  h: 4,
  palette: { B: "#c81e3c" },
  clips: { clean: [0], dented: [1] },
  frames: [
    ["BBBBBB", "B....B", "B....B", "BBBBBB"],
    ["BBBBB.", "B....B", "B....B", "BBBBBB"],
  ],
  parts: [
    {
      name: "doorL",
      x: 2,
      y: 1,
      w: 2,
      h: 2,
      palette: { D: "#101014" },
      clips: { shut: [0], swing: [0, 1, 2], open: [2] },
      frames: [
        ["DD", "DD"],
        ["D.", "D."],
        ["..", ".."],
      ],
    },
    { name: "wheel", x: 1, y: 3, use: "spoke" },
    { name: "wheelR", x: 4, y: 3, flip: "h", use: "spoke" },
  ],
});

const spoke: SpriteFile = {
  name: "spoke",
  w: 2,
  h: 2,
  palette: { K: "#222222" },
  frames: [["K.", ".K"]],
};

describe("parts", () => {
  test("a sprite with parts is valid, and a part is validated as a sprite", () => {
    expect(validateSprite(car())).toEqual([]);
  });

  test("a broken part says which part, so the message still points somewhere", () => {
    const s = car();
    (s.parts![0] as { frames: string[][] }).frames[0][0] = "DDD";
    expect(validateSprite(s)).toEqual(["part doorL: frame 0 row 0 is 3 wide, expected 2"]);
  });

  test("a part's clips are checked against that part's own strip", () => {
    const s = car();
    (s.parts![0] as { frames: string[][] }).frames.pop();
    expect(validateSprite(s)).toEqual([
      "part doorL: clip swing names frame 2, which the sprite has not got",
      "part doorL: clip open names frame 2, which the sprite has not got",
    ]);
  });

  test("a part needs either its own frames or a use, and never both", () => {
    const both = { ...car().parts![0], use: "spoke" } as Part;
    expect(validateSprite({ ...car(), parts: [both] })).toContain(
      "part doorL: must have either its own frames or a `use`, and not both",
    );
    const neither = { name: "ghost", x: 0, y: 0 } as unknown as Part;
    expect(validateSprite({ ...car(), parts: [neither] })).toContain(
      "part ghost: must have either its own frames or a `use`, and not both",
    );
  });

  test("offsets are whole pixels and may sit outside the parent", () => {
    const s = car();
    s.parts![1] = { ...s.parts![1], x: -3, y: 9 };
    expect(validateSprite(s)).toEqual([]);
    s.parts![1] = { ...s.parts![1], x: 1.5 };
    expect(validateSprite(s)).toContain("part wheel: x and y must be whole pixels");
  });

  test("two parts may not share a name — the name is what state is held under", () => {
    const s = car();
    s.parts!.push({ ...s.parts![1] });
    expect(validateSprite(s)).toContain("two parts are called wheel");
  });

  test("a part may not use the sprite it is part of", () => {
    const s = car();
    s.parts![1] = { ...s.parts![1], use: "car" };
    expect(validateSprite(s)).toContain("part wheel: uses the sprite it is part of");
  });

  test("a flipped part may not carry parts of its own", () => {
    const s = car();
    s.parts![0] = { ...(s.parts![0] as Part & { w: number }), flip: "h", parts: [] } as Part;
    expect(validateSprite(s)).toEqual([]); // an empty list is not carrying parts
    (s.parts![0] as { parts: Part[] }).parts = [{ ...spoke, name: "boss", x: 0, y: 0 }];
    expect(validateSprite(s)).toContain("part doorL: cannot be flipped and carry parts of its own");
  });

  test("nesting stops at four deep", () => {
    const leaf = (name: string, parts?: Part[]): Part => ({
      name,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      palette: {},
      frames: [["."]],
      ...(parts ? { parts } : {}),
    });
    const deep = (n: number): Part[] => (n === 0 ? [] : [leaf(`p${n}`, deep(n - 1))]);
    expect(validateSprite({ ...car(), parts: deep(4) })).toEqual([]);
    expect(validateSprite({ ...car(), parts: deep(5) }).join(" ")).toContain(
      "parts nest more than 4 deep",
    );
  });

  test("nodeAt walks names, and stops at a use — a reference has no body to enter", () => {
    const s = car();
    expect(nodeAt(s, [])).toBe(s);
    expect(nodeAt(s, ["doorL"])?.w).toBe(2);
    expect(nodeAt(s, ["wheel"])).toBeNull();
    expect(nodeAt(s, ["nope"])).toBeNull();
  });

  test("withNode edits one part and leaves its siblings identical", () => {
    const s = car();
    const next = withNode(s, ["doorL"], (n) => addColour(n, "#ffffff"));
    expect(nodeAt(next, ["doorL"])!.palette).toEqual({ D: "#101014", A: "#ffffff" });
    expect(next.palette).toEqual(s.palette);
    expect(next.parts![1]).toBe(s.parts![1]);
    // The placement survives an edit to the body it sits on.
    expect(next.parts![0]).toMatchObject({ name: "doorL", x: 2, y: 1 });
  });

  test("withNode on a path that names nothing returns the sprite unchanged", () => {
    const s = car();
    expect(withNode(s, ["gone"], (n) => addColour(n, "#ffffff"))).toBe(s);
    expect(withNode(s, ["wheel"], (n) => addColour(n, "#ffffff"))).toBe(s);
  });

  test("cloning copies parts rather than aliasing them", () => {
    const s = car();
    const copy = cloneSprite(s);
    (copy.parts![0] as { frames: string[][] }).frames[0][0] = "..";
    copy.clips!.clean[0] = 9;
    expect((s.parts![0] as { frames: string[][] }).frames[0][0]).toBe("DD");
    expect(s.clips!.clean).toEqual([0]);
  });

  test("groupBox is the union of the node and its parts, resolved ones included", () => {
    const s = car();
    const resolve = (name: string) => (name === "spoke" ? spoke : null);
    // Wheels sit at y 3 and are 2 tall, so the group runs one row past the body.
    expect(groupBox(s, resolve)).toEqual({ x: 0, y: 0, w: 6, h: 5 });
    s.parts![1] = { ...s.parts![1], x: -2, y: -1 };
    expect(groupBox(s, resolve)).toEqual({ x: -2, y: -1, w: 8, h: 6 });
    // A name the folder has not got contributes nothing rather than throwing.
    expect(groupBox(s)).toEqual({ x: 0, y: 0, w: 6, h: 4 });
  });

  test("a resize takes the parts with it, or every offset silently drifts", () => {
    const s = car();
    const bigger = resizeSprite(s, 10, 8, "center");
    expect(bigger.parts![0]).toMatchObject({ x: 4, y: 3 });
    // Top-left growth moves nothing, because the art did not move either.
    expect(resizeSprite(s, 10, 8).parts![0]).toMatchObject({ x: 2, y: 1 });
  });

  test("padSprite grows the near edge, which no resize anchor can", () => {
    const s = car();
    const padded = padSprite(s, 2, 0, 0, 0);
    expect(padded.w).toBe(8);
    expect(padded.frames[0][0]).toBe("..BBBBBB");
    expect(padded.parts![0]).toMatchObject({ x: 4, y: 1 });
    expect(padSprite(s, -1, 0, 0, 0).frames[0][0]).toBe("BBBBB");
  });

  test("flipRows mirrors, and mirroring twice is the original", () => {
    const rows = ["AB.", "..C"];
    expect(flipRows(rows, "h")).toEqual([".BA", "C.."]);
    expect(flipRows(rows, "v")).toEqual(["..C", "AB."]);
    expect(flipRows(rows, "hv")).toEqual(["C..", ".BA"]);
    expect(flipRows(flipRows(rows, "hv"), "hv")).toEqual(rows);
    expect(flipRows(rows)).toBe(rows);
  });
});

describe("clips", () => {
  test("a clip names frames the sprite has, and holds are repeats", () => {
    const s = car();
    s.clips = { hold: [0, 0, 1] };
    expect(validateSprite(s)).toEqual([]);
    s.clips = { gone: [2] };
    expect(validateSprite(s)).toContain("clip gone names frame 2, which the sprite has not got");
    s.clips = { empty: [] };
    expect(validateSprite(s)).toContain("clip empty is not a non-empty list of frame indices");
  });

  test("clipFrames hands back the run, and null for a name it has not got", () => {
    const door = nodeAt(car(), ["doorL"])!;
    expect(clipFrames(door, "swing")).toEqual([0, 1, 2]);
    expect(clipFrames(door, "slam")).toBeNull();
  });

  test("removing a frame drops it from every clip and shifts the rest", () => {
    const door = nodeAt(car(), ["doorL"])!;
    const next = removeFrame(door, 1);
    expect(next.clips).toEqual({ shut: [0], swing: [0, 1], open: [1] });
    expect(validateSprite({ ...next, name: "x" })).toEqual([]);
  });

  test("a clip that loses every frame is dropped rather than left empty", () => {
    const s = { ...spoke, frames: [["K."], ["..."]], clips: { only: [0] } };
    const next = removeFrame({ ...s, w: 2, h: 1, frames: [["K."], [".."]] }, 0);
    expect(next.clips).toBeUndefined();
  });

  test("adding a frame shifts the clips that come after it and joins none", () => {
    const door = nodeAt(car(), ["doorL"])!;
    expect(addFrame(door, 0).clips).toEqual({ shut: [0], swing: [0, 2, 3], open: [3] });
    expect(duplicateFrame(door, 0).clips).toEqual({ shut: [0], swing: [0, 2, 3], open: [3] });
  });

  test("moving a frame carries every clip's indices through the same permutation", () => {
    const door = nodeAt(car(), ["doorL"])!;
    // [0,1,2] → [1,2,0]: the run that was 0,1,2 is now 2,0,1.
    expect(moveFrame(door, 0, 2).clips).toEqual({ shut: [2], swing: [2, 0, 1], open: [1] });
    expect(moveFrame(door, 2, 0).clips).toEqual({ shut: [1], swing: [1, 2, 0], open: [0] });
  });

  test("a frame operation on a sprite with no clips is unchanged by all of this", () => {
    expect(addFrame(spoke, 0).clips).toBeUndefined();
  });
});

describe("serialising an assembly", () => {
  test("a round trip through JSON is the same sprite, parts and all", () => {
    const s = car();
    const back = fromJson(toJson(s));
    expect("sprite" in back && back.sprite).toEqual(s);
  });

  test("frame rows stay one per line inside a part, at its own depth", () => {
    expect(toJson(car())).toContain('        "DD",\n        "DD"');
  });

  test("a reference is one line, so a moved wheel is one changed line", () => {
    expect(toJson(car())).toContain('{ "name": "wheel", "x": 1, "y": 3, "use": "spoke" }');
    expect(toJson(car())).toContain('"flip": "h", "use": "spoke"');
  });

  test("a sprite with no parts and no clips is written exactly as it was before", () => {
    expect(toJson(spoke)).toBe(
      '{\n  "name": "spoke",\n  "w": 2,\n  "h": 2,\n' +
        '  "palette": {\n    "K": "#222222"\n  },\n' +
        '  "frames": [\n    [\n      "K.",\n      ".K"\n    ]\n  ]\n}\n',
    );
  });
});
