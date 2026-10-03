// Levels of detail: one subject at more than one size.
//
// What the pictures have to show: the levels read as other drawings of the
// whole subject (their own list, under the parts), a level is drawn alone on
// the canvas at its own size, and the loupe puts every size side by side on
// one ground line — where a tier that reads differently shows up.
import { levelPath } from "dab-core";
import { expect, onTestFinished, test } from "vitest";

import { addLevel, selectNode } from "../src/lib/editor.svelte";
import { openLevelDialog } from "../src/lib/newlevel.svelte";
import { toggleLoupe } from "../src/lib/panels.svelte";
import { open, SPRITES } from "./rig";

test("a car and its far sizes, the far one on the canvas", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(() => {
    toggleLoupe(false);
    rig.stop();
  });
  addLevel("far", 10, 6);
  addLevel("ridge", 5, 3);
  selectNode(levelPath("far"));
  toggleLoupe(true);
  await rig.settle(200);
  const canvas = rig.host.querySelector("[data-testid=canvas]") as HTMLCanvasElement;
  expect([canvas.width, canvas.height], "the canvas is not drawing the level").toEqual([10, 6]);
  const loupe = rig.host.querySelector("[data-testid=loupe-canvas]") as HTMLCanvasElement;
  expect(loupe.width, "the loupe is not showing every size").toBe(20 + 2 + 10 + 2 + 5);
  await rig.shot("50-levels-far");
});

test("New level…, at a fraction of the size on screen", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(() => rig.stop());
  openLevelDialog();
  await rig.settle();
  expect(document.querySelector("[role=dialog]"), "no dialog").toBeTruthy();
  await rig.shot("51-levels-dialog");
});
