// The dope sheet: a row per part under the strip.
//
// What the picture has to show: the strip is the whole walker at each frame,
// and under it each leg's row says which of its frames it shows there — the
// near leg stepping in strip order with no numbers, the far one on a shorter
// strip, numbered where it holds its last frame.
import type { SpriteFile } from "dab-core";
import { expect, onTestFinished, test } from "vitest";

import { editor, loadSprite } from "../src/lib/editor.svelte";
import { open, SPRITES } from "./rig";

/** A 10×8 block body on two legs; each leg's frames swing its foot. */
function walker(): SpriteFile {
  const legFrames = (n: number) =>
    Array.from({ length: n }, (_, f) => {
      const foot = f % 3;
      return ["L..", "L..", "L..", [".L.", "L..", "..L"][foot].replace(".", ".")];
    });
  return {
    name: "walker",
    w: 12,
    h: 9,
    palette: { B: "#8a5a34", L: "#4f321c" },
    animations: { walk: [0, 1, 2, 3, 4, 5] },
    frames: Array.from({ length: 6 }, (_, f) => [
      ".BBBBBBBBBB.",
      ".BBBBBBBBBB.",
      ".BBBBBBBBBB.",
      f % 2 ? ".BBBBBBBBBB." : "BBBBBBBBBBBB",
      "............",
      "............",
      "............",
      "............",
      "............",
    ]),
    parts: [
      { name: "leg_near", x: 2, y: 4, w: 3, h: 4, palette: { L: "#4f321c" }, frames: legFrames(6) },
      { name: "leg_far", x: 7, y: 4, w: 3, h: 4, palette: { L: "#2a1a10" }, frames: legFrames(4) },
    ],
  };
}

test("a walker with two legs as parts, a row each under the strip", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(() => rig.stop());
  loadSprite(walker(), "walker.json");
  editor.animation = "walk";
  editor.frame = 2;
  await rig.settle(200);
  const cels = rig.host.querySelectorAll(".timeline .cel");
  expect(cels.length, "two parts × six frames").toBe(12);
  // The far leg has four frames: columns 5 and 6 hold its last, and say so.
  const numbers = [...rig.host.querySelectorAll(".timeline .celno")].map((n) => n.textContent);
  expect(numbers).toEqual(["4", "4"]);
  await rig.shot("71-dope-sheet");
});
