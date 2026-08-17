// Input discipline: the Escape ladder, keys that work whatever is selected,
// dialogs that own the keyboard, and one-gesture-one-undo.
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import {
  copySelection,
  editor,
  floating,
  hasSelection,
  history,
  loadSprite,
  pasteClipboard,
  selectBox,
  selectNode,
  setColour,
} from "../lib/editor.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const sprite = () => ({
  name: "car",
  w: 8,
  h: 4,
  palette: { B: "#ff0000", K: "#101014" },
  frames: [["BBBB....", "KKKK....", "........", "......B."]],
  parts: [
    { name: "door", x: 4, y: 0, w: 2, h: 2, palette: { D: "#0000ff" }, frames: [["DD", "DD"]] },
  ],
});

let app: { host: HTMLElement; stop: () => void };
beforeEach(async () => {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const mounted = mount(App, { target: host });
  app = {
    host,
    stop: () => {
      unmount(mounted);
      host.remove();
    },
  };
  await sleep(40);
  loadSprite(structuredClone(sprite()), "car.json");
  await sleep(50);
  return () => app.stop();
});

const key = (k: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));

const rows = () => editor.sprite.frames[0];

test("Escape cancels a floating paste, restoring what it covered", async () => {
  editor.tool = "select";
  selectBox({ x: 0, y: 0 }, { x: 1, y: 1 });
  await sleep(30);
  copySelection();
  // Land it on the lone B at (6,3).
  pasteClipboard({ x: 5, y: 2 });
  await sleep(30);
  expect(floating.on).toBe(true);
  const undos = history.undo;
  key("Escape");
  await sleep(30);
  // Cancelled, not baked: the pixel it covered is back and the entry is gone.
  expect(floating.on).toBe(false);
  expect(rows()[3]).toBe("......B.");
  expect(history.undo).toBe(undos - 1);
  expect(hasSelection()).toBe(false);
});

test("Escape on a plain selection just deselects", async () => {
  editor.tool = "select";
  selectBox({ x: 0, y: 0 }, { x: 1, y: 0 });
  await sleep(30);
  key("Escape");
  await sleep(20);
  expect(hasSelection()).toBe(false);
});

test("Escape aborts the stroke in progress, and the paint never lands", async () => {
  editor.tool = "pencil";
  editor.ink = "B";
  const before = rows().join("\n");
  const canvas = app.host.querySelector("[data-testid=canvas]")!;
  const r = canvas.getBoundingClientRect();
  const base = { bubbles: true, pointerId: 1, pointerType: "mouse", button: 0 };
  const at = (x: number, y: number) => ({
    clientX: r.left + ((x + 0.5) / 8) * r.width,
    clientY: r.top + ((y + 0.5) / 4) * r.height,
  });
  canvas.dispatchEvent(new PointerEvent("pointerdown", { ...base, ...at(0, 2) }));
  canvas.dispatchEvent(new PointerEvent("pointermove", { ...base, ...at(3, 2) }));
  await sleep(20);
  expect(rows()[2]).toContain("B"); // mid-stroke, the paint is on
  key("Escape");
  await sleep(20);
  expect(rows().join("\n")).toBe(before); // aborted: one undo, all of it gone
  // The pointer is still down; releasing it must not paint a second stroke.
  canvas.dispatchEvent(new PointerEvent("pointerup", { ...base, ...at(3, 2) }));
  await sleep(20);
  expect(rows().join("\n")).toBe(before);
});

test("arrows nudge the selected part under Move, and Delete removes it", async () => {
  editor.tool = "move";
  selectNode(["door"]);
  await sleep(20);
  key("ArrowRight");
  key("ArrowDown", { shiftKey: true });
  await sleep(20);
  const part = editor.sprite.parts![0];
  expect(part.x).toBe(5);
  expect(part.y).toBe(10);
  key("Backspace");
  await sleep(20);
  expect(editor.sprite.parts ?? []).toHaveLength(0);
});

test("comma and period step frames whatever is selected", async () => {
  editor.tool = "select";
  loadSprite(
    {
      ...structuredClone(sprite()),
      frames: [
        ["BBBB....", "........", "........", "........"],
        ["KKKK....", "........", "........", "........"],
      ],
    },
    "car.json",
  );
  await sleep(30);
  selectBox({ x: 0, y: 0 }, { x: 1, y: 0 });
  await sleep(20);
  key(".");
  expect(editor.frame).toBe(1);
  key(",");
  expect(editor.frame).toBe(0);
});

test("a picker sweep is one undo entry", async () => {
  const undos = history.undo;
  // As the picker emits: the first value fresh, the rest riding the same entry.
  setColour("B", "#ff1000", true);
  setColour("B", "#ff2000", false);
  setColour("B", "#ff3000", false);
  setColour("B", "#ff4000", false);
  expect(editor.sprite.palette.B).toBe("#ff4000");
  expect(history.undo).toBe(undos + 1);
});

