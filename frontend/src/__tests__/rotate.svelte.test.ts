// Rotation, driven as a mode: open it, work the dial, and either keep it or not.
//
// What is only checkable here is the mode's contract — that nothing is written
// until Apply, that Cancel leaves no trace, that the whole session is one undo
// entry, and that the cost is on screen before it is paid. The sampler itself is
// tested in the format package, where it lives.
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import {
  applyTurn,
  beginTurn,
  cancelTurn,
  editor,
  history,
  loadSprite,
  selectBox,
  setTurn,
  turning,
  undoEdit,
} from "../lib/editor.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A corner mark in the top-left, so a turn that went the wrong way round is a
 *  wrong answer rather than a symmetrical one. */
const sprite = () => ({
  name: "mark",
  w: 4,
  h: 4,
  palette: { A: "#ff0000", B: "#0000ff" },
  frames: [["AB..", "A...", "....", "...."]],
});

let app: { host: HTMLElement; stop: () => void };

beforeEach(async () => {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const mounted = mount(App, { target: host });
  await sleep(40);
  loadSprite(structuredClone(sprite()), "mark.json");
  editor.tool = "select";
  await sleep(50);
  app = {
    host,
    stop: () => {
      if (turning.on) cancelTurn();
      unmount(mounted);
      host.remove();
    },
  };
  return () => app.stop();
});

const rows = () => editor.sprite.frames[0];

test("a quarter turn of a block is exact, and costs no colours", async () => {
  selectBox({ x: 0, y: 0 }, { x: 1, y: 1 });
  beginTurn(false);
  setTurn(90);
  await sleep(30);
  // Clockwise: the left column becomes the top row, and B swings to the right.
  expect(rows()[0]).toBe("AA..");
  expect(rows()[1]).toBe(".B..");
  expect(turning.added).toBe(0);
  applyTurn();
  expect(turning.on).toBe(false);
});

test("nothing is written until Apply, and Cancel leaves no trace", async () => {
  const before = rows().join("\n");
  const undos = history.undo;
  selectBox({ x: 0, y: 0 }, { x: 1, y: 1 });
  beginTurn(false);
  setTurn(37, 4);
  await sleep(30);
  // The preview is on the canvas...
  expect(rows().join("\n")).not.toBe(before);
  // ...and on nobody's undo stack.
  expect(history.undo).toBe(undos);
  cancelTurn();
  expect(rows().join("\n")).toBe(before);
  expect(history.undo).toBe(undos);
  expect(editor.sprite.palette).toEqual({ A: "#ff0000", B: "#0000ff" });
});

test("a whole session at the dial is one undo entry", async () => {
  const before = rows().join("\n");
  const undos = history.undo;
  selectBox({ x: 0, y: 0 }, { x: 1, y: 1 });
  beginTurn(false);
  // Several angles, the way anyone actually finds the one they want.
  for (const deg of [10, 25, 40, 90]) {
    setTurn(deg);
    await sleep(10);
  }
  applyTurn();
  expect(history.undo).toBe(undos + 1);
  undoEdit();
  expect(rows().join("\n")).toBe(before);
});

test("every angle is sampled from the original, so coming back is lossless", async () => {
  const before = rows().join("\n");
  selectBox({ x: 0, y: 0 }, { x: 1, y: 1 });
  beginTurn(false);
  // Out to a smoothed angle and back. Rotating the last preview instead of the
  // source would have blended the blends and never found its way home.
  setTurn(33, 4);
  await sleep(20);
  setTurn(0, 4);
  await sleep(20);
  expect(rows().join("\n")).toBe(before);
  expect(turning.added).toBe(0);
  cancelTurn();
});

test("smoothing says what it will cost before it costs it", async () => {
  selectBox({ x: 0, y: 0 }, { x: 3, y: 3 });
  beginTurn(false);
  setTurn(37, 1);
  await sleep(30);
  expect(turning.added).toBe(0);
  const cost = app.host.querySelector("[data-testid=cost]");
  expect(cost?.textContent?.trim()).toBe("no new colours");

  setTurn(37, 4);
  await sleep(30);
  expect(turning.added).toBeGreaterThan(0);
  expect(cost?.textContent?.trim()).toBe(`+${turning.added} colours`);
  // And the palette on screen is still the old one: the count is a forecast.
  expect(Object.keys(editor.sprite.palette).length).toBeGreaterThan(2);
  cancelTurn();
  expect(Object.keys(editor.sprite.palette)).toEqual(["A", "B"]);
});

