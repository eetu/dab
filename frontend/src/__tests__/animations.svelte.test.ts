// Animation lanes: the bars under the frame strip that say which frames each
// named run holds. The claim the arrangement makes is that position answers
// "which frames" — so what matters here is that a cell IS the frame above it:
// clicking one puts that frame in or takes it out, and sweeping sets the run.
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import { activeNode, addAnimation, editor, loadSprite } from "../lib/editor.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DOOR = {
  name: "door",
  w: 2,
  h: 1,
  palette: { A: "#ff0000" },
  frames: [["A."], [".A"], ["AA"], [".."]],
};

let host: HTMLElement;
let stop: () => void;

beforeEach(async () => {
  host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const app = mount(App, { target: host });
  stop = () => {
    unmount(app);
    host.remove();
  };
  await sleep(60);
  loadSprite(structuredClone(DOOR), "door.json");
  editor.frame = 0;
  await sleep(60);
  return () => stop();
});

/** The cells of one lane, in frame order. */
const cells = (lane = 0) => {
  const rows = [...host.querySelectorAll(".timeline .cell")] as HTMLElement[];
  const per = DOOR.frames.length;
  return rows.slice(lane * per, lane * per + per);
};

const run = (name: string) => activeNode().animations?.[name];

const press = (el: HTMLElement, id = 7) =>
  el.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, pointerId: id, pointerType: "mouse" }),
  );
const release = (el: HTMLElement, id = 7) =>
  el.dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, pointerId: id, pointerType: "mouse" }),
  );
const enter = (el: HTMLElement, id = 7) =>
  el.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerId: id, pointerType: "mouse" }),
  );

test("a lane has one cell per frame, and the run is the filled ones", async () => {
  addAnimation("swing");
  await sleep(60);
  expect(run("swing")).toEqual([0]);
  const lane = cells();
  expect(lane.length).toBe(DOOR.frames.length);
  expect(lane.map((c) => c.classList.contains("in"))).toEqual([true, false, false, false]);
});

test("clicking a cell puts its frame in the run, sorted back into place", async () => {
  addAnimation("swing");
  await sleep(60);
  // Out of order on purpose: a plain run stays in frame order whichever cell
  // you click, because that is what the bar is claiming to show.
  press(cells()[2]);
  release(cells()[2]);
  await sleep(40);
  press(cells()[1]);
  release(cells()[1]);
  await sleep(40);
  expect(run("swing")).toEqual([0, 1, 2]);

  // And clicking a filled one takes it out again.
  press(cells()[1]);
  release(cells()[1]);
  await sleep(40);
  expect(run("swing")).toEqual([0, 2]);
});

test("a sweep sets the run to what it covered, in one go", async () => {
  addAnimation("swing");
  await sleep(60);
  const lane = cells();
  press(lane[3]);
  enter(lane[2]);
  enter(lane[1]);
  release(lane[1]);
  await sleep(40);
  // Ascending whichever way it was swept: the bar reads left to right.
  expect(run("swing")).toEqual([1, 2, 3]);
});

test("the last frame of a run cannot be clicked away, and says why", async () => {
  addAnimation("swing");
  await sleep(60);
  press(cells()[0]);
  release(cells()[0]);
  await sleep(40);
  expect(run("swing")).toEqual([0]);
  expect(editor.status).toContain("swing");
  expect(editor.statusBad).toBe(true);
});

/** Drag one element onto another and let go, as the browser does it: dragstart
 *  on the thing, dragover on the target (which side of it decides the landing),
 *  drop. The same events `../nib`'s layer list is reordered by. */
async function dragOnto(from: Element, to: HTMLElement, side: "left" | "right" = "left") {
  const b = to.getBoundingClientRect();
  const clientX = side === "left" ? b.left + b.width / 4 : b.left + (b.width * 3) / 4;
  const clientY = b.top + b.height / 2;
  const dataTransfer = new DataTransfer();
  from.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
  to.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer, clientX, clientY }));
  await sleep(20);
  to.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer, clientX, clientY }));
  await sleep(40);
}

