// The bottom bar under load: frames and animations, sparse and heavy.
import { expect, onTestFinished, test } from "vitest";

import { editor, loadSprite, selectNode, sheet } from "../src/lib/editor.svelte";
import { EXAMPLE_SHEET, exampleCar } from "../src/lib/examples";
import { open, SPRITES } from "./rig";

test("the dock on the example car's lights: frames plus two animations", async () => {
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

test("the dock heavy: twelve frames, three animations with long runs", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(rig.stop);
  const rows = SPRITES.wheel().frames[0];
  loadSprite(
    {
      ...SPRITES.wheel(),
      name: "spinner",
      frames: Array.from({ length: 12 }, () => rows),
      animations: {
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

test("the dock sparse: one frame, no animations", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(rig.stop);
  await rig.settle(100);
  await rig.shot("15-dock-sparse");
});

test("a frame mid-drag, with the gap it would land in marked", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(rig.stop);
  const rows = SPRITES.wheel().frames[0];
  loadSprite(
    {
      ...SPRITES.wheel(),
      name: "spinner",
      frames: [rows, rows, rows, rows, rows],
      animations: { spin: [0, 1, 2, 3, 4] },
    },
    "spinner.json",
  );
  await rig.settle(200);

  // Held, not dropped: the picture is of the marker, which only exists while a
  // drag is live.
  const thumbs = [...document.querySelectorAll(".timeline .frame")] as HTMLElement[];
  const from = thumbs[4].getBoundingClientRect();
  const to = thumbs[1].getBoundingClientRect();
  const base = { bubbles: true, pointerId: 5, pointerType: "mouse" };
  thumbs[4].dispatchEvent(
    new PointerEvent("pointerdown", {
      ...base,
      clientX: from.left + from.width / 2,
      clientY: from.top + from.height / 2,
    }),
  );
  window.dispatchEvent(
    new PointerEvent("pointermove", {
      ...base,
      clientX: to.left + to.width / 4,
      clientY: to.top + to.height / 2,
    }),
  );
  await rig.settle(120);
  expect(document.querySelector(".timeline .frame.before"), "no drop marker").toBeTruthy();
  await rig.shot("26-frame-drag");
  window.dispatchEvent(new PointerEvent("pointerup", base));
});

test("a run's steps, in playing order under its bar", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(rig.stop);
  const rows = SPRITES.wheel().frames[0];
  loadSprite(
    {
      ...SPRITES.wheel(),
      name: "spinner",
      frames: [rows, rows, rows, rows],
      // A hold and a reversal: the two things a bar of cells cannot say.
      animations: { "spin fast": [0, 1, 2, 3], bounce: [0, 1, 2, 3, 2, 1] },
    },
    "spinner.json",
  );
  await rig.settle(150);
  editor.animation = "bounce";
  await rig.settle(150);
  expect(document.querySelectorAll(".timeline .step").length).toBe(6);
  await rig.shot("27-run-steps");
});
