// Flatten, from the editor's side: the bake reads the VIEW — shown frames,
// hidden eyes — and the whole-node turn refuses on a parted node and points
// here instead. The compositor itself is tested in the format package.
import type { SpriteFile } from "dab-core";
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import {
  beginTurn,
  editor,
  flattenedNode,
  loadSprite,
  pathKey,
  turning,
} from "../lib/editor.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A car-shaped fixture: a body, a two-pose door, and a part behind. */
const car = (): SpriteFile => ({
  name: "car",
  w: 4,
  h: 2,
  palette: { B: "#ff0000" },
  frames: [
    ["BBBB", "BBBB"],
    ["BBBB", "...."],
  ],
  parts: [
    {
      name: "door",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      palette: { O: "#00ff00", C: "#0000ff" },
      frames: [["O"], ["C"]],
    },
    {
      name: "seat",
      x: 3,
      y: 1,
      behind: true,
      w: 1,
      h: 1,
      palette: { S: "#ffff00" },
      frames: [["S"]],
    },
  ],
});

let app: { host: HTMLElement; stop: () => void };
beforeEach(async () => {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const mounted = mount(App, { target: host });
  await sleep(40);
  loadSprite(structuredClone(car()), "car.json");
  await sleep(40);
  app = {
    host,
    stop: () => {
      unmount(mounted);
      host.remove();
    },
  };
  return () => app.stop();
});

test("a parted node refuses the whole-node turn", async () => {
  beginTurn(true);
  expect(turning.on).toBe(false);
  // The document was not touched by the refusal.
  expect(editor.sprite.frames[0][0]).toBe("BBBB");
});

test("the bake reads the view: the door's shown pose lands in the copy", async () => {
  // Pose the door on its second frame — editor state, never written to disk,
  // and exactly what "flatten what you see" is for.
  editor.shown[pathKey(["door"])] = 1;
  const flat = flattenedNode("car flat")!;
  expect(flat).not.toBeNull();
  expect(flat.sprite.parts).toBeUndefined();
  // Frame 0: the closed door (blue) over the body, the seat behind it covered.
  const closed = flat.sprite.frames[0][0][0];
  expect(flat.sprite.palette[closed]).toBe("#0000ff");
  // Frame 1: the body's second frame has a gap, so the behind-seat shows.
  const seat = flat.sprite.frames[1][1][3];
  expect(flat.sprite.palette[seat]).toBe("#ffff00");
  // The body's own colour kept its character.
  expect(flat.sprite.frames[0][0][1]).toBe("B");
});

test("a hidden eye keeps that grid out of the bake", async () => {
  editor.hidden[pathKey(["door"])] = true;
  const flat = flattenedNode("car flat")!;
  // Where the door sat, the body shows instead.
  expect(flat.sprite.frames[0][0][0]).toBe("B");
});
