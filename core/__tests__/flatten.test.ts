import { describe, expect, test } from "vitest";

import { flattenSprite, type Part } from "../src";

describe("flatten", () => {
  const body = (rows: string[], palette: Record<string, string>, parts?: Part[]) => ({
    w: rows[0].length,
    h: rows.length,
    palette,
    frames: [rows],
    ...(parts ? { parts } : {}),
  });

  test("a part's colour reuses the host's character when it is the same colour", () => {
    const flat = flattenSprite(
      body(["AAAA", "AAAA"], { A: "#ff0000" }, [
        { name: "p", x: 2, y: 0, ...body(["XY"], { X: "#ff0000", Y: "#00ff00" }) },
      ]),
    );
    // X is the host's red and lands on A; Y is a colour the host has not got.
    expect(flat.added.length).toBe(1);
    const y = flat.added[0];
    expect(flat.palette[y]).toBe("#00ff00");
    expect(flat.frames[0]).toEqual([`AAA${y}`, "AAAA"]);
  });

  test("draw order holds: behind parts under the grid, the rest over it", () => {
    const flat = flattenSprite(
      body(["A.."], { A: "#ff0000" }, [
        { name: "under", x: 0, y: 0, behind: true, ...body(["GGG"], { G: "#00ff00" }) },
        { name: "over", x: 1, y: 0, ...body(["B"], { B: "#0000ff" }) },
      ]),
    );
    const row = flat.frames[0][0];
    // The grid's A covers the behind-part, the front part covers the middle,
    // and the behind-part shows only through the remaining gap.
    expect(row[0]).toBe("A");
    expect(flat.palette[row[1]]).toBe("#0000ff");
    expect(flat.palette[row[2]]).toBe("#00ff00");
  });

  test("glass over paint becomes the colour you were seeing through it", () => {
    const flat = flattenSprite(
      body(["A"], { A: "#ff0000" }, [
        { name: "glass", x: 0, y: 0, ...body(["W"], { W: "#ffffff80" }) },
      ]),
    );
    // Source-over: half-white over red is the pink the canvas was showing.
    expect(flat.palette[flat.added[0]]).toBe("#ff8080");
    // And glass over NOTHING keeps its alpha rather than gaining a backdrop.
    const alone = flattenSprite(
      body(["."], {}, [{ name: "glass", x: 0, y: 0, ...body(["W"], { W: "#ffffff80" }) }]),
    );
    expect(alone.palette[alone.added[0]]).toBe("#ffffff80");
  });

  test("use parts draw what resolve returns, mirrored when the part flips", () => {
    const wheel = body(["XY"], { X: "#111111", Y: "#eeeeee" });
    const flat = flattenSprite(
      body(["...."], {}, [
        { name: "l", x: 0, y: 0, use: "wheel" },
        { name: "r", x: 2, y: 0, use: "wheel", flip: "h" },
        { name: "ghost", x: 0, y: 0, use: "missing" },
      ]),
      { resolve: (name) => (name === "wheel" ? wheel : null) },
    );
    const [x, y] = flat.added;
    // The right wheel is the same drawing the other way round; the missing
    // name draws nothing rather than throwing.
    expect(flat.frames[0]).toEqual([`${x}${y}${y}${x}`]);
  });

  test("an overhanging part grows the box, like the stage it mirrors", () => {
    const flat = flattenSprite(
      body(["AA"], { A: "#ff0000" }, [
        { name: "p", x: -1, y: 0, ...body(["B"], { B: "#0000ff" }) },
      ]),
    );
    expect([flat.w, flat.h]).toEqual([3, 1]);
    expect(flat.frames[0][0][0]).toBe(flat.added[0]);
  });

  test("the view decides frames and eyes: parts pose, hidden grids stay out", () => {
    const host = body(["AA"], { A: "#ff0000" }, [
      {
        name: "door",
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        palette: { O: "#00ff00", C: "#0000ff" },
        frames: [["O"], ["C"]],
      },
    ]);
    const posed = flattenSprite(host, { frameOf: () => 1 });
    expect(posed.palette[posed.frames[0][0][0]]).toBe("#0000ff");
    const eyeless = flattenSprite(host, { hidden: (path) => path.length === 0 });
    // The host's own grid is hidden, so only the part lands.
    expect(eyeless.frames[0][0][1]).toBe(".");
  });
});
