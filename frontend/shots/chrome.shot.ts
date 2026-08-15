// The app's own chrome: the help, and the light theme.
import { expect, onTestFinished, test } from "vitest";

import { editor, loadSprite, sheet } from "../src/lib/editor.svelte";
import { EXAMPLE_SHEET, exampleCar } from "../src/lib/examples";
import { setTheme } from "../src/lib/theme.svelte";
import { open, SPRITES } from "./rig";

test("the help dialog, as a first visitor meets it", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(rig.stop);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
  await rig.settle();
  expect(document.querySelector("[role=dialog]")).toBeTruthy();
  await rig.shot("10-help");
  document.activeElement?.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
});

test("the light theme, tokens only", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(() => {
    setTheme("auto");
    rig.stop();
  });
  setTheme("light");
  await rig.settle();
  expect(document.documentElement.dataset.theme).toBe("light");
  await rig.shot("11-light");
});

test("the example car, as the first visit opens it", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(rig.stop);
  sheet.byName = { ...EXAMPLE_SHEET };
  loadSprite(exampleCar(), null);
  await rig.settle(200);
  expect(editor.sprite.parts?.length).toBe(5);
  await rig.shot("12-example-car");
});
