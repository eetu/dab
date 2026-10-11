// The 3D panel and the slices it shows: a sprite in depth, its grid in front and its
// slices behind. What matters is that only a sprite with slices has the panel, that it
// shows the slices in their order and follows a stroke on any of them, that a slice is
// drawn on like any node, that a colour taken out while one is in hand is taken out of
// them all, and that a drag turns it and is remembered.
import { slicePath } from "dab-core";
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import {
  addSlice,
  editor,
  loadSprite,
  paint,
  removeColour,
  selectNode,
} from "../lib/editor.svelte";
import { panels, setVoxelOrbit, toggleFold } from "../lib/panels.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A box three voxels deep: blue in front, a green ring behind it, red at the back. */
const ring = ["GGGGG", "G...G", "G...G", "G...G", "GGGGG"];
const full = (c: string) => Array.from({ length: 5 }, () => c.repeat(5));
const CUBE = {
  name: "cube",
  w: 5,
  h: 5,
  palette: { R: "#ff0000", G: "#00ff00", B: "#0000ff" },
  frames: [full("B")],
  slices: [{ frames: [ring] }, { frames: [full("R")] }],
};

let host: HTMLElement;
let stop: () => void;

const unfold = (open: boolean) => {
  if (!panels.folded.voxels !== open) toggleFold("voxels");
};

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
  loadSprite(structuredClone(CUBE), "cube.json");
  setVoxelOrbit({ yaw: 0, pitch: 0 });
  await sleep(60);
  return () => {
    unfold(false);
    stop();
  };
});

const art = () => host.querySelector('[data-testid="voxels-canvas"]') as HTMLCanvasElement | null;
/** The colour at the middle of the view. */
const middle = () => {
  const c = art()!;
  return [...c.getContext("2d")!.getImageData(c.width >> 1, c.height >> 1, 1, 1).data];
};
const panel = () => host.querySelector('[data-testid="voxels"]');

test("only a sprite in depth has the panel; folded until asked for, then as wide as the column", async () => {
  loadSprite({ ...structuredClone(CUBE), slices: undefined }, "flat.json");
  unfold(true);
  await sleep(60);
  expect(art(), "a flat sprite has no 3D panel").toBeNull();
  loadSprite(structuredClone(CUBE), "cube.json");
  unfold(false);
  await sleep(40);
  expect(art(), "folded, it draws nothing").toBeNull();
  unfold(true);
  await sleep(60);
  const c = art()!;
  const room = (panel() as HTMLElement).clientWidth;
  // Whole pixels a voxel, as many as fit a turn of it: one more would not.
  const diagonal = Math.hypot(5, 5, 3);
  const scale = Math.floor(room / Math.ceil(diagonal));
  expect(c.width).toBe(Math.ceil(diagonal * scale));
  expect((scale + 1) * Math.ceil(diagonal)).toBeGreaterThan(room);
});

test("shows the front square on, and what is behind it once it is drawn away", async () => {
  unfold(true);
  await sleep(60);
  const [r, g, b, a] = middle();
  expect(a).toBe(255);
  expect(b, "square on, the front is what shows").toBeGreaterThan(Math.max(r, g));
  // Erase the middle of the front: through the green ring's hole, the back.
  editor.tool = "eraser";
  paint([[2, 2]], true);
  await sleep(60);
  const [r2, g2, b2] = middle();
  expect(r2, "the view follows the stroke").toBeGreaterThan(Math.max(g2, b2));
});

test("a slice is drawn on like any node, and the view follows it", async () => {
  unfold(true);
  await sleep(60);
  editor.tool = "eraser";
  paint([[2, 2]], true);
  // Close the ring's hole from slice 1, in green.
  selectNode(slicePath(1));
  await sleep(40);
  editor.tool = "pencil";
  editor.ink = "G";
  paint([[2, 2]], true);
  await sleep(60);
  expect(editor.sprite.slices?.[0].frames[0][2]).toBe("G.G.G");
  const [r, g, b] = middle();
  expect(g, "the slice behind the front shows through it").toBeGreaterThan(Math.max(r, b));
});

test("a slice added from its menu is a copy to draw over; a colour taken out goes from them all", async () => {
  addSlice();
  await sleep(40);
  expect(editor.sprite.slices?.length).toBe(3);
  expect(editor.path).toEqual(slicePath(3));
  expect(editor.sprite.slices?.[2].frames).toEqual([full("R")]);
  // With a slice in hand, the palette is the sprite's: taking green out takes it out of the ring.
  selectNode(slicePath(2));
  removeColour("G");
  await sleep(20);
  expect(editor.sprite.palette.G).toBeUndefined();
  expect(editor.sprite.slices?.[0].frames[0][0]).toBe(".....");
});

test("a drag in it turns it, and where it looks from is remembered", async () => {
  unfold(true);
  await sleep(60);
  const c = art()!;
  const before = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data.join();
  const box = c.getBoundingClientRect();
  const at = (dx: number) => ({
    clientX: box.left + box.width / 2 + dx,
    clientY: box.top + box.height / 2,
    pointerId: 1,
    bubbles: true,
  });
  c.dispatchEvent(new PointerEvent("pointerdown", at(0)));
  c.dispatchEvent(new PointerEvent("pointermove", at(60)));
  c.dispatchEvent(new PointerEvent("pointerup", at(60)));
  await sleep(60);
  const after = art()!.getContext("2d")!.getImageData(0, 0, c.width, c.height).data.join();
  expect(after, "turned, it shows something else").not.toBe(before);
  expect(panels.voxels.yaw).toBeCloseTo(60 * 0.012, 5);
});
