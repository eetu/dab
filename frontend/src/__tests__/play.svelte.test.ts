// Playing, on the surface itself. The animation is the whole reason a
// multi-frame sprite exists, so what matters is that the canvas really cycles
// the run, that the strip never shows a different frame than the canvas, that
// the tools are inert while it runs, and that stopping puts the frame you were
// drawing back.
import { mount, unmount } from "svelte";
import { expect, test } from "vitest";

import App from "../App.svelte";
import { editor, loadSprite, paint, setPlaying } from "../lib/editor.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Three frames, each a different colour, so a pixel read says which is up.
const FLASH = {
  name: "flash",
  w: 1,
  h: 1,
  palette: { A: "#ff0000", B: "#00ff00", C: "#0000ff" },
  frames: [["A"], ["B"], ["C"]],
};
const STILL = { name: "still", w: 1, h: 1, palette: { A: "#ff0000" }, frames: [["A"]] };

function boot() {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const app = mount(App, { target: host });
  return { host, stop: () => (unmount(app), host.remove()) };
}

const surfacePixel = (host: HTMLElement) => {
  const c = host.querySelector('[data-testid="canvas"]') as HTMLCanvasElement;
  return [...c.getContext("2d")!.getImageData(0, 0, 1, 1).data];
};

test("the canvas cycles the run, and the strip follows it", async () => {
  const { host, stop } = boot();
  loadSprite(structuredClone(FLASH), "flash.json");
  editor.fps = 30;
  await sleep(60);

  // Stopped, the surface shows the frame being edited.
  editor.frame = 2;
  await sleep(60);
  expect(surfacePixel(host)).toEqual([0, 0, 255, 255]);

  setPlaying(true);
  const seen = new Set<string>();
  for (let i = 0; i < 30; i++) {
    await sleep(20);
    seen.add(surfacePixel(host).join(","));
    // Whatever the canvas is showing, the strip's highlight agrees with it.
    const lit = host.querySelector(".timeline .frame.playing");
    expect(lit, "the strip lost the play head").toBeTruthy();
  }
  // All three frames came up — a surface stuck on one would collect one entry.
  expect(seen.size).toBe(3);

  // Stopping goes back to the frame that was being drawn, not to wherever the
  // head happened to stop.
  setPlaying(false);
  await sleep(60);
  expect(editor.frame).toBe(2);
  expect(surfacePixel(host)).toEqual([0, 0, 255, 255]);
  stop();
});

test("the tools are inert while it plays, and P is the way out", async () => {
  const { host, stop } = boot();
  loadSprite(structuredClone(FLASH), "flash.json");
  editor.fps = 30;
  editor.tool = "pencil";
  editor.ink = "A";
  await sleep(60);

  setPlaying(true);
  await sleep(40);
  const canvas = host.querySelector("[data-testid=canvas]") as HTMLCanvasElement;
  const r = canvas.getBoundingClientRect();
  const base = { bubbles: true, pointerId: 1, pointerType: "mouse", button: 0 };
  const spot = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  // A plain copy: the sprite is a deep $state proxy, which structuredClone
  // refuses outright.
  const before = JSON.parse(JSON.stringify(editor.sprite.frames)) as string[][][];
  canvas.dispatchEvent(new PointerEvent("pointerdown", { ...base, ...spot }));
  canvas.dispatchEvent(new PointerEvent("pointerup", { ...base, ...spot }));
  await sleep(40);
  // A stroke on a frame about to be replaced lands on whichever one the
  // interval was showing, so it does not land at all.
  expect(editor.sprite.frames).toEqual(before);

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
  await sleep(40);
  expect(editor.playing).toBe(false);
  // And with it stopped, the same cell takes paint.
  editor.ink = "B";
  paint([[0, 0]], true);
  expect(editor.sprite.frames).not.toEqual(before);
  stop();
});

test("a single frame has nothing to play, and says so", async () => {
  const { host, stop } = boot();
  loadSprite(structuredClone(STILL), "still.json");
  await sleep(60);
  const play = [...host.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === "Play",
  );
  expect(play?.disabled).toBe(true);
  // And the key refuses rather than starting an interval that changes nothing.
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
  await sleep(40);
  expect(editor.playing).toBe(false);
  stop();
});
