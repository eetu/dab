// A laptop-height window: the whole app fits, and the columns do not scroll
// with the example open. The 1200×800 default never caught this — the left
// rail's diet (part rows, panel gaps, the inspector's one-line note) is what
// keeps these numbers true.
import { expect, onTestFinished, test } from "vitest";
import { page } from "vitest/browser";

import { loadSprite, sheet } from "../src/lib/editor.svelte";
import { EXAMPLE_SHEET, exampleCar } from "../src/lib/examples";
import { open, SPRITES } from "./rig";

test("a laptop window fits without scrollbars", async () => {
  await page.viewport(1280, 690);
  const rig = await open(SPRITES.car());
  onTestFinished(rig.stop);
  sheet.byName = { ...EXAMPLE_SHEET };
  loadSprite(exampleCar(), null);
  await rig.settle(250);
  await rig.shot("16-laptop-690");
  // The page itself never scrolls…
  expect(document.documentElement.scrollHeight).toBe(innerHeight);
  // …and with the six-row example, neither do the rails.
  for (const aside of document.querySelectorAll("aside")) {
    expect(aside.scrollHeight).toBeLessThanOrEqual(aside.clientHeight);
  }
});
