// Export: an indexed PNG of the frame on screen, a GIF of the run.
//
// The encoders are tested in core, byte for byte. What is only checkable here
// is that an export is what the canvas shows: the assembly as posed, hidden
// parts left out, the colourway on screen, and a GIF that walks the run the
// play head walks — a cycle's phases included.
import { addCycle as addCycleTo, levelPath } from "dab-core";
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import {
  addLevel,
  editor,
  exportImage,
  exportPlan,
  loadSprite,
  selectNode,
} from "../lib/editor.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A body with a lamp on it, two frames, a blink. */
const CAR = () => ({
  name: "car",
  w: 4,
  h: 2,
  palette: { B: "#3060c0", R: "#d04030" },
  animations: { blink: [0, 1] },
  frames: [
    ["BBBB", "BBBB"],
    ["BBBB", "RRRR"],
  ],
  parts: [
    {
      name: "lamp",
      x: 1,
      y: 0,
      w: 1,
      h: 1,
      palette: { L: "#f0e060" },
      frames: [["L"]],
    },
  ],
});

let host: HTMLElement;
beforeEach(async () => {
  host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const app = mount(App, { target: host });
  await sleep(40);
  loadSprite(structuredClone(CAR()), "car.json");
  await sleep(40);
  return () => {
    unmount(app);
    host.remove();
  };
});

/** The colours a pose paints, read through its own palette. */
const painted = (kind: "png" | "gif", i = 0) => {
  const { body } = exportPlan(kind).poses[i];
  return new Set(
    body.frames[0]
      .join("")
      .replace(/\./g, "")
      .split("")
      .map((ch) => body.palette[ch]),
  );
};

test("a PNG is the assembly as the canvas shows it, at the size asked for", async () => {
  expect(painted("png")).toEqual(new Set(["#3060c0", "#f0e060"]));
  const out = await exportImage("png", 2);
  expect(out.name).toBe("car.png");
  const view = new DataView(out.bytes.buffer, out.bytes.byteOffset);
  // IHDR's width and height, right after the signature and chunk header.
  expect([view.getUint32(16), view.getUint32(20)]).toEqual([8, 4]);
});

test("a hidden part is left out, as it is on the canvas", () => {
  editor.hidden["lamp"] = true;
  expect(painted("png")).toEqual(new Set(["#3060c0"]));
});

test("a GIF walks the run the play head walks", async () => {
  editor.animation = "blink";
  const plan = exportPlan("gif");
  expect(plan.name).toBe("car-blink.gif");
  expect(plan.poses).toHaveLength(2);
  expect(painted("gif", 1).has("#d04030")).toBe(true);
  const out = await exportImage("gif", 1);
  expect(String.fromCharCode(...out.bytes.subarray(0, 6))).toBe("GIF89a");
  expect(out.frames).toBe(2);
});

test("one frame whose colours cycle exports as the phases", () => {
  loadSprite(
    addCycleTo(
      { name: "water", w: 2, h: 1, palette: { A: "#000011", B: "#000022" }, frames: [["AB"]] },
      "flow",
      ["A", "B"],
    ),
    "water.json",
  );
  editor.variant = "flow 1";
  const plan = exportPlan("gif");
  expect(plan.poses).toHaveLength(2);
  const first = plan.poses[0].body;
  const second = plan.poses[1].body;
  expect(first.palette[first.frames[0][0][0]]).toBe("#000011");
  expect(second.palette[second.frames[0][0][0]]).toBe("#000022");
});

test("a level exports alone, under its own name", () => {
  addLevel("far", 2, 1);
  selectNode(levelPath("far"));
  const plan = exportPlan("png");
  expect(plan.name).toBe("car-far.png");
  expect([plan.poses[0].body.w, plan.poses[0].body.h]).toEqual([2, 1]);
});

test("the dialog says what it will write", async () => {
  const button = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Export…"),
  ) as HTMLButtonElement;
  button.click();
  await sleep(40);
  const dialog = document.querySelector("[role=dialog]") as HTMLElement;
  expect(dialog.textContent).toContain("car.png");
  expect(dialog.textContent).toContain("4×2");
});
