// Several animations on one play head: a deer whose legs are parts walks when
// "walk" plays, each leg stepping through its own run of that name.
import type { SpriteFile } from "dab-core";
import { afterEach, beforeEach, expect, test } from "vitest";

import { editor, frameOf, loadSprite } from "../lib/editor.svelte";

const grid = (ch: string) => [ch + ch];

/** A body walking 0 1 2, with a leg whose walk runs the other way, and a tail
 *  with no walk at all. */
const deer = (): SpriteFile => ({
  name: "deer",
  w: 2,
  h: 1,
  palette: { A: "#ff0000" },
  animations: { walk: [0, 1, 2] },
  frames: [grid("A"), grid("A"), grid("A")],
  parts: [
    {
      name: "leg",
      x: 0,
      y: 0,
      w: 2,
      h: 1,
      palette: { A: "#ff0000" },
      animations: { walk: [2, 1, 0], kick: [1, 1, 2] },
      frames: [grid("A"), grid("A"), grid("A")],
    },
    {
      name: "tail",
      x: 0,
      y: 0,
      w: 2,
      h: 1,
      palette: { A: "#ff0000" },
      frames: [grid("A"), grid("A")],
    },
  ],
});

const leg = () => deer().parts![0] as SpriteFile;
const tail = () => deer().parts![1] as SpriteFile;

beforeEach(() => loadSprite(deer(), "deer.json"));
afterEach(() => loadSprite(deer(), "deer.json"));

test("with nothing selected and nothing chosen, a part plays along with the frame shown", () => {
  expect(frameOf(["leg"], leg())).toBe(0);
  // Stepping the body steps the leg — the whole subject moves together.
  editor.frame = 2;
  expect(frameOf(["leg"], leg())).toBe(2);
  // As far as a part has frames: the tail has two.
  expect(frameOf(["tail"], tail())).toBe(1);
});

test("while an animation is selected, each part with one by that name steps through its own", () => {
  editor.animation = "walk";
  // Stopped: the step is where the frame being drawn is in the body's run.
  editor.frame = 1;
  expect(frameOf(["leg"], leg())).toBe(1);
  editor.frame = 2;
  expect(frameOf(["leg"], leg())).toBe(0);
  // Playing: the play head is the step, for every part at once.
  editor.playing = true;
  editor.playhead = 0;
  expect(frameOf(["leg"], leg())).toBe(2);
  editor.playhead = 4;
  expect(frameOf(["leg"], leg())).toBe(1);
  // A part without a walk plays along with the frame shown, clamped.
  expect(frameOf(["tail"], tail(), 0)).toBe(0);
  expect(frameOf(["tail"], tail(), 2)).toBe(1);
});

test("a picture of one frame asks for that frame's step, not the play head's", () => {
  editor.animation = "walk";
  editor.playing = true;
  editor.playhead = 2;
  // The strip's thumbnail of frame 0 is step 0 of the walk: the leg's walk[0].
  expect(frameOf(["leg"], leg(), 0, 0)).toBe(2);
  // A frame outside the run selected: the leg plays along.
  expect(frameOf(["leg"], leg(), 1, -1)).toBe(1);
});

test("a part can be set to play another of its animations, or to hold a frame", () => {
  editor.animation = "walk";
  editor.playing = true;
  editor.playhead = 2;
  editor.shown.leg = "play:kick";
  expect(frameOf(["leg"], leg())).toBe(2);
  editor.shown.leg = 1;
  expect(frameOf(["leg"], leg())).toBe(1);
});
