import { describe, expect, test } from "vitest";

import {
  addColour,
  alphaOf,
  blankSprite,
  cellColour,
  fromJson,
  movePaletteChar,
  removeColour,
  renameChar,
  toJson,
  unusedChars,
  validateSprite,
  withAlpha,
} from "../src";
import { sprite } from "./fixtures";

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

  test("a dropped or renamed colour leaves the variants valid", () => {
    const s = {
      ...sprite(["AB"], { A: "#000000", B: "#ffffff" }),
      variants: { night: { A: "#111111", B: "#222222" } },
    };
    const dropped = removeColour(s, "A");
    expect(dropped.variants).toEqual({ night: { B: "#222222" } });
    expect(validateSprite(dropped)).toEqual([]);
    const renamed = renameChar(s, "A", "Z");
    expect(renamed.variants).toEqual({ night: { Z: "#111111", B: "#222222" } });
    expect(validateSprite(renamed)).toEqual([]);
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