test("keys do not reach the editor while a dialog is up", async () => {
  editor.dirty = true;
  // Open the New Sprite dialog from the header.
  const newButton = [...app.host.querySelectorAll("header button")].find(
    (b) => b.textContent?.trim() === "New…",
  ) as HTMLButtonElement;
  newButton.click();
  await sleep(60);
  const before = editor.tool;
  key("b");
  key("e");
  await sleep(20);
  expect(editor.tool).toBe(before);
  // Escape closes the dialog (through the box's own handler when focused, or
  // the app-level guard simply swallows it — either way, no tool switch).
  document.activeElement?.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await sleep(40);
});

test("a selection flips in place, floating like a paste", async () => {
  editor.tool = "select";
  const { flipSelection } = await import("../lib/editor.svelte");
  selectBox({ x: 0, y: 0 }, { x: 3, y: 1 });
  await sleep(30);
  const undos = history.undo;
  flipSelection("v");
  await sleep(20);
  expect(rows()[0]).toBe("KKKK....");
  expect(rows()[1]).toBe("BBBB....");
  // One entry, like a move — undo takes the whole flip back.
  expect(history.undo).toBe(undos + 1);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true }));
  await sleep(20);
  expect(rows()[0]).toBe("BBBB....");
});

test("a whole node with parts refuses to flip; one without flips every frame", async () => {
  const { flipNode } = await import("../lib/editor.svelte");
  expect(flipNode("h")).toBe(false); // the car has a door
  loadSprite({ name: "solo", w: 2, h: 1, palette: { B: "#ff0000" }, frames: [["B."]] }, "s.json");
  await sleep(20);
  expect(flipNode("h")).toBe(true);
  expect(editor.sprite.frames[0][0]).toBe(".B");
});

test("a use part can be re-pointed and inlined", async () => {
  const { inlinePart, usePartInstead, sheet } = await import("../lib/editor.svelte");
  sheet.byName = {
    wheel: { name: "wheel", w: 2, h: 1, palette: { W: "#ffffff" }, frames: [["WW"]] },
    spoke: { name: "spoke", w: 1, h: 1, palette: { S: "#888888" }, frames: [["S"]] },
  };
  loadSprite(
    {
      name: "cart",
      w: 4,
      h: 2,
      palette: { B: "#ff0000" },
      frames: [["BBBB", "...."]],
      parts: [{ name: "w1", x: 0, y: 1, use: "wheel" }],
    },
    "cart.json",
  );
  await sleep(20);
  usePartInstead(["w1"], "spoke");
  expect((editor.sprite.parts![0] as { use: string }).use).toBe("spoke");
  expect(inlinePart(["w1"])).toBe(true);
  const p = editor.sprite.parts![0] as { frames: string[][]; use?: string };
  expect(p.use).toBeUndefined();
  expect(p.frames[0][0]).toBe("S");
});

test("removing the frame a clip lived on stops the preview naming a dead clip", async () => {
  const { addClip, removeFrame } = await import("../lib/editor.svelte");
  loadSprite(
    { name: "two", w: 1, h: 1, palette: { B: "#ff0000" }, frames: [["B"], ["."]] },
    "two.json",
  );
  await sleep(20);
  editor.frame = 1;
  addClip("blink"); // [1]
  expect(editor.clip).toBe("blink");
  removeFrame(1); // the clip's only frame goes; core drops the clip
  await sleep(20);
  expect(editor.sprite.clips?.blink).toBeUndefined();
  expect(editor.clip).toBe(null);
});

test("opening another sprite resets variant, clip and the play head", async () => {
  const { addClip, addVariant } = await import("../lib/editor.svelte");
  addVariant("night");
  addClip("idle");
  editor.playing = true;
  expect(editor.variant).toBe("night");
  expect(editor.clip).toBe("idle");
  loadSprite({ name: "b", w: 1, h: 1, palette: {}, frames: [["."]] }, "b.json");
  await sleep(20);
  expect(editor.variant).toBe(null);
  expect(editor.clip).toBe(null);
  expect(editor.playing).toBe(false);
});

test("the palette sweeps its rotation residue in one undo", async () => {
  const { removeUnusedColours, undoEdit } = await import("../lib/editor.svelte");
  loadSprite(
    {
      name: "spun",
      w: 2,
      h: 1,
      palette: { A: "#ff0000", B: "#00ff00", C: "#0000ff", D: "#ffff00" },
      frames: [["AA"]],
    },
    "spun.json",
  );
  await sleep(20);
  expect(removeUnusedColours()).toBe(3);
  expect(Object.keys(editor.sprite.palette)).toEqual(["A"]);
  // One edit, one undo.
  undoEdit();
  expect(Object.keys(editor.sprite.palette)).toEqual(["A", "B", "C", "D"]);
  // Nothing unused, nothing swept.
  undoEdit();
  expect(removeUnusedColours()).toBe(3);
});
