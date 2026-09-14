// The onion skin, and the one mode it has to keep out of.
//
// Duplicating a frame and then turning it put the SAME art on screen twice: the
// turned frame, and the untouched copy behind it at 28%. It reads as one frame
// holding both, which is exactly what it is.
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import {
  applyTurn,
  beginTurn,
  cancelTurn,
  duplicateFrame,
  editor,
  loadSprite,
  setTurn,
  turning,
} from "../lib/editor.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A block in the top-left quarter, so a quarter turn moves it somewhere the
 *  original was not — and the original's corner is a place to look. */
const BLOCK = {
  name: "block",
  w: 4,
  h: 4,
  palette: { A: "#ff0000" },
  frames: [["AA..", "AA..", "....", "...."]],
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
  loadSprite(structuredClone(BLOCK), "block.json");
  editor.onion = true;
  await sleep(60);
  return () => {
    if (turning.on) cancelTurn();
    editor.onion = false;
    stop();
  };
});

const pixel = (x: number, y: number) => {
  const c = host.querySelector('[data-testid="canvas"]') as HTMLCanvasElement;
  return [...c.getContext("2d")!.getImageData(x, y, 1, 1).data];
};

test("the frame behind is still there while drawing", async () => {
  duplicateFrame();
  await sleep(40);
  expect(editor.frame).toBe(1);
  // The copy is identical, so the onion falls exactly under the art. Erase the
  // corner of the frame being edited and the ghost of the one behind remains.
  const { paint } = await import("../lib/editor.svelte");
  editor.tool = "eraser";
  paint([[0, 0]], true);
  await sleep(60);
  const [, , , alpha] = pixel(0, 0);
  expect(alpha, "the onion skin is not drawing").toBeGreaterThan(0);
  expect(alpha, "the onion skin is drawing at full strength").toBeLessThan(200);
});

test("and it keeps out of a turn, which is where it read as one frame", async () => {
  duplicateFrame();
  await sleep(40);
  beginTurn(true);
  // A quarter turn: the block lands in the top-right, and nothing of the
  // original's top-left corner should be left on screen.
  setTurn(90);
  await sleep(80);
  expect(pixel(0, 0)[3], "the frame behind is showing through the turn").toBe(0);
  applyTurn();
  await sleep(40);
  // Applied, the onion comes back — the previous frame is a real neighbour again.
  expect(pixel(0, 0)[3]).toBeGreaterThan(0);
});
