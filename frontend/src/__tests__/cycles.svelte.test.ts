// Colour cycling: a run of palette entries rotated, one variant per phase.
//
// The phase arithmetic is tested in core. What is only checkable here is the
// hand: a shift-clicked run of swatches becomes one cycle, a single frame whose
// colours cycle plays on the surface, and the cycle follows the palette.
import { cellColour } from "dab-core";
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import {
  canPlay,
  editor,
  loadSprite,
  removeCycle,
  setColour,
  setPlaying,
  undoEdit,
} from "../lib/editor.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One frame of three colours, so the cell at x reads which phase is up. */
const WATER = () => ({
  name: "water",
  w: 3,
  h: 1,
  palette: { A: "#ff0000", B: "#00ff00", C: "#0000ff" },
  frames: [["ABC"]],
});

let host: HTMLElement;
beforeEach(async () => {
  host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const app = mount(App, { target: host });
  await sleep(40);
  loadSprite(structuredClone(WATER()), "water.json");
  editor.fps = 30;
  await sleep(40);
  return () => {
    setPlaying(false);
    unmount(app);
    host.remove();
  };
});

const swatch = (ch: string) => host.querySelector(`[data-swatch="${ch}"]`) as HTMLElement;
const button = (text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) ?? null;
const surfacePixel = () => {
  const c = host.querySelector('[data-testid="canvas"]') as HTMLCanvasElement;
  return [...c.getContext("2d")!.getImageData(0, 0, 1, 1).data.slice(0, 3)].join(",");
};

/** Click A, shift-click C, and press the button the run brings up. */
async function cycleAToC() {
  swatch("A").click();
  swatch("C").dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
  await sleep(20);
  button("Cycle these")!.click();
  await sleep(20);
}

test("a shift-clicked run of swatches becomes one cycle, shown on its first phase", async () => {
  expect(button("Cycle these")).toBeNull();
  await cycleAToC();
  expect(Object.keys(editor.sprite.variants!)).toEqual([
    "cycle A–C 1",
    "cycle A–C 2",
    "cycle A–C 3",
  ]);
  expect(editor.variant).toBe("cycle A–C 1");
  // One row in the Variants panel, not three.
  expect(host.querySelectorAll('[aria-label^="Show cycle"]')).toHaveLength(1);
  expect(host.querySelectorAll('[aria-label^="Show variant"]')).toHaveLength(0);
  // The run is spent: taking another starts from a fresh click.
  expect(button("Cycle these")).toBeNull();
});

test("a single frame whose colours cycle plays, and stopping puts back the phase", async () => {
  expect(canPlay()).toBe(false);
  await cycleAToC();
  expect(canPlay()).toBe(true);
  setPlaying(true);
  expect(editor.playing).toBe(true);
  const seen = new Set<string>();
  for (let i = 0; i < 20; i++) {
    seen.add(surfacePixel());
    await sleep(25);
  }
  // Cell A shows red, then C's blue, then B's green, as the colours turn.
  expect(seen).toEqual(new Set(["255,0,0", "0,0,255", "0,255,0"]));
  expect(host.textContent).toMatch(/cycle A–C/);
  setPlaying(false);
  await sleep(40);
  expect(surfacePixel()).toBe("255,0,0");
});

test("a palette edit reaches every phase", async () => {
  await cycleAToC();
  setColour("A", "#ffffff");
  expect(cellColour(editor.sprite, "A", "cycle A–C 1")).toBe("#ffffff");
  expect(cellColour(editor.sprite, "B", "cycle A–C 2")).toBe("#ffffff");
  expect(cellColour(editor.sprite, "C", "cycle A–C 3")).toBe("#ffffff");
});

test("a cycle goes as one undo entry, and the view lets go of it", async () => {
  await cycleAToC();
  removeCycle("cycle A–C");
  expect(editor.sprite.variants).toBeUndefined();
  expect(editor.variant).toBeNull();
  undoEdit();
  expect(Object.keys(editor.sprite.variants!)).toHaveLength(3);
});
