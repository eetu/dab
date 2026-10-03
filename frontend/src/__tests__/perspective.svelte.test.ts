// The perspective brush: the clipboard laid on a plane, stamped per click.
//
// The geometry is tested in core. What is only checkable here is the mode: it
// needs a brush and says so, a stamp is one undo entry, the plane really is a
// floor on the canvas, and while it is up a click is a stamp and nothing else.
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import {
  beginPerspective,
  clearSelection,
  clipboard,
  copySelection,
  editor,
  history,
  loadSprite,
  perspective,
  selectBox,
  setPlane,
  setTool,
  stampPerspective,
  undoEdit,
} from "../lib/editor.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A 4×4 checker in the corner of an empty field: the brush to copy. */
const FIELD = () => {
  const empty = ".".repeat(24);
  return {
    name: "field",
    w: 24,
    h: 16,
    palette: { R: "#c03020", Y: "#e0c040" },
    frames: [
      [
        "RYRY" + empty.slice(4),
        "YRYR" + empty.slice(4),
        "RYRY" + empty.slice(4),
        "YRYR" + empty.slice(4),
        ...Array<string>(12).fill(empty),
      ],
    ],
  };
};
const TILE = ["RYRY", "YRYR", "RYRY", "YRYR"];

let host: HTMLElement;
beforeEach(async () => {
  host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const app = mount(App, { target: host });
  await sleep(40);
  loadSprite(structuredClone(FIELD()), "field.json");
  clipboard.stamp = null;
  await sleep(40);
  return () => {
    unmount(app);
    host.remove();
  };
});

/** Copy the tile as the brush, and pick it up. */
function pickUp() {
  selectBox({ x: 0, y: 0 }, { x: 3, y: 3 });
  copySelection();
  clearSelection();
  beginPerspective();
}

const frame = () => editor.sprite.frames[0];
const painted = () => frame().join("").replace(/\./g, "").length;

test("with nothing copied there is no brush, and the status says so", () => {
  beginPerspective();
  expect(perspective.on).toBe(false);
  expect(editor.status).toMatch(/copy something first/);
  expect(editor.statusBad).toBe(true);
});

test("a plane facing you stamps the brush as it is, one undo entry a click", () => {
  pickUp();
  expect(perspective.on).toBe(true);
  setPlane({ tilt: 0, turn: 0, spin: 0 });
  const before = history.undo;
  stampPerspective({ x: 12, y: 8 });
  expect(history.undo).toBe(before + 1);
  expect(
    frame()
      .slice(6, 10)
      .map((r) => r.slice(10, 14)),
  ).toEqual(TILE);
  undoEdit();
  expect(
    frame()
      .slice(6, 10)
      .map((r) => r.slice(10, 14)),
  ).toEqual(["....", "....", "....", "...."]);
  expect(perspective.on).toBe(true);
});

test("on a floor, the brush lands bigger near you than toward the horizon", () => {
  pickUp();
  setPlane({ tilt: 60, turn: 0, spin: 0, distance: 24 });
  const base = painted();
  stampPerspective({ x: 12, y: 14 });
  const near = painted() - base;
  undoEdit();
  stampPerspective({ x: 12, y: 6 });
  const far = painted() - base;
  expect(near).toBeGreaterThan(far);
  expect(far).toBeGreaterThan(0);
});

test("a brush thinner than a pixel is refused, not committed as nothing", () => {
  pickUp();
  setPlane({ tilt: 80, turn: 0, spin: 0, distance: 24 });
  const before = history.undo;
  // Leaned 80°, two rows above the anchor the brush is a fifth of a pixel deep
  // — between even a crisp stamp's sixteen samples.
  stampPerspective({ x: 12, y: 6 });
  expect(history.undo).toBe(before);
  expect(editor.status).toMatch(/under a pixel/);
});

test("past the horizon there is nothing to stamp on, and it says so", () => {
  pickUp();
  setPlane({ tilt: 80, turn: 0, spin: 0, distance: 8 });
  const was = editor.sprite;
  stampPerspective({ x: 12, y: 0 });
  expect(editor.sprite).toBe(was);
  expect(editor.status).toMatch(/horizon/);
});

test("on the canvas a click is a stamp, the tools are inert, and Escape puts it down", async () => {
  pickUp();
  setPlane({ tilt: 0, turn: 0, spin: 0 });
  await sleep(40);
  const canvas = host.querySelector('[data-testid="canvas"]') as HTMLCanvasElement;
  const r = canvas.getBoundingClientRect();
  const at = (x: number, y: number) => ({
    clientX: r.left + ((x + 0.5) / 24) * r.width,
    clientY: r.top + ((y + 0.5) / 16) * r.height,
  });
  const base = { bubbles: true, pointerId: 1, pointerType: "mouse", button: 0 };
  canvas.dispatchEvent(new PointerEvent("pointerdown", { ...base, ...at(12, 8) }));
  canvas.dispatchEvent(new PointerEvent("pointerup", { ...base, ...at(12, 8) }));
  expect(
    frame()
      .slice(6, 10)
      .map((row) => row.slice(10, 14)),
  ).toEqual(TILE);
  const tool = editor.tool;
  setTool(tool === "pencil" ? "eraser" : "pencil");
  expect(editor.tool).toBe(tool);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(perspective.on).toBe(false);
  await sleep(20);
  expect(host.querySelector('[aria-label="Perspective"]')).toBeNull();
});
