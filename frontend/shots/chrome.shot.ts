// The app's own chrome: the help, and the light theme.
import { expect, onTestFinished, test } from "vitest";

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
