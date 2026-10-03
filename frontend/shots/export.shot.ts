// Export: the dialog that hands a sprite to something that is not dab.
//
// What the picture has to show: what will be written — its name, its size,
// for a GIF how many frames at what rate — before the press that writes it,
// and the one thing a GIF cannot keep, said where it applies.
import { expect, onTestFinished, test } from "vitest";

import { editor, loadSprite, sheet } from "../src/lib/editor.svelte";
import { EXAMPLE_SHEET, exampleCar } from "../src/lib/examples";
import { open, SPRITES } from "./rig";

test("exporting the car's lights as a GIF", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(() => rig.stop());
  sheet.byName = { ...EXAMPLE_SHEET };
  loadSprite(exampleCar(), null);
  await rig.settle(150);
  const button = [...rig.host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Export…"),
  ) as HTMLButtonElement;
  button.click();
  await rig.settle();
  const gif = [...document.querySelectorAll("[role=dialog] button")].find(
    (b) => b.textContent?.trim() === "GIF",
  ) as HTMLButtonElement;
  gif.click();
  await rig.settle();
  expect(document.querySelector("[role=dialog]")?.textContent).toContain(`${editor.sprite.name}`);
  await rig.shot("80-export-gif");
});