test("turning the whole node grows it to fit, and never crops another frame", async () => {
  loadSprite(
    {
      name: "two",
      w: 4,
      h: 4,
      palette: { A: "#ff0000" },
      frames: [
        ["AAAA", "AAAA", "AAAA", "AAAA"],
        ["A...", "....", "....", "...A"],
      ],
    },
    "two.json",
  );
  await sleep(30);
  editor.frame = 0;
  beginTurn(true);
  setTurn(45, 3);
  await sleep(30);
  // 4×4 turned 45° needs 6×6 to hold its corners.
  expect(editor.sprite.w).toBe(6);
  expect(editor.sprite.h).toBe(6);
  applyTurn();
  // The frame nobody turned kept both its pixels — it was padded, not cropped.
  const other = editor.sprite.frames[1];
  expect(other.length).toBe(6);
  expect(other.join("")).toContain("A");
  expect(other.join("").split("A").length - 1).toBe(2);
});

test("Escape lets go of a turn, Enter keeps it", async () => {
  const before = rows().join("\n");
  selectBox({ x: 0, y: 0 }, { x: 1, y: 1 });
  beginTurn(false);
  setTurn(90);
  await sleep(20);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(20);
  expect(turning.on).toBe(false);
  expect(rows().join("\n")).toBe(before);

  beginTurn(false);
  setTurn(90);
  await sleep(20);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await sleep(20);
  expect(turning.on).toBe(false);
  expect(rows()[0]).toBe("AA..");
});

test("a turned block is still floating: shoving it puts back what it covered", async () => {
  loadSprite(
    {
      name: "over",
      w: 6,
      h: 4,
      palette: { A: "#ff0000", B: "#0000ff" },
      frames: [["AB....", "A.....", "......", "....B."]],
    },
    "over.json",
  );
  editor.tool = "select";
  await sleep(30);
  selectBox({ x: 0, y: 0 }, { x: 1, y: 1 });
  beginTurn(false);
  setTurn(90);
  await sleep(20);
  applyTurn();
  await sleep(20);
  // Straight into a move, on the same undo entry — and over the lone B at (4,3).
  const { nudgeSelection } = await import("../lib/editor.svelte");
  nudgeSelection(4, 3);
  await sleep(20);
  expect(rows()[3]).toBe("....AA");
  // Shove it off again: the B it passed over is not a casualty.
  nudgeSelection(-4, -3);
  await sleep(20);
  expect(rows()[3]).toBe("....B.");
});

test("the bar answers REAL clicks — capture must not eat them", async () => {
  // userEvent drives actual browser input. Synthetic .click() bypasses pointer
  // capture, which is exactly how this bug hid: the pane captured the pointer
  // on pointerdown, the release retargeted, and no click was ever synthesised
  // on the bar. Every earlier test called the functions instead of clicking.
  const { userEvent } = await import("@vitest/browser/context");
  selectBox({ x: 0, y: 0 }, { x: 1, y: 1 });
  beginTurn(false);
  setTurn(37, 1);
  await sleep(40);

  const bar = app.host.querySelector("[aria-label=Rotate]") as HTMLElement;
  expect(bar).toBeTruthy();

  // Smoothing: click 3× and the cost forecast must react.
  const three = [...bar.querySelectorAll("button")].find((b) => b.textContent?.trim() === "3×")!;
  await userEvent.click(three);
  await sleep(40);
  expect(turning.smooth).toBe(3);
  expect(turning.added).toBeGreaterThan(0);

  // A quarter button turns by exactly ninety.
  const left = [...bar.querySelectorAll("button")].find((b) => b.textContent?.includes("↺"))!;
  await userEvent.click(left);
  await sleep(40);
  expect(turning.angle).toBe(37 - 90);

  // And Cancel actually cancels.
  const cancel = [...bar.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Cancel",
  )!;
  await userEvent.click(cancel);
  await sleep(40);
  expect(turning.on).toBe(false);
  expect(editor.sprite.frames[0]).toEqual(["AB..", "A...", "....", "...."]);
});
