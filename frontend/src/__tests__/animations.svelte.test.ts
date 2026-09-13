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
