// The tiling preview: the stage wrapped 3×3, so a tile's seams show while
// they are drawn. What matters is that the copies are the art (and only the
// art), the middle is left to the stage itself, and the toggle is a desk pref.
import { mount, unmount } from "svelte";
import { expect, test } from "vitest";

import App from "../App.svelte";
import { editor, loadSprite } from "../lib/editor.svelte";
import { recallPrefs } from "../lib/persist";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("tiling draws the art round the stage, leaves the middle, and is remembered", async () => {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const app = mount(App, { target: host });
  await sleep(40);
  loadSprite(
    { name: "brick", w: 2, h: 2, palette: { R: "#c03020" }, frames: [["R.", ".R"]] },
    "brick.json",
  );
  expect(host.querySelector('[data-testid="tiles"]')).toBeNull();
  editor.tile = true;
  await sleep(60);
  const tiles = host.querySelector('[data-testid="tiles"]') as HTMLCanvasElement;
  expect([tiles.width, tiles.height]).toEqual([6, 6]);
  const g = tiles.getContext("2d")!;
  const at = (x: number, y: number) => [...g.getImageData(x, y, 1, 1).data.slice(0, 4)];
  // Top-left copy: its R at (0,0), its gap at (1,0).
  expect(at(0, 0)).toEqual([192, 48, 32, 255]);
  expect(at(1, 0)[3]).toBe(0);
  // Bottom-right copy, and the middle left for the stage to draw.
  expect(at(5, 5)).toEqual([192, 48, 32, 255]);
  expect(at(2, 2)[3]).toBe(0);
  await sleep(20);
  expect(recallPrefs().tile).toBe(true);
  editor.tile = false;
  unmount(app);
  host.remove();
});
