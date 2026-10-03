// Several parts picked at once.
//
// What the picture has to show: the set reads as a set — every picked row in
// the tree carries the accent border, the selected one its fill too, and each
// picked part is outlined on the canvas, so what the arrows and ⌫ will act on
// is on screen before they are pressed.
import { expect, onTestFinished, test } from "vitest";

import { loadSprite, pickNode, selectNode, setTool, sheet } from "../src/lib/editor.svelte";
import { EXAMPLE_SHEET, exampleCar } from "../src/lib/examples";
import { open, SPRITES } from "./rig";

test("both wheels and a door, picked under Move", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(() => rig.stop());
  sheet.byName = { ...EXAMPLE_SHEET };
  loadSprite(exampleCar(), null);
  await rig.settle(150);
  selectNode(["wheel_r"]);
  pickNode(["wheel_f"]);
  pickNode(["door_l"]);
  setTool("move");
  await rig.settle(150);
  expect(rig.host.querySelectorAll("li.picked"), "the picked rows are not marked").toHaveLength(2);
  expect(rig.host.querySelectorAll(".stage .node"), "not every pick is outlined").toHaveLength(3);
  await rig.shot("60-parts-picked");
});
