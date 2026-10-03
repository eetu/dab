// The palette under a real hand: presses land off-centre and wobble a pixel.

import { mount, unmount } from "svelte";
import { expect, test } from "vitest";

import App from "../App.svelte";
import { editor, history, loadSprite, undoEdit } from "../lib/editor.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("a swatch click near its edge, with a pixel of jitter, still picks the colour", async () => {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const app = mount(App, { target: host });
  await sleep(40);
  loadSprite(
    {
      name: "two",
      w: 4,
      h: 4,
      palette: { A: "#ff0000", B: "#00ff00" },
      frames: [["AAAA", "....", "....", "...."]],
    },
    "two.json",
  );
  await sleep(80);
  const el = host.querySelector<HTMLElement>(`[data-swatch="B"]`)!;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width - 4;
  const y = r.top + r.height - 4;
  const base = { bubbles: true, pointerId: 1, pointerType: "mouse", button: 0 };
  el.dispatchEvent(new PointerEvent("pointerdown", { ...base, clientX: x, clientY: y }));
  el.dispatchEvent(new PointerEvent("pointermove", { ...base, clientX: x + 1, clientY: y }));
  el.dispatchEvent(new PointerEvent("pointerup", { ...base, clientX: x + 1, clientY: y }));
  el.click();
  await sleep(20);
  expect(editor.ink).toBe("B");
  unmount(app);
  host.remove();
});

test("a palette file lands on the free characters, as one undo entry", async () => {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const app = mount(App, { target: host });
  await sleep(40);
  loadSprite({ name: "one", w: 1, h: 1, palette: { A: "#ff0000" }, frames: [["A"]] }, "one.json");
  await sleep(40);
  const input = host.querySelector<HTMLInputElement>('[data-testid="palette-file"]')!;
  const gpl =
    "GIMP Palette\nName: sky\n#\n255   0   0\tred\n  0 128 255\tsky\n 20  20  40\tnight\n";
  const files = new DataTransfer();
  files.items.add(new File([gpl], "sky.gpl", { type: "text/plain" }));
  input.files = files.files;
  const before = history.undo;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(40);
  // The red was already there; the other two take the next characters.
  expect(editor.sprite.palette).toEqual({ A: "#ff0000", B: "#0080ff", C: "#141428" });
  expect(editor.status).toBe("+2 colours from sky.gpl — 1 already here or past the last character");
  expect(history.undo).toBe(before + 1);
  undoEdit();
  expect(editor.sprite.palette).toEqual({ A: "#ff0000" });
  unmount(app);
  host.remove();
});
