// A strip longer than the dock, scrolled.
//
// What the picture has to show: the gutter — the frame verbs, the lane names,
// the steps' row under a lane — stays a solid column while the frames and the
// lanes' cells scroll under it. Nothing of a scrolled-away frame, cell or step
// shows through a tinted name or between the gutter and the first column.
import { expect, onTestFinished, test } from "vitest";

import { editor, loadSprite } from "../src/lib/editor.svelte";
import { open, SPRITES } from "./rig";

test("ten frames, two lanes, scrolled right", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(() => rig.stop());
  const rows = SPRITES.wheel().frames[0];
  loadSprite(
    {
      ...SPRITES.wheel(),
      name: "deer",
      frames: Array.from({ length: 10 }, () => [...rows]),
      animations: { walk: [0, 1, 2, 3, 4, 5, 6, 7], graze: [8, 8, 8, 9] },
    },
    "deer.json",
  );
  editor.animation = "walk";
  editor.frame = 1;
  await rig.settle(150);
  const timeline = rig.host.querySelector(".timeline") as HTMLElement;
  expect(timeline.scrollWidth, "the strip fits — nothing to scroll").toBeGreaterThan(
    timeline.clientWidth,
  );
  timeline.scrollLeft = 260;
  await rig.settle(150);
  await rig.shot("70-strip-scrolled");
});
