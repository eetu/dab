import { describe, expect, test } from "vitest";

import {
  addFrame,
  animationFrames,
  duplicateFrame,
  fromJson,
  moveFrame,
  nodeAt,
  removeFrame,
  type SpriteBody,
  type SpriteFile,
  toJson,
  validateSprite,
} from "../src";
import { car, spoke } from "./fixtures";

describe("animations", () => {
  test("an animation names frames the sprite has, and holds are repeats", () => {
    const s = car();
    s.animations = { hold: [0, 0, 1] };
    expect(validateSprite(s)).toEqual([]);
    s.animations = { gone: [2] };
    expect(validateSprite(s)).toContain(
      "animation gone names frame 2, which the sprite has not got",
    );
    s.animations = { empty: [] };
    expect(validateSprite(s)).toContain("animation empty is not a non-empty list of frame indices");
  });

  test("animationFrames hands back the run, and null for a name it has not got", () => {
    const door = nodeAt(car(), ["doorL"])!;
    expect(animationFrames(door, "swing")).toEqual([0, 1, 2]);
    expect(animationFrames(door, "slam")).toBeNull();
  });

  test("removing a frame drops it from every animation and shifts the rest", () => {
    const door = nodeAt(car(), ["doorL"])!;
    const next = removeFrame(door, 1);
    expect(next.animations).toEqual({ shut: [0], swing: [0, 1], open: [1] });
    expect(validateSprite({ ...next, name: "x" })).toEqual([]);
  });

  test("an animation that loses every frame is dropped rather than left empty", () => {
    const s = { ...spoke, frames: [["K."], ["..."]], animations: { only: [0] } };
    const next = removeFrame({ ...s, w: 2, h: 1, frames: [["K."], [".."]] }, 0);
    expect(next.animations).toBeUndefined();
  });

  test("adding a frame shifts the animations that come after it and joins none", () => {
    const door = nodeAt(car(), ["doorL"])!;
    expect(addFrame(door, 0).animations).toEqual({ shut: [0], swing: [0, 2, 3], open: [3] });
    expect(duplicateFrame(door, 0).animations).toEqual({ shut: [0], swing: [0, 2, 3], open: [3] });
  });

  test("moving a frame carries every animation's indices through the same permutation", () => {
    const door = nodeAt(car(), ["doorL"])!;
    // [0,1,2] → [1,2,0]: the run that was 0,1,2 is now 2,0,1.
    expect(moveFrame(door, 0, 2).animations).toEqual({ shut: [2], swing: [2, 0, 1], open: [1] });
    expect(moveFrame(door, 2, 0).animations).toEqual({ shut: [1], swing: [1, 2, 0], open: [0] });
  });

  test("a frame operation on a sprite with no animations is unchanged by all of this", () => {
    expect(addFrame(spoke, 0).animations).toBeUndefined();
  });

  test("a file written when the key was `clips` still opens, at every depth", () => {
    const legacy = JSON.stringify({
      name: "car",
      w: 2,
      h: 1,
      palette: { B: "#3060c0" },
      clips: { idle: [0] },
      frames: [["BB"]],
      parts: [
        {
          name: "doorL",
          x: 0,
          y: 0,
          w: 2,
          h: 1,
          palette: { D: "#101014" },
          clips: { swing: [0, 1] },
          frames: [["DD"], ["D."]],
        },
      ],
    });
    const read = fromJson(legacy);
    expect("sprite" in read).toBe(true);
    const sprite = (read as { sprite: SpriteFile }).sprite;
    expect(sprite.animations).toEqual({ idle: [0] });
    expect((sprite.parts![0] as SpriteBody).animations).toEqual({ swing: [0, 1] });
    // And the old name is gone, so nothing downstream has two names for it.
    expect("clips" in sprite).toBe(false);
    // Saving it writes the new key.
    expect(toJson(sprite)).toContain('"animations"');
    expect(toJson(sprite)).not.toContain('"clips"');
  });
});
