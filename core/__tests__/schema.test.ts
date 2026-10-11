// The schema against the validator, both ways — what keeps FORMAT.md honest as
// the format moves. Every file the validator accepts must satisfy the schema.
// Every file it rejects must fail the schema too, unless the rule it breaks is
// one JSON Schema cannot say — those are listed below, each with why, and must
// still PASS the schema: if a schema change starts catching one, it belongs in
// the other list.
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, test } from "vitest";

import car from "../../frontend/src/examples/car.json" with { type: "json" };
import wheel from "../../frontend/src/examples/wheel.json" with { type: "json" };
import schema from "../../schema/sprite.schema.json" with { type: "json" };
import {
  addCycle,
  addLevel,
  blankSprite,
  deriveLevel,
  type SpriteFile,
  validateSprite,
} from "../src/index.ts";
import { car as carFixture, spoke, sprite } from "./fixtures.ts";

const check = new Ajv2020({ allErrors: true }).compile(schema);

const base = (): SpriteFile => sprite(["AB.", ".BA"], { A: "#ff0000", B: "#00ff0080" });

/** Files the validator accepts. */
const accepted: [string, unknown][] = [
  ["a blank sprite", blankSprite("x", 4, 3)],
  ["colours with and without alpha", base()],
  [
    "variants and animations",
    { ...base(), variants: { night: { A: "#110000" } }, animations: { blink: [0, 0] } },
  ],
  ["a colour cycle", addCycle(base(), "flow", ["A", "B"])],
  ["materials", { ...base(), materials: { A: "rubber", B: "stainless-steel" } }],
  ["inline and `use` parts, flipped and behind", carFixture()],
  ["a borrowed sprite", spoke],
  ["levels", addLevel(base(), deriveLevel(base(), "far", 2, 1))],
  [
    "slices behind it",
    { ...base(), slices: [{ name: "tread", frames: base().frames }, { frames: base().frames }] },
  ],
  ["slices stacked down", { ...base(), stack: "down", slices: [{ frames: base().frames }] }],
  ["the example car, as shipped", car],
  ["the example wheel, as shipped", wheel],
];

/** Files the validator rejects for a rule the schema says too. */
const structural: [string, unknown][] = [
  ["no name", { ...base(), name: "" }],
  ["a zero width", { ...base(), w: 0 }],
  ["a two-character palette key", { ...base(), palette: { AB: "#ff0000" } }],
  ["a palette key outside ASCII", { ...base(), palette: { ...base().palette, é: "#ff0000" } }],
  ["a space as a palette key", { ...base(), palette: { ...base().palette, " ": "#ff0000" } }],
  ["a colour for `.`", { ...base(), palette: { ".": "#ff0000" } }],
  ["a colour that is not one", { ...base(), palette: { A: "red" } }],
  ["no frames", { ...base(), frames: [] }],
  ["an empty animation", { ...base(), animations: { idle: [] } }],
  ["a material that is not a lowercase word", { ...base(), materials: { A: "Rubber" } }],
  ["a material named for `.`", { ...base(), materials: { ".": "air" } }],
  [
    "a part with both pixels and a `use`",
    { ...carFixture(), parts: [{ ...spoke, name: "w", x: 0, y: 0, use: "spoke" }] },
  ],
  ["a part with neither", { ...base(), parts: [{ name: "w", x: 0, y: 0 }] }],
  [
    "a part that is not at a whole pixel",
    { ...base(), parts: [{ name: "w", x: 0.5, y: 0, use: "s" }] },
  ],
  [
    "a flip that is not one",
    { ...base(), parts: [{ name: "w", x: 0, y: 0, use: "s", flip: "x" }] },
  ],
  ["a part named like a level", { ...base(), parts: [{ name: "@far", x: 0, y: 0, use: "s" }] }],
  [
    "a flipped part with parts of its own",
    {
      ...base(),
      parts: [
        {
          ...spoke,
          name: "w",
          x: 0,
          y: 0,
          flip: "h",
          parts: [{ name: "c", x: 0, y: 0, use: "s" }],
        },
      ],
    },
  ],
  [
    "a level with its own animations",
    { ...base(), levels: [{ ...base(), animations: { a: [0] } }] },
  ],
  ["a level with parts", { ...base(), levels: [{ ...base(), name: "far", parts: [] }] }],
  ["a level whose name has a /", { ...base(), levels: [{ ...base(), name: "far/away" }] }],
  ["levels on a part", { ...base(), parts: [{ ...spoke, name: "w", x: 0, y: 0, levels: [] }] }],
  ["a part named like a slice", { ...base(), parts: [{ name: "#1", x: 0, y: 0, use: "s" }] }],
  [
    "a slice with a palette of its own",
    { ...base(), slices: [{ frames: base().frames, palette: {} }] },
  ],
  ["slices on a part", { ...base(), parts: [{ ...spoke, name: "w", x: 0, y: 0, slices: [] }] }],
  ["slices stacked up", { ...base(), stack: "up" }],
  [
    "a part saying how slices stack",
    { ...base(), parts: [{ ...spoke, name: "w", x: 0, y: 0, stack: "down" }] },
  ],
];

