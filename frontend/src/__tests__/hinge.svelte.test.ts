// Turning out of the picture plane, and turning into a run of frames.
//
// A door opening toward the viewer is not a rotation on screen: it is the same
// art foreshortened about its hinge. What matters here is that the mode writes
// the frames an animation needs — closed to open in a few — and that every step
// comes off the pristine source rather than off the step before it.
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import {
  activeNode,
  applyTurn,
  beginTurn,
  cancelTurn,
  editor,
  loadSprite,
  selectNode,
  setAxis,
  setHinge,
  setTurn,
  setTurnFrames,
  turnFrame,
  turning,
} from "../lib/editor.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A car with a door part: four columns of paint, hinged at its left. */
const CAR = () => ({
  name: "car",
  w: 8,
  h: 2,
  palette: { K: "#101014" },
  frames: [["KKKKKKKK", "KKKKKKKK"]],
  parts: [
    {
      name: "door",
      x: 2,
      y: 0,
      w: 4,
      h: 2,
      palette: { A: "#ff0000", B: "#00ff00" },
      frames: [["AAAB", "AAAB"]],
    },
  ],
});

let stop: () => void;

beforeEach(async () => {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const app = mount(App, { target: host });
  stop = () => {
    unmount(app);
    host.remove();
  };
  await sleep(60);
  loadSprite(structuredClone(CAR()), "car.json");
  selectNode(["door"]);
  await sleep(60);
  return () => {
    if (turning.on) cancelTurn();
    stop();
  };
});

const doorRows = () => activeNode().frames.map((f) => [...f]);

test("a swing narrows the art about its hinge, and leaves the box alone", async () => {
  beginTurn(true);
  setAxis("y");
  setHinge(0); // the door's own left edge, in node pixels
  setTurn(60); // cos 60 = 0.5: four columns project onto two
  await sleep(40);
  const node = activeNode();
  expect([node.w, node.h]).toEqual([4, 2]);
  expect(node.frames[0][0].slice(2)).toBe("..");
  expect(node.frames[0][0].slice(0, 2)).not.toContain(".");
  // Crisp by default: it drops columns, it does not invent colours.
  expect(turning.added).toBe(0);

  cancelTurn();
  await sleep(20);
  expect(doorRows()[0]).toEqual(["AAAB", "AAAB"]);
});

test("the hinge is draggable, and the far edge is the one that moves", async () => {
  beginTurn(true);
  setAxis("y");
  setHinge(4); // the door's right edge
  setTurn(60);
  await sleep(40);
  const row = activeNode().frames[0][0];
  expect(row.slice(0, 2)).toBe("..");
  // The leading edge sits against the hinge.
  expect(row[3]).toBe("B");
  cancelTurn();
});

test("Apply writes a run of frames and an animation naming them", async () => {
  beginTurn(true);
  setAxis("y");
  setHinge(0);
  setTurn(80);
  setTurnFrames(4);
  await sleep(40);
  applyTurn();
  await sleep(40);

  const node = activeNode();
  // The frame it started on, then one per step.
  expect(node.frames.length).toBe(5);
  expect(node.frames[0]).toEqual(["AAAB", "AAAB"]);
  const named = node.animations?.swing;
  expect(named).toEqual([0, 1, 2, 3, 4]);
  // Selected, so the lane is lit and P plays what was just made.
  expect(editor.animation).toBe("swing");
  expect(editor.status).toContain("4 frames");

  // Each step is narrower than the one before it: the door is closing on the
  // hinge, and every step came off the pristine art rather than off its
  // predecessor — which is what stops the last frame being mush.
  const width = (f: string[]) => f[0].replace(/\.+$/, "").length;
  const widths = node.frames.map(width);
  for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeLessThanOrEqual(widths[i - 1]);
  expect(widths[widths.length - 1]).toBeLessThan(widths[0]);

  // One undo entry for the whole run.
  const { undoEdit } = await import("../lib/editor.svelte");
  undoEdit();
  await sleep(20);
  expect(activeNode().frames.length).toBe(1);
  expect(activeNode().animations).toBeUndefined();
});

test("a spin writes its run too, growing the box once for the widest step", async () => {
  beginTurn(true);
  setAxis("z");
  setTurn(90);
  setTurnFrames(3);
  await sleep(40);
  applyTurn();
  await sleep(40);
  const node = activeNode();
  expect(node.frames.length).toBe(4);
  expect(node.animations?.spin).toEqual([0, 1, 2, 3]);
  // A turn in the plane needs the corners the box did not have; every frame is
  // padded into the same grown box, never cropped.
  expect(node.w).toBeGreaterThanOrEqual(4);
  for (const f of node.frames) {
    expect(f.length).toBe(node.h);
    for (const row of f) expect(row.length).toBe(node.w);
  }
});

test("a turn walks the strip, keeping what each frame was left at", async () => {
  // Three copies of the same door, to be swung a little further on each.
  const { duplicateFrame } = await import("../lib/editor.svelte");
  duplicateFrame();
  duplicateFrame();
  await sleep(40);
  editor.frame = 0;
  await sleep(20);

  beginTurn(true);
  setAxis("y");
  setHinge(0);
  setTurn(30);
  await sleep(30);
  // Move along the strip: the mode stays open and the dial starts at zero for a
  // frame it has not visited.
  turnFrame(1);
  await sleep(20);
  expect(turning.on).toBe(true);
  expect(turning.angle).toBe(0);
  setTurn(60);
  await sleep(30);
  // Back to the first: its own angle comes back with it.
  turnFrame(0);
  await sleep(20);
  expect(turning.angle).toBe(30);
  // Both are marked as carrying an angle; the third was never touched.
  expect([...turning.marked].sort()).toEqual([0, 1]);

  applyTurn();
  await sleep(40);
  const node = activeNode();
  const width = (f: string[]) => f[0].replace(/\.+$/, "").length;
  // Frame 1 swung 30°, frame 2 swung 60° — narrower still — and frame 3 is the
  // art as it was.
  expect(width(node.frames[0])).toBeGreaterThan(width(node.frames[1]));
  expect(width(node.frames[2])).toBe(4);
  expect(editor.status).toContain("2 frames");

  // One undo entry for the session, however many frames it touched.
  const { undoEdit } = await import("../lib/editor.svelte");
  undoEdit();
  await sleep(20);
  expect(activeNode().frames.every((f) => width(f) === 4)).toBe(true);
});

test("cancelling a session takes every frame back, not just the last", async () => {
  const { duplicateFrame } = await import("../lib/editor.svelte");
  duplicateFrame();
  await sleep(40);
  editor.frame = 0;
  const before = activeNode().frames.map((f) => [...f]);

  beginTurn(true);
  setAxis("y");
  setTurn(40);
  turnFrame(1);
  setTurn(70);
  await sleep(40);
  cancelTurn();
  await sleep(20);
  expect(activeNode().frames.map((f) => [...f])).toEqual(before);
});

test("a selection turns one block, not a run", async () => {
  const { selectAll } = await import("../lib/editor.svelte");
  editor.tool = "select";
  selectAll();
  await sleep(20);
  beginTurn(false);
  setTurnFrames(4);
  await sleep(20);
  // A float has no frames of its own to write, so the stepper stays at one.
  expect(turning.frames).toBe(1);
  cancelTurn();
});
