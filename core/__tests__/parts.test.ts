import { describe, expect, test } from "vitest";

import {
  addColour,
  cloneSprite,
  flipRows,
  groupBox,
  nodeAt,
  padSprite,
  type Part,
  resizeSprite,
  validateSprite,
  withNode,
} from "../src";
import { car, spoke } from "./fixtures";

describe("parts", () => {
  test("a sprite with parts is valid, and a part is validated as a sprite", () => {
    expect(validateSprite(car())).toEqual([]);
  });

  test("a broken part says which part, so the message still points somewhere", () => {
    const s = car();
    (s.parts![0] as { frames: string[][] }).frames[0][0] = "DDD";
    expect(validateSprite(s)).toEqual(["part doorL: frame 0 row 0 is 3 wide, expected 2"]);
  });

  test("a part's animations are checked against that part's own strip", () => {
    const s = car();
    (s.parts![0] as { frames: string[][] }).frames.pop();
    expect(validateSprite(s)).toEqual([
      "part doorL: animation swing names frame 2, which the sprite has not got",
      "part doorL: animation open names frame 2, which the sprite has not got",
    ]);
  });

  test("a part needs either its own frames or a use, and never both", () => {
    const both = { ...car().parts![0], use: "spoke" } as Part;
    expect(validateSprite({ ...car(), parts: [both] })).toContain(
      "part doorL: must have either its own frames or a `use`, and not both",
    );
    const neither = { name: "ghost", x: 0, y: 0 } as unknown as Part;
    expect(validateSprite({ ...car(), parts: [neither] })).toContain(
      "part ghost: must have either its own frames or a `use`, and not both",
    );
  });

  test("offsets are whole pixels and may sit outside the parent", () => {
    const s = car();
    s.parts![1] = { ...s.parts![1], x: -3, y: 9 };
    expect(validateSprite(s)).toEqual([]);
    s.parts![1] = { ...s.parts![1], x: 1.5 };
    expect(validateSprite(s)).toContain("part wheel: x and y must be whole pixels");
  });

  test("two parts may not share a name — the name is what state is held under", () => {
    const s = car();
    s.parts!.push({ ...s.parts![1] });
    expect(validateSprite(s)).toContain("two parts are called wheel");
  });

  test("a part may not use the sprite it is part of", () => {
    const s = car();
    s.parts![1] = { ...s.parts![1], use: "car" };
    expect(validateSprite(s)).toContain("part wheel: uses the sprite it is part of");
  });

  test("a flipped part may not carry parts of its own", () => {
    const s = car();
    s.parts![0] = { ...(s.parts![0] as Part & { w: number }), flip: "h", parts: [] } as Part;
    expect(validateSprite(s)).toEqual([]); // an empty list is not carrying parts
    (s.parts![0] as { parts: Part[] }).parts = [{ ...spoke, name: "boss", x: 0, y: 0 }];
    expect(validateSprite(s)).toContain("part doorL: cannot be flipped and carry parts of its own");
  });

  test("nesting stops at four deep", () => {
    const leaf = (name: string, parts?: Part[]): Part => ({
      name,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      palette: {},
      frames: [["."]],
      ...(parts ? { parts } : {}),
    });
    const deep = (n: number): Part[] => (n === 0 ? [] : [leaf(`p${n}`, deep(n - 1))]);
    expect(validateSprite({ ...car(), parts: deep(4) })).toEqual([]);
    expect(validateSprite({ ...car(), parts: deep(5) }).join(" ")).toContain(
      "parts nest more than 4 deep",
    );
  });

  test("nodeAt walks names, and stops at a use — a reference has no body to enter", () => {
    const s = car();
    expect(nodeAt(s, [])).toBe(s);
    expect(nodeAt(s, ["doorL"])?.w).toBe(2);
    expect(nodeAt(s, ["wheel"])).toBeNull();
    expect(nodeAt(s, ["nope"])).toBeNull();
  });

  test("withNode edits one part and leaves its siblings identical", () => {
    const s = car();
    const next = withNode(s, ["doorL"], (n) => addColour(n, "#ffffff"));
    expect(nodeAt(next, ["doorL"])!.palette).toEqual({ D: "#101014", A: "#ffffff" });
    expect(next.palette).toEqual(s.palette);
    expect(next.parts![1]).toBe(s.parts![1]);
    // The placement survives an edit to the body it sits on.
    expect(next.parts![0]).toMatchObject({ name: "doorL", x: 2, y: 1 });
  });

  test("withNode on a path that names nothing returns the sprite unchanged", () => {
    const s = car();
    expect(withNode(s, ["gone"], (n) => addColour(n, "#ffffff"))).toBe(s);
    expect(withNode(s, ["wheel"], (n) => addColour(n, "#ffffff"))).toBe(s);
  });

  test("cloning copies parts rather than aliasing them", () => {
    const s = car();
    const copy = cloneSprite(s);
    (copy.parts![0] as { frames: string[][] }).frames[0][0] = "..";
    copy.animations!.clean[0] = 9;
    expect((s.parts![0] as { frames: string[][] }).frames[0][0]).toBe("DD");
    expect(s.animations!.clean).toEqual([0]);
  });

  test("groupBox is the union of the node and its parts, resolved ones included", () => {
    const s = car();
    const resolve = (name: string) => (name === "spoke" ? spoke : null);
    // Wheels sit at y 3 and are 2 tall, so the group runs one row past the body.
    expect(groupBox(s, resolve)).toEqual({ x: 0, y: 0, w: 6, h: 5 });
    s.parts![1] = { ...s.parts![1], x: -2, y: -1 };
    expect(groupBox(s, resolve)).toEqual({ x: -2, y: -1, w: 8, h: 6 });
    // A name the folder has not got contributes nothing rather than throwing.
    expect(groupBox(s)).toEqual({ x: 0, y: 0, w: 6, h: 4 });
  });

  test("a resize takes the parts with it, or every offset silently drifts", () => {
    const s = car();
    const bigger = resizeSprite(s, 10, 8, "center");
    expect(bigger.parts![0]).toMatchObject({ x: 4, y: 3 });
    // Top-left growth moves nothing, because the art did not move either.
    expect(resizeSprite(s, 10, 8).parts![0]).toMatchObject({ x: 2, y: 1 });
  });

  test("padSprite grows the near edge, which no resize anchor can", () => {
    const s = car();
    const padded = padSprite(s, 2, 0, 0, 0);
    expect(padded.w).toBe(8);
    expect(padded.frames[0][0]).toBe("..BBBBBB");
    expect(padded.parts![0]).toMatchObject({ x: 4, y: 1 });
    expect(padSprite(s, -1, 0, 0, 0).frames[0][0]).toBe("BBBBB");
  });

  test("flipRows mirrors, and mirroring twice is the original", () => {
    const rows = ["AB.", "..C"];
    expect(flipRows(rows, "h")).toEqual([".BA", "C.."]);
    expect(flipRows(rows, "v")).toEqual(["..C", "AB."]);
    expect(flipRows(rows, "hv")).toEqual(["C..", ".BA"]);
    expect(flipRows(flipRows(rows, "hv"), "hv")).toEqual(rows);
    expect(flipRows(rows)).toBe(rows);
  });
});
