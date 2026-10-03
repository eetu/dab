// Several parts at once: picked from the tree or the canvas, then moved and
// removed together.
//
// Moving and removing a set is tested in core. What is only checkable here is
// the hand: shift picks, a plain click goes back to one, the Move tool's
// arrows, drag and ⌫ act on the whole set as one undo entry, and Escape lets
// go of the set before anything else.
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import {
  editor,
  history,
  loadSprite,
  pickAllParts,
  selectNode,
  setTool,
  undoEdit,
} from "../lib/editor.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const lamp = (name: string, x: number) => ({
  name,
  x,
  y: 1,
  w: 2,
  h: 2,
  palette: { L: "#f0e060" },
  frames: [["LL", "LL"]],
});

/** A body with two lamps and a door on it, all inline. */
const CAR = () => ({
  name: "car",
  w: 12,
  h: 8,
  palette: { B: "#3060c0" },
  frames: [Array<string>(8).fill("B".repeat(12))],
  parts: [
    lamp("lampL", 1),
    lamp("lampR", 9),
    {
      name: "door",
      x: 4,
      y: 3,
      w: 4,
      h: 4,
      palette: { D: "#202028" },
      frames: [Array<string>(4).fill("DDDD")],
    },
  ],
});

let host: HTMLElement;
beforeEach(async () => {
  host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const app = mount(App, { target: host });
  await sleep(40);
  loadSprite(structuredClone(CAR()), "car.json");
  await sleep(40);
  return () => {
    unmount(app);
    host.remove();
  };
});

const row = (name: string) => host.querySelector(`[title="Draw on ${name}"]`) as HTMLElement;
const shiftClick = (el: HTMLElement) =>
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
const key = (k: string) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
const at = (name: string) => editor.sprite.parts!.find((p) => p.name === name)!;

test("shift-clicked rows pick several; a plain click goes back to one", async () => {
  row("lampL").click();
  shiftClick(row("lampR"));
  expect(editor.picked).toEqual(["lampL", "lampR"]);
  expect(editor.path).toEqual(["lampR"]);
  await sleep(20);
  expect(row("lampL").closest("li")!.classList.contains("picked")).toBe(true);
  // Shift again takes one out, and the selection passes to what is left.
  shiftClick(row("lampR"));
  expect(editor.picked).toEqual(["lampL"]);
  expect(editor.path).toEqual(["lampL"]);
  shiftClick(row("door"));
  row("lampR").click();
  expect(editor.picked).toEqual(["lampR"]);
});

test("under Move, the arrows carry the set — a held run is one undo entry", () => {
  selectNode(["lampL"]);
  shiftClick(row("lampR"));
  setTool("move");
  const before = history.undo;
  key("ArrowRight");
  key("ArrowRight");
  key("ArrowDown");
  expect([at("lampL").x, at("lampL").y, at("lampR").x, at("lampR").y]).toEqual([3, 2, 11, 2]);
  expect(at("door").x).toBe(4);
  expect(history.undo).toBe(before + 1);
});

test("⌫ takes out every picked part, and one undo puts them back", () => {
  selectNode(["lampL"]);
  shiftClick(row("door"));
  setTool("move");
  key("Backspace");
  expect(editor.sprite.parts!.map((p) => p.name)).toEqual(["lampR"]);
  expect(editor.picked).toEqual([]);
  undoEdit();
  expect(editor.sprite.parts!.map((p) => p.name)).toEqual(["lampL", "lampR", "door"]);
});

test("a Move drag that starts on a picked part carries the whole set", async () => {
  selectNode(["lampL"]);
  shiftClick(row("lampR"));
  setTool("move");
  await sleep(40);
  const canvas = host.querySelector('[data-testid="canvas"]') as HTMLCanvasElement;
  const r = canvas.getBoundingClientRect();
  const cell = (x: number, y: number) => ({
    clientX: r.left + ((x + 0.5) / 12) * r.width,
    clientY: r.top + ((y + 0.5) / 8) * r.height,
  });
  const base = { bubbles: true, pointerId: 1, pointerType: "mouse", button: 0 };
  const before = history.undo;
  canvas.dispatchEvent(new PointerEvent("pointerdown", { ...base, ...cell(1, 1) }));
  canvas.dispatchEvent(new PointerEvent("pointermove", { ...base, ...cell(1, 2) }));
  canvas.dispatchEvent(new PointerEvent("pointermove", { ...base, ...cell(1, 3) }));
  canvas.dispatchEvent(new PointerEvent("pointerup", { ...base, ...cell(1, 3) }));
  expect([at("lampL").y, at("lampR").y]).toEqual([3, 3]);
  expect(history.undo).toBe(before + 1);
  expect(editor.picked).toEqual(["lampL", "lampR"]);
});

test("Escape lets go of the set first, back to the part selected", () => {
  selectNode(["lampL"]);
  shiftClick(row("door"));
  key("Escape");
  expect(editor.picked).toEqual(["door"]);
  expect(editor.path).toEqual(["door"]);
});

test("Select all parts picks every one of them", () => {
  pickAllParts();
  expect(editor.picked).toEqual(["lampL", "lampR", "door"]);
});
