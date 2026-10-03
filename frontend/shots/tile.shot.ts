// The tiling preview on a brick wall: what the picture has to show is the seam
// — the copies round the stage meet it edge to edge, so a mortar line that
// does not continue across the edge is plain to see.
import { expect, onTestFinished, test } from "vitest";

import { editor, loadSprite } from "../src/lib/editor.svelte";
import { open, SPRITES } from "./rig";

test("a brick tile, wrapped", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(() => {
    editor.tile = false;
    rig.stop();
  });
  // Running bond, 12×8: two courses, the second offset by half a brick, so
  // the bond only reads right if it carries across every edge.
  const rows = [
    "MMMMMMMMMMMM",
    "BBBBBMBBBBBM",
    "BBBBBMBBBBBM",
    "BBBBBMBBBBBM",
    "MMMMMMMMMMMM",
    "BBMBBBBBMBBB",
    "BBMBBBBBMBBB",
    "BBMBBBBBMBBB",
  ];
  loadSprite(
    { name: "bricks", w: 12, h: 8, palette: { B: "#a8442e", M: "#d8cfc0" }, frames: [rows] },
    "bricks.json",
  );
  editor.tile = true;
  await rig.settle(200);
  expect(rig.host.querySelector("[data-testid=tiles]"), "no tiles drawn").toBeTruthy();
  await rig.shot("90-tile-bricks");
});
