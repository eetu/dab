// The palette under a real hand: presses land off-centre and wobble a pixel.

import { mount, unmount } from "svelte";
import { expect, test } from "vitest";

import App from "../App.svelte";
import { editor, loadSprite } from "../lib/editor.svelte";

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