test("a frame is dragged to a new place, and the animations follow it", async () => {
  addAnimation("swing");
  await sleep(40);
  const { setAnimationFrames } = await import("../lib/editor.svelte");
  setAnimationFrames("swing", [0, 1]);
  await sleep(40);

  const thumbs = () => [...host.querySelectorAll(".timeline .frame")] as HTMLElement[];
  const art = () => activeNode().frames.map((f) => f[0]);
  expect(art()).toEqual(["A.", ".A", "AA", ".."]);

  // Frame 4 to the front: picked up whole, dropped on frame 1's leading half.
  await dragOnto(thumbs()[3], thumbs()[0], "left");
  expect(art()).toEqual(["..", "A.", ".A", "AA"]);
  // The run named frames 1 and 2; those are now 2 and 3, and it says so.
  expect(activeNode().animations?.swing).toEqual([1, 2]);

  // One undo entry for the whole drag.
  const { undoEdit } = await import("../lib/editor.svelte");
  undoEdit();
  await sleep(40);
  expect(art()).toEqual(["A.", ".A", "AA", ".."]);
});

test("a click on a thumbnail still picks the frame rather than moving it", async () => {
  const thumb = host.querySelector(".timeline .frame .pick") as HTMLElement;
  const before = activeNode().frames.map((f) => f[0]);
  editor.frame = 2;
  await sleep(20);
  thumb.click();
  await sleep(40);
  expect(editor.frame).toBe(0);
  expect(activeNode().frames.map((f) => f[0])).toEqual(before);
});

test("the selected run shows its steps, and a step drags to a new place in it", async () => {
  addAnimation("swing");
  const { setAnimationFrames } = await import("../lib/editor.svelte");
  setAnimationFrames("swing", [0, 1, 2]);
  editor.animation = "swing";
  await sleep(60);

  const steps = () => [...host.querySelectorAll(".timeline .step")] as HTMLElement[];
  expect(steps().map((s) => s.textContent?.trim())).toEqual(["1", "2", "3"]);

  // The last step to the front: the ORDER changes, the membership does not.
  await dragOnto(steps()[2], steps()[0], "left");
  expect(activeNode().animations?.swing).toEqual([2, 0, 1]);
  expect(steps().map((s) => s.textContent?.trim())).toEqual(["3", "1", "2"]);
});

test("a run that plays in strip order hides its steps until it is selected", async () => {
  addAnimation("swing");
  const { setAnimationFrames } = await import("../lib/editor.svelte");
  setAnimationFrames("swing", [0, 1]);
  editor.animation = null;
  await sleep(60);
  // Nothing to say: the bar's own extent is the whole truth.
  expect(host.querySelector(".timeline .step")).toBeNull();

  // A reversed one says it whether or not it is selected.
  setAnimationFrames("swing", [1, 0]);
  await sleep(60);
  expect([...host.querySelectorAll(".timeline .step")].map((s) => s.textContent?.trim())).toEqual([
    "2",
    "1",
  ]);
});

test("a reversed run is numbered, because position cannot say the order", async () => {
  addAnimation("shut");
  await sleep(60);
  const lane = cells();
  press(lane[0]);
  enter(lane[2]);
  release(lane[2]);
  await sleep(40);
  expect(run("shut")).toEqual([0, 1, 2]);
  // Plain runs carry no numbers — the bar's extent is the whole truth.
  expect(cells().some((c) => c.textContent?.trim())).toBe(false);

  const { setAnimationFrames } = await import("../lib/editor.svelte");
  setAnimationFrames("shut", [2, 1, 0]);
  await sleep(40);
  expect(cells().map((c) => c.textContent?.trim())).toEqual(["3", "2", "1", ""]);
});
