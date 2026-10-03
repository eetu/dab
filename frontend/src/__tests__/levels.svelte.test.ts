// Levels of detail: one subject drawn at more than one size.
//
// Deriving and the lockstep rules are tested in core. What is only checkable
// here is the editor around them: a level is drawn alone on the canvas, the
// frame and animation verbs keep every size in step from wherever they are
// pressed, and the loupe lays the sizes side by side.
import { levelPath, validateSprite } from "dab-core";
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import {
  addAnimation,
  addFrame,
  addLevel,
  addPart,
  editor,
  history,
  loadSprite,
  selectNode,
  stageNode,
  undoEdit,
} from "../lib/editor.svelte";
import { openLevelDialog } from "../lib/newlevel.svelte";
import { toggleLoupe } from "../lib/panels.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DEER = () => ({
  name: "deer",
  w: 8,
  h: 8,
  palette: { A: "#8a5a2a", B: "#e8d8b8" },
  animations: { walk: [0, 1] },
  frames: [
    [
      "..AAAA..",
      ".AAAAAA.",
      ".AABBAA.",
      ".AABBAA.",
      ".AAAAAA.",
      "..A..A..",
      "..A..A..",
      "..A..A..",
    ],
    [
      "..AAAA..",
      ".AAAAAA.",
      ".AABBAA.",
      ".AABBAA.",
      ".AAAAAA.",
      ".A....A.",
      ".A....A.",
      "A......A",
    ],
  ],
});

let host: HTMLElement;
beforeEach(async () => {
  host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const app = mount(App, { target: host });
  await sleep(40);
  loadSprite(structuredClone(DEER()), "deer.json");
  await sleep(40);
  return () => {
    toggleLoupe(false);
    unmount(app);
    host.remove();
  };
});

test("a level is derived from the sprite and drawn alone at its own size", async () => {
  expect(addLevel("far", 4, 4)).toBe("far");
  selectNode(levelPath("far"));
  await sleep(40);
  expect(stageNode()).toBe(editor.sprite.levels![0]);
  const canvas = host.querySelector('[data-testid="canvas"]') as HTMLCanvasElement;
  expect([canvas.width, canvas.height]).toEqual([4, 4]);
  expect(host.querySelector('[title="Draw the far level"]')).toBeTruthy();
});

test("a frame added while drawing a level is added at every size, as one undo entry", () => {
  addLevel("far", 4, 4);
  selectNode(levelPath("far"));
  const before = history.undo;
  addFrame();
  expect(editor.sprite.frames).toHaveLength(3);
  expect(editor.sprite.levels![0].frames).toHaveLength(3);
  expect(history.undo).toBe(before + 1);
  expect(validateSprite(editor.sprite)).toEqual([]);
  undoEdit();
  expect([editor.sprite.frames.length, editor.sprite.levels![0].frames.length]).toEqual([2, 2]);
});

test("a level plays the sprite's animations, and a new one is the sprite's", () => {
  addLevel("far", 4, 4);
  selectNode(levelPath("far"));
  addAnimation("graze");
  expect(Object.keys(editor.sprite.animations!)).toEqual(["walk", "graze"]);
  expect(editor.sprite.levels![0].animations).toBeUndefined();
  expect(validateSprite(editor.sprite)).toEqual([]);
});

test("a level has no parts, and says so", () => {
  addLevel("far", 4, 4);
  selectNode(levelPath("far"));
  expect(addPart({ name: "antler" })).toBeNull();
  expect(editor.status).toMatch(/a level has no parts/);
  expect(editor.sprite.parts).toBeUndefined();
});

test("the loupe lays every size side by side", async () => {
  addLevel("far", 4, 4);
  toggleLoupe(true);
  await sleep(60);
  const art = host.querySelector('[data-testid="loupe-canvas"]') as HTMLCanvasElement;
  // The deer, two cells of gap, the far deer; as tall as the tallest.
  expect([art.width, art.height]).toEqual([8 + 2 + 4, 8]);
});

test("New level… asks for a name and a size, and opens what it made", async () => {
  openLevelDialog();
  await sleep(40);
  const create = [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Create",
  ) as HTMLButtonElement;
  create.click();
  await sleep(40);
  expect(editor.sprite.levels?.map((l) => [l.name, l.w, l.h])).toEqual([["far", 4, 4]]);
  expect(editor.path).toEqual(levelPath("far"));
});
