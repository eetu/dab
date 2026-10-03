import { describe, expect, test } from "vitest";

import {
  addCycle,
  cellColour,
  cyclesOf,
  fromJson,
  refreshCycles,
  removeColour,
  removeCycle,
  renameChar,
  renameCycle,
  reverseCycle,
  setColour,
  type SpriteFile,
  toJson,
  validateSprite,
} from "../src";
import { sprite } from "./fixtures";

/** A strip of water: three blues, and a black that is not in the cycle. */
const water = (): SpriteFile =>
  sprite(["ABCK"], { A: "#000011", B: "#000022", C: "#000033", K: "#000000" });

/** What each cell of the strip paints as in a variant, in order. */
const look = (s: SpriteFile, variant: string) =>
  [...s.frames[0][0]].map((ch) => cellColour(s, ch, variant));

describe("colour cycling", () => {
  test("a cycle is one variant per phase, each naming only what it turns", () => {
    const s = addCycle(water(), "flow", ["A", "B", "C"]);
    expect(Object.keys(s.variants!)).toEqual(["flow 1", "flow 2", "flow 3"]);
    expect(look(s, "flow 1")).toEqual(["#000011", "#000022", "#000033", "#000000"]);
    // Each colour moves one place along; the black is left alone.
    expect(look(s, "flow 2")).toEqual(["#000033", "#000011", "#000022", "#000000"]);
    expect(look(s, "flow 3")).toEqual(["#000022", "#000033", "#000011", "#000000"]);
    expect(validateSprite(s)).toEqual([]);
  });

  test("reversed, the colours flow the other way", () => {
    const s = addCycle(water(), "ebb", ["A", "B", "C"], true);
    expect(look(s, "ebb 2")).toEqual(["#000022", "#000033", "#000011", "#000000"]);
  });

  test("it is read back off the variants, direction and all", () => {
    const s = addCycle(addCycle(water(), "flow", ["A", "B", "C"]), "ebb", ["A", "B"], true);
    expect(cyclesOf(s)).toEqual([
      {
        name: "flow",
        chars: ["A", "B", "C"],
        reverse: false,
        phases: ["flow 1", "flow 2", "flow 3"],
      },
      // Two phases turn the same both ways, so the forward reading wins.
      { name: "ebb", chars: ["A", "B"], reverse: false, phases: ["ebb 1", "ebb 2"] },
    ]);
    const back = fromJson(toJson(s));
    expect("sprite" in back && cyclesOf(back.sprite)).toEqual(cyclesOf(s));
  });

  test("hand-made colourways that happen to be numbered are not a cycle", () => {
    const s = {
      ...water(),
      variants: {
        "night 1": { A: "#111111", B: "#222222" },
        "night 2": { A: "#333333", B: "#444444" },
      },
    };
    expect(cyclesOf(s)).toEqual([]);
  });

  test("digits are put in the order a variant keeps, so it turns the way it was asked", () => {
    const s = addCycle(sprite(["A1"], { A: "#000011", 1: "#000022" }), "x", ["A", "1"]);
    expect(cyclesOf(s)[0].chars).toEqual(["1", "A"]);
    const three = sprite(["A1B"], { A: "#000011", 1: "#000022", B: "#000033" });
    expect(cyclesOf(addCycle(three, "y", ["1", "A", "B"]))).toHaveLength(1);
  });

  test("refused: one colour, a colour the palette lacks, a name already taken", () => {
    const s = water();
    expect(addCycle(s, "x", ["A"])).toBe(s);
    expect(addCycle(s, "x", ["A", "Z"])).toBe(s);
    expect(addCycle(s, "x", ["A", "."])).toBe(s);
    const taken = { ...s, variants: { "x 2": { A: "#ffffff" } } };
    expect(addCycle(taken, "x", ["A", "B"])).toBe(taken);
  });

  test("a palette edit is carried into every phase", () => {
    const s = setColour(addCycle(water(), "flow", ["A", "B", "C"]), "A", "#0000ff");
    const out = refreshCycles(s);
    expect(look(out, "flow 1")[0]).toBe("#0000ff");
    expect(look(out, "flow 2")[1]).toBe("#0000ff");
  });

  test("a dropped colour shrinks the cycle, and one of a single colour goes", () => {
    const s = addCycle(water(), "flow", ["A", "B", "C"]);
    const shrunk = refreshCycles(removeColour(s, "C"), cyclesOf(s));
    expect(cyclesOf(shrunk)).toEqual([
      { name: "flow", chars: ["A", "B"], reverse: false, phases: ["flow 1", "flow 2"] },
    ]);
    expect(validateSprite(shrunk)).toEqual([]);
    const gone = refreshCycles(removeColour(shrunk, "B"), cyclesOf(shrunk));
    expect(gone.variants).toBeUndefined();
  });

  test("a renamed colour is still in its cycle", () => {
    const s = renameChar(addCycle(water(), "flow", ["A", "B", "C"]), "B", "Q");
    expect(cyclesOf(s)[0].chars).toEqual(["A", "Q", "C"]);
  });

  test("removed, renamed and reversed as one thing, where it stands in the file", () => {
    const s = addCycle(water(), "flow", ["A", "B", "C"]);
    const both = { ...s, variants: { ...s.variants, night: { K: "#ffffff" } } };
    expect(Object.keys(removeCycle(both, "flow").variants!)).toEqual(["night"]);
    expect(Object.keys(renameCycle(both, "flow", "tide").variants!)).toEqual([
      "tide 1",
      "tide 2",
      "tide 3",
      "night",
    ]);
    const reversed = reverseCycle(both, "flow");
    expect(cyclesOf(reversed)[0].reverse).toBe(true);
    expect(Object.keys(reversed.variants!).at(-1)).toBe("night");
  });

  test("a rename that would land on an existing variant is refused", () => {
    const s = addCycle({ ...water(), variants: { "tide 2": { K: "#ffffff" } } }, "flow", [
      "A",
      "B",
    ]);
    expect(renameCycle(s, "flow", "tide")).toBe(s);
  });
});
