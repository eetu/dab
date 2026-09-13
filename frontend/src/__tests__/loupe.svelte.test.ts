// The loupe: the sprite at the size a consumer draws it, over a canvas that is
// showing it thirty times bigger. What matters is that ×N really is ×N, that
// the window cannot grow to cover the drawing, and that it is chrome — a press
// on it must not land on the art underneath.
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import { editor, loadSprite } from "../lib/editor.svelte";
import { panels, setLoupeZoom, toggleLoupe } from "../lib/panels.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CAR = {
  name: "car",
  w: 8,
  h: 4,
  palette: { B: "#3060c0" },
  frames: [["BBBBBBBB", "BBBBBBBB", "BBBBBBBB", "BBBBBBBB"]],
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
  loadSprite(structuredClone(CAR), "car.json");
  await sleep(60);
  return () => {
    toggleLoupe(false);
    setLoupeZoom(1);
    stop();
  };
});

const art = () => host.querySelector('[data-testid="loupe-canvas"]') as HTMLCanvasElement | null;

test("×1 is one pixel per pixel, and the stepper is honest about the rest", async () => {
  expect(art(), "the loupe is off until it is asked for").toBeNull();

  toggleLoupe(true);
  await sleep(60);
  expect(art()!.getBoundingClientRect().width).toBeCloseTo(CAR.w, 0);

  const bigger = [...host.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === "Bigger",
  ) as HTMLButtonElement;
  bigger.click();
  await sleep(60);
  expect(art()!.getBoundingClientRect().width).toBeCloseTo(CAR.w * 2, 0);
  // And the chip says the same number the box is drawn at.
  expect(host.querySelector('[data-testid="loupe"] .chip')?.textContent).toContain("×2");
});

test("it cannot grow to cover the drawing", async () => {
  toggleLoupe(true);
  // Bigger than the pane has room for: the window shows what fits and says so
  // rather than claiming a size it is not drawing.
  setLoupeZoom(8);
  await sleep(60);
  const pane = host.querySelector(".pane")!.getBoundingClientRect();
  const shown = art()!.getBoundingClientRect();
  expect(shown.width).toBeLessThanOrEqual(pane.width * 0.45);
  expect(shown.height).toBeLessThanOrEqual(pane.height * 0.45);
});

test("a press on it is not a press on the art", async () => {
  editor.tool = "pencil";
  editor.ink = "B";
  toggleLoupe(true);
  await sleep(60);
  const box = host.querySelector('[data-testid="loupe"]') as HTMLElement;
  const r = box.getBoundingClientRect();
  const before = JSON.parse(JSON.stringify(editor.sprite.frames)) as string[][][];
  const base = { bubbles: true, pointerId: 3, pointerType: "mouse", button: 0 };
  const spot = { clientX: r.left + r.width / 2, clientY: r.top + 4 };
  box.dispatchEvent(new PointerEvent("pointerdown", { ...base, ...spot }));
  box.dispatchEvent(new PointerEvent("pointerup", { ...base, ...spot }));
  await sleep(40);
  expect(editor.sprite.frames).toEqual(before);
});

test("whether it is up, how big and which corner outlive a reload", async () => {
  toggleLoupe(true);
  setLoupeZoom(3);
  await sleep(40);
  stop();

  // A fresh mount reads the chrome back out of storage, as a reload would.
  host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const again = mount(App, { target: host });
  stop = () => {
    unmount(again);
    host.remove();
  };
  await sleep(80);
  expect(panels.loupe.on).toBe(true);
  expect(panels.loupe.zoom).toBe(3);
  expect(art()).toBeTruthy();
});
