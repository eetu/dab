import { describe, expect, test } from "vitest";

import { cloneSprite, fromJson, type SpriteFile, toJson } from "../src";
import { car, spoke } from "./fixtures";

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

  test("a sprite with no parts and no animations is written exactly as it was before", () => {
    expect(toJson(spoke)).toBe(
      '{\n  "name": "spoke",\n  "w": 2,\n  "h": 2,\n' +
        '  "palette": {\n    "K": "#222222"\n  },\n' +
        '  "frames": [\n    [\n      "K.",\n      ".K"\n    ]\n  ]\n}\n',
    );
  });
});
