import { describe, expect, test } from "vitest";

import {
  addFrame,
  addLevel,
  deriveLevel,
  duplicateFrame,
  fromJson,
  insertFrames,
  levelPath,
  moveFrame,
  nodeAt,
  removeFrame,
  removeLevel,
  renameLevel,
  scale2x,
  scaleRows,
  type SpriteFile,
  toJson,
  validateSprite,
  withNode,
} from "../src";

const PAL = { A: "#ff0000", B: "#0000ff" };

/** An 8×8 deer stand-in over two frames, with a walk. */
const deer = (): SpriteFile => ({
  name: "deer",
  w: 8,
  h: 8,
  palette: PAL,
  animations: { walk: [0, 1] },
  frames: [
    [
      "AAAAAAAA",
      "AAAAAAAA",
      "AABBBBAA",
      "AABBBBAA",
      "AABBBBAA",
      "AABBBBAA",
      "AAAAAAAA",
      "AAAAAAAA",
    ],
    [
      "BBBBBBBB",
      "BBBBBBBB",
      "BBAAAABB",
      "BBAAAABB",
      "BBAAAABB",
      "BBAAAABB",
      "BBBBBBBB",
      "BBBBBBBB",
    ],
  ],
});

const withFar = () => addLevel(deer(), deriveLevel(deer(), "far", 4, 4));

describe("levels of detail", () => {
  test("Scale2x rounds a diagonal instead of doubling its staircase, and adds nothing", () => {
    expect(scale2x(["A.", "AA"])).toEqual(["AA..", "AAA.", "AAAA", "AAAA"]);
  });

  test("down, a stroke one pixel wide survives instead of falling between samples", () => {
    const line = [".......", "...A...", "...A...", "...A...", "...A...", "...A...", "......."];
    const small = scaleRows(line, PAL, 3, 3);
    expect(small.join("")).toContain("A");
  });

  test("up and down to any size, the characters are the ones there were", () => {
    const rows = deer().frames[0];
    for (const [w, h] of [
      [16, 16],
      [12, 10],
      [27, 25],
      [3, 3],
    ]) {
      const out = scaleRows(rows, PAL, w, h);
      expect(out).toHaveLength(h);
      expect(out.every((r) => r.length === w && /^[AB.]*$/.test(r))).toBe(true);
    }
  });

  test("a derived level is in step and valid, and a path reaches it", () => {
    const s = withFar();
    expect(validateSprite(s)).toEqual([]);
    expect(s.levels!.map((l) => [l.name, l.w, l.h, l.frames.length])).toEqual([["far", 4, 4, 2]]);
    expect(nodeAt(s, levelPath("far"))).toBe(s.levels![0]);
    const painted = withNode(s, levelPath("far"), (n) => ({
      ...n,
      frames: [["BBBB", "BBBB", "BBBB", "BBBB"], n.frames[1]],
    }));
    expect(painted.levels![0].frames[0][0]).toBe("BBBB");
    expect(painted.frames).toBe(s.frames);
  });

  test("every frame operation is done at every level", () => {
    const s = withFar();
    const count = (x: SpriteFile) => [x.frames.length, x.levels![0].frames.length];
    expect(count(addFrame(s, 0))).toEqual([3, 3]);
    expect(count(duplicateFrame(s, 1))).toEqual([3, 3]);
    expect(count(removeFrame(s, 0))).toEqual([1, 1]);
    const moved = moveFrame(s, 0, 1);
    expect(moved.levels![0].frames[0]).toEqual(s.levels![0].frames[1]);
    // A generated run is this size's art; the other sizes start from copies of
    // the frame the run leaves from.
    const run = insertFrames(s, 0, [deer().frames[1], deer().frames[1]]);
    expect(count(run)).toEqual([4, 4]);
    expect(run.levels![0].frames[1]).toEqual(s.levels![0].frames[0]);
    expect(validateSprite(run)).toEqual([]);
  });

  test("the validator holds a level to the sprite's step", () => {
    const s = withFar();
    const short = { ...s, levels: [{ ...s.levels![0], frames: [s.levels![0].frames[0]] }] };
    expect(validateSprite(short).join(" ")).toContain("has 1 frames, the sprite has 2");
    const own = { ...s, levels: [{ ...s.levels![0], animations: { run: [0] } }] };
    expect(validateSprite(own).join(" ")).toContain("plays the sprite's animations");
    const at = { ...deer(), parts: [{ name: "@far", x: 0, y: 0, use: "x" }] };
    expect(validateSprite(at).join(" ")).toContain("cannot start with @");
  });

  test("added, renamed and removed by name; a clash is refused", () => {
    const s = withFar();
    expect(addLevel(s, deriveLevel(deer(), "far", 2, 2))).toBe(s);
    expect(renameLevel(s, "far", "ridge").levels![0].name).toBe("ridge");
    expect(removeLevel(s, "far").levels).toBeUndefined();
  });

  test("written one frame row per line, and read back the same", () => {
    const s = withFar();
    const text = toJson(s);
    expect(text).toContain('"levels": [');
    expect(text).toContain('        "AAAA",\n');
    const back = fromJson(text);
    expect("sprite" in back && back.sprite).toEqual(s);
  });
});
