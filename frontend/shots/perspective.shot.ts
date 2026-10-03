// The perspective brush: a road tile laid on a floor and stamped into the
// distance.
//
// What the pictures have to show: the plane is legible on the art (its grid
// converging, its anchor), the brush previews where it would land, and a run
// of stamps reads as one road receding — which no other tool here can draw.
import { allCells, framePoint, readStamp } from "dab-core";
import { expect, onTestFinished, test } from "vitest";

import {
  beginPerspective,
  clipboard,
  endPerspective,
  perspective,
  plane,
  setAnchor,
  setPlane,
  stampPerspective,
} from "../src/lib/editor.svelte";
import { open, type Rig } from "./rig";

const [W, H] = [40, 28];
/** An 8×8 road tile: the brush. */
const TILE = [
  "WAAYYAAW",
  "WAAYYAAW",
  "WAAYYAAW",
  "WAAAAAAW",
  "WAAAAAAW",
  "WAAYYAAW",
  "WAAYYAAW",
  "WAAYYAAW",
];

/** Sky over grass. */
const land = () => ({
  name: "road",
  w: W,
  h: H,
  palette: { S: "#7ab0e0", G: "#3a8a3a", A: "#45454f", Y: "#e8c840", W: "#d8d8d8" },
  frames: [Array.from({ length: H }, (_, y) => (y < 10 ? "S" : "G").repeat(W))],
});

async function pickUp(rig: Rig) {
  clipboard.stamp = readStamp(TILE, allCells(8, 8));
  beginPerspective();
  setPlane({ tilt: 74, turn: 0, spin: 0, distance: 30 });
  setAnchor(W / 2, H - 2);
  await rig.settle();
}

test("the plane on the art, and the brush where it would land", async () => {
  const rig = await open(land());
  onTestFinished(() => {
    endPerspective();
    rig.stop();
  });
  await pickUp(rig);
  const canvas = rig.host.querySelector("[data-testid=canvas]") as HTMLCanvasElement;
  canvas.dispatchEvent(
    new PointerEvent("pointermove", { bubbles: true, pointerId: 1, ...rig.cell(20, 23) }),
  );
  await rig.settle();
  expect(perspective.at, "no hover reached the mode").toBeTruthy();
  expect(document.querySelector('[aria-label="Perspective"]'), "no bar").toBeTruthy();
  // The preview really is on the canvas: the cell under the pointer is road,
  // not grass. One canvas pixel per cell, and the stage is the sprite.
  const [r, g, b] = canvas.getContext("2d")!.getImageData(20, 23, 1, 1).data;
  expect([r, g, b], "no brush preview under the pointer").not.toEqual([0x3a, 0x8a, 0x3a]);
  await rig.shot("40-perspective-plane");
});

test("a road, stamped one grid cell at a time into the distance", async () => {
  const rig = await open(land());
  onTestFinished(() => {
    endPerspective();
    rig.stop();
  });
  await pickUp(rig);
  // One brush-length along the plane per stamp, from the anchor away — the
  // grid's cells, which is what makes a run of stamps meet edge to edge.
  for (let k = 0; k < 12; k++) {
    const p = framePoint(plane(), 0, -8 * k);
    if (!p || p[1] < 9) break;
    stampPerspective({ x: Math.floor(p[0]), y: Math.floor(p[1]) });
  }
  endPerspective();
  await rig.settle();
  await rig.shot("41-perspective-road");
});