/** Files the validator rejects for a rule that relates one field to another,
 *  which JSON Schema cannot express. FORMAT.md lists the same ones. */
const validatorOnly: [string, unknown][] = [
  ["a row narrower than w", { ...base(), frames: [["AB", ".BA"]] }],
  ["fewer rows than h", { ...base(), frames: [["AB."]] }],
  ["a character with no colour", { ...base(), frames: [["AZ.", ".BA"]] }],
  [
    "a variant recolouring a character the palette lacks",
    { ...base(), variants: { n: { Z: "#000000" } } },
  ],
  ["an animation past the end of the strip", { ...base(), animations: { a: [0, 3] } }],
  ["a material for a character the palette lacks", { ...base(), materials: { Z: "steel" } }],
  [
    "two parts with one name",
    { ...carFixture(), parts: [carFixture().parts![1], carFixture().parts![1]] },
  ],
  [
    "a part that uses its own sprite",
    { ...base(), parts: [{ name: "w", x: 0, y: 0, use: "test" }] },
  ],
  [
    "parts nested five deep",
    (() => {
      const deep = (n: number): unknown[] =>
        n ? [{ ...spoke, name: `p${n}`, x: 0, y: 0, parts: deep(n - 1) }] : [];
      return { ...base(), parts: deep(5) };
    })(),
  ],
  [
    "a level out of step with the sprite",
    {
      ...base(),
      levels: [{ ...base(), name: "far", frames: [...base().frames, ...base().frames] }],
    },
  ],
  [
    "a slice out of step with the sprite",
    { ...base(), slices: [{ frames: [...base().frames, ...base().frames] }] },
  ],
  ["a slice row narrower than w", { ...base(), slices: [{ frames: [["AB", ".BA"]] }] }],
  ["a slice in a colour the sprite lacks", { ...base(), slices: [{ frames: [["AZ.", ".BA"]] }] }],
  [
    "two levels with one name",
    {
      ...base(),
      levels: [
        { ...base(), name: "far" },
        { ...base(), name: "far" },
      ],
    },
  ],
];

describe("the schema and the validator agree", () => {
  test.each(accepted)("accepted by both: %s", (_, file) => {
    expect(validateSprite(file)).toEqual([]);
    expect(check(file), JSON.stringify(check.errors)).toBe(true);
  });

  test.each(structural)("rejected by both: %s", (_, file) => {
    expect(validateSprite(file)).not.toEqual([]);
    expect(check(file)).toBe(false);
  });

  test.each(validatorOnly)("the validator's alone: %s", (_, file) => {
    expect(validateSprite(file)).not.toEqual([]);
    expect(check(file), JSON.stringify(check.errors)).toBe(true);
  });
});
