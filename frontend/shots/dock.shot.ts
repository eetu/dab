// The bottom bar under load: frames and clips, sparse and heavy.
import { expect, onTestFinished, test } from "vitest";

import { editor, loadSprite, selectNode, sheet } from "../src/lib/editor.svelte";
import { EXAMPLE_SHEET, exampleCar } from "../src/lib/examples";
import { open, SPRITES } from "./rig";

test("the dock on the example car's lights: frames plus two clips", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(rig.stop);
  sheet.byName = { ...EXAMPLE_SHEET };
  loadSprite(exampleCar(), null);
  await rig.settle(150);
  selectNode(["lights"]);
  await rig.settle(150);
  expect(editor.sprite.parts?.length).toBe(5);
  await rig.shot("13-dock-lights");
});

test("the dock heavy: twelve frames, three clips with long runs", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(rig.stop);
  const rows = SPRITES.wheel().frames[0];
  loadSprite(
    {
      ...SPRITES.wheel(),
      name: "spinner",
      frames: Array.from({ length: 12 }, () => rows),
      clips: {
        "spin fast": [0, 1, 2, 3, 4, 5, 6, 7],
        "spin slow": [0, 0, 2, 2, 4, 4, 6, 6, 8, 8],
        idle: [0],
      },
    },
    "spinner.json",
  );
  await rig.settle(200);
  await rig.shot("14-dock-heavy");
});

test("the dock sparse: one frame, no clips", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(rig.stop);
  await rig.settle(100);
  await rig.shot("15-dock-sparse");
});
