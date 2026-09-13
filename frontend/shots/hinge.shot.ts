// Turning out of the picture plane: a door swinging open on its hinge, and the
// run of frames it writes.
//
// The picture has to show three things at once — the hinge line on the art, the
// foreshortened door, and the bar saying how many frames Apply will write.
import { expect, onTestFinished, test } from "vitest";

import {
  activeNode,
  applyTurn,
  beginTurn,
  cancelTurn,
  editor,
  selectNode,
  setAxis,
  setHinge,
  setTurn,
  setTurnFrames,
  turning,
} from "../src/lib/editor.svelte";
import { open, SPRITES } from "./rig";

/** The rig's car with a door part: a panel of its own, hinged at the front. */
const carWithDoor = () => {
  const car = SPRITES.car();
  return {
    ...car,
    parts: [
      {
        name: "door",
        x: 4,
        y: 4,
        w: 8,
        h: 6,
        palette: { D: "#2a4bd0", G: "#a0d8f0", E: "#101014" },
        frames: [["DDDDDDDD", "DGGGGGGD", "DGGGGGGD", "DDDDDDDD", "DDDDDDDE", "DDDDDDDD"]],
      },
    ],
  };
};

test("a door part mid-swing, hinge on the art", async () => {
  const rig = await open(carWithDoor());
  onTestFinished(() => {
    if (turning.on) cancelTurn();
    rig.stop();
  });
  selectNode(["door"]);
  await rig.settle(150);
  beginTurn(true);
  setAxis("y");
  setHinge(0);
  setTurn(55);
  setTurnFrames(4);
  await rig.settle(200);
  expect(document.querySelector('[aria-label="Hinge"]'), "no hinge handle").toBeTruthy();
  await rig.shot("24-hinge-swing");
});

test("the run it wrote, as lanes under the frames", async () => {
  const rig = await open(carWithDoor());
  onTestFinished(rig.stop);
  selectNode(["door"]);
  await rig.settle(150);
  beginTurn(true);
  setAxis("y");
  setHinge(0);
  setTurn(80);
  setTurnFrames(4);
  await rig.settle(150);
  applyTurn();
  await rig.settle(200);
  expect(activeNode().frames.length).toBe(5);
  expect(editor.animation).toBe("swing");
  await rig.shot("25-hinge-frames");
});
