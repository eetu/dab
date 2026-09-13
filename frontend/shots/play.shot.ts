// The play mode: the sprite moving on the surface it was drawn on.
//
// What the picture has to show is that the furniture is gone — no grid, no
// selection, no part boxes — because that is the whole claim: what is on screen
// while it plays is what the game draws.
import { expect, onTestFinished, test } from "vitest";

import {
  editor,
  loadSprite,
  selectAll,
  selectNode,
  setPlaying,
  sheet,
} from "../src/lib/editor.svelte";
import { EXAMPLE_SHEET, exampleCar } from "../src/lib/examples";
import { setLoupeCorner, setLoupeZoom, toggleLoupe } from "../src/lib/panels.svelte";
import { open, SPRITES } from "./rig";

test("a wheel spinning, with the bar that stops it", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(() => {
    setPlaying(false);
    rig.stop();
  });
  const rows = SPRITES.wheel().frames[0];
  loadSprite(
    {
      ...SPRITES.wheel(),
      name: "spinner",
      frames: [rows, rows, rows, rows],
      animations: { spin: [0, 1, 2, 3] },
    },
    "spinner.json",
  );
  await rig.settle(150);
  // A grid and a selection that the mode has to put away.
  editor.grid = true;
  editor.animation = "spin";
  selectAll();
  await rig.settle(100);
  setPlaying(true);
  await rig.settle(200);
  expect(document.querySelector('[aria-label="Playing"]'), "no play bar").toBeTruthy();
  expect(document.querySelector(".ants"), "the marquee outlived the mode").toBeNull();
  await rig.shot("20-playing");
});

test("the loupe: the car at ×1 while the canvas is at ×9", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(() => {
    toggleLoupe(false);
    rig.stop();
  });
  sheet.byName = { ...EXAMPLE_SHEET };
  loadSprite(exampleCar(), null);
  await rig.settle(150);
  toggleLoupe(true);
  await rig.settle(150);
  const art = document.querySelector('[data-testid="loupe-canvas"]') as HTMLCanvasElement;
  expect(art, "no loupe").toBeTruthy();
  // ×1 means ×1: the box is the sprite's own pixels, not a scaled picture.
  expect(art.getBoundingClientRect().width).toBeCloseTo(editor.sprite.w, 0);
  await rig.shot("22-loupe");
});

test("the loupe bigger, in another corner", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(() => {
    toggleLoupe(false);
    setLoupeZoom(1);
    setLoupeCorner("br");
    rig.stop();
  });
  sheet.byName = { ...EXAMPLE_SHEET };
  loadSprite(exampleCar(), null);
  await rig.settle(150);
  toggleLoupe(true);
  setLoupeZoom(4);
  setLoupeCorner("tr");
  await rig.settle(150);
  await rig.shot("23-loupe-x4");
});

test("the car's lights playing, parts and all", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(() => {
    setPlaying(false);
    rig.stop();
  });
  sheet.byName = { ...EXAMPLE_SHEET };
  loadSprite(exampleCar(), null);
  await rig.settle(150);
  selectNode(["lights"]);
  await rig.settle(100);
  setPlaying(true);
  await rig.settle(200);
  expect(editor.playing, "the lights have more than one frame").toBe(true);
  await rig.shot("21-playing-part");
});
