import { describe, expect, test } from "vitest";

import { blankSprite, validateSprite } from "../src";
import { sprite } from "./fixtures";

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
    expect(errors.some((e) => e.includes("printable ASCII"))).toBe(true);
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
