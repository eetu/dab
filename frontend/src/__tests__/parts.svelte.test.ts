// Parts, in a real browser: a sprite that is more than one grid.
//
// A part is a grid of its own at an offset, with its own frames, so a car's door
// can be open while its body is dented without the frame strip multiplying. What
// is only checkable here is that the editor draws the assembly at the offsets a
// consumer would, and that the tools write to the node you picked and nothing
// else — the format's own rules are tested in core.
import {
  alphaOf,
  cloneSprite,
  groupBox,
  type Part,
  type SpriteFile,
  toJson,
  validateSprite,
  withAlpha,
} from "dab-core";
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import {
  activeNode,
  activeRef,
  addClip,
  addColour,
  addFrame,
  addPart,
  adoptFromBundle,
  appendToClip,
  clashingChars,
  clipRun,
  deleteSelection,
  duplicatePart,
  editor,
  hasSelection,
  history,
  loadSprite,
  padNode,
  paint,
  paletteElsewhere,
  partFromSelection,
  placePart,
  pushColour,
  pushPalette,
  pushTargets,
  removeFrame,
  resolvePart,
  selectAll,
  selectBox,
  selectNode,
  setClipFrames,
  setColour,
  sheet,
  spriteFromPart,
  usedBy,
  usePartInstead,
} from "../lib/editor.svelte";
import { panels } from "../lib/panels.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A body with a door on it. Small enough that every pixel can be named. */
const CAR = (): SpriteFile => ({
  name: "car",
  w: 4,
  h: 2,
  palette: { B: "#ff0000" },
  frames: [["BBBB", "BBBB"]],
  parts: [
    {
      name: "door",
      x: 1,
      y: 0,
      w: 2,
      h: 1,
      palette: { D: "#0000ff" },
      frames: [["DD"], [".."]],
    },
  ],
});

/** A sprite a part can borrow, standing in for the folder. */
const SPOKE: SpriteFile = {
  name: "spoke",
  w: 2,
  h: 1,
  palette: { K: "#00ff00" },
  frames: [["K."]],
};

let app: { host: HTMLElement; stop: () => void };
beforeEach(async () => {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const mounted = mount(App, { target: host });
  app = {
    host,
    stop: () => {
      unmount(mounted);
      host.remove();
    },
  };
  await sleep(40);
  sheet.byName = { spoke: SPOKE };
  loadSprite(structuredClone(CAR()), "car.json");
  editor.variant = null;
  // These tests are about geometry and about which node gets drawn, so the
  // underlay is out of the way. Dimming has a test of its own below.
  panels.underlay = "full";
  await sleep(40);
  return () => app.stop();
});

/** The canvas covers the group box, so this is in group-box pixels. */
function pixel(x: number, y: number): [number, number, number, number] {
  const canvas = app.host.querySelector("[data-testid=canvas]") as HTMLCanvasElement;
  const data = canvas.getContext("2d")!.getImageData(x, y, 1, 1).data;
  return [data[0], data[1], data[2], data[3]];
}

const canvasSize = () => {
  const canvas = app.host.querySelector("[data-testid=canvas]") as HTMLCanvasElement;
  return { w: canvas.width, h: canvas.height };
};

/** Press on a group-box pixel, the way a hand would. */
async function clickStage(x: number, y: number, up = true) {
  const canvas = app.host.querySelector("[data-testid=canvas]") as HTMLCanvasElement;
  const r = canvas.getBoundingClientRect();
  const opts = {
    bubbles: true,
    pointerId: 1,
    pointerType: "mouse",
    clientX: r.left + ((x + 0.5) / canvas.width) * r.width,
    clientY: r.top + ((y + 0.5) / canvas.height) * r.height,
  };
  canvas.dispatchEvent(new PointerEvent("pointerdown", opts));
  if (up) canvas.dispatchEvent(new PointerEvent("pointerup", opts));
  await sleep(20);
  return opts;
}

test("a part is drawn at its offset, over the body it sits on", async () => {
  // Body is red everywhere; the door is blue and covers x 1..2 of row 0.
  expect(pixel(0, 0)).toEqual([255, 0, 0, 255]);
  expect(pixel(1, 0)).toEqual([0, 0, 255, 255]);
  expect(pixel(2, 0)).toEqual([0, 0, 255, 255]);
  expect(pixel(3, 0)).toEqual([255, 0, 0, 255]);
  expect(pixel(1, 1)).toEqual([255, 0, 0, 255]);
});

test("a part hanging off the edge widens the view rather than being cropped", async () => {
  expect(canvasSize()).toEqual({ w: 4, h: 2 });
  placePart(["door"], { x: -2, y: 0 });
  await sleep(40);
  // The group now runs from x −2 to x 4: six columns, and the door is at 0.
  expect(canvasSize()).toEqual({ w: 6, h: 2 });
  expect(pixel(0, 0)).toEqual([0, 0, 255, 255]);
  expect(pixel(2, 0)).toEqual([255, 0, 0, 255]);
});

test("behind draws a part under the body, showing through its holes", async () => {
  // Punch a hole in the body where the door is, then send the door behind it.
  selectNode([]);
  editor.tool = "eraser";
  paint([[1, 0]], true);
  placePart(["door"], { behind: true });
  await sleep(40);
  expect(pixel(1, 0)).toEqual([0, 0, 255, 255]); // through the hole
  expect(pixel(2, 0)).toEqual([255, 0, 0, 255]); // body wins where it is solid
});

test("flip mirrors a borrowed part and leaves the sprite it borrowed alone", async () => {
  editor.sprite.parts = [
    ...(editor.sprite.parts ?? []),
    { name: "wheel", x: 0, y: 1, use: "spoke" } as Part,
  ];
  await sleep(40);
  expect(pixel(0, 1)).toEqual([0, 255, 0, 255]); // "K." — left cell painted
  placePart(["wheel"], { flip: "h" });
  await sleep(40);
  expect(pixel(0, 1)).toEqual([255, 0, 0, 255]); // ".K" — the body shows through
  expect(pixel(1, 1)).toEqual([0, 255, 0, 255]);
  expect(SPOKE.frames[0]).toEqual(["K."]);
});

test("the tools write to the node that is picked, and to nothing else", async () => {
  selectNode(["door"]);
  editor.ink = "D";
  editor.tool = "pencil";
  // (0,0) of the door is (1,0) of the car.
  await clickStage(1, 0);
  expect((editor.sprite.parts![0] as { frames: string[][] }).frames[0]).toEqual(["DD"]);

  editor.tool = "eraser";
  await clickStage(1, 0);
  expect((editor.sprite.parts![0] as { frames: string[][] }).frames[0]).toEqual([".D"]);
  // The body underneath was never touched.
  expect(editor.sprite.frames[0]).toEqual(["BBBB", "BBBB"]);
});

test("a paint click outside the active node is a no-op, not a stray pixel", async () => {
  selectNode(["door"]);
  editor.tool = "eraser";
  // cloneSprite, not structuredClone: editor.sprite is $state, and a proxy
  // cannot be structured-cloned.
  const before = cloneSprite(editor.sprite);
  await clickStage(3, 1); // body territory, well outside the door
  expect(editor.sprite).toEqual(before);
});

test("everything but the node being drawn is dimmed, so the pixels that are yours read", async () => {
  panels.underlay = "dim";
  await sleep(40);
  // Read as colour, not as alpha: the dimmed door is composited over an opaque
  // body, so what dimming changes is the mix and never the coverage.
  const [r, , b] = pixel(1, 0);
  expect(r).toBeGreaterThan(0); // the red body showing through the door
  expect(b).toBeLessThan(255);

  selectNode(["door"]);
  await sleep(40);
  expect(pixel(1, 0)).toEqual([0, 0, 255, 255]); // the door, now full
  expect(pixel(0, 0)[3]).toBeLessThan(255); // the body, now dimmed over nothing
});

test("hiding a part hides all of it, including the node you are drawing on", async () => {
  const key = "door";
  // Hidden while it is NOT the active node: its pixels go, the body stays.
  editor.hidden[key] = true;
  await sleep(40);
  expect(pixel(1, 0)).toEqual([255, 0, 0, 255]);

  // Hidden while it IS: everything the canvas draws for the active node — the
  // outline, the ants, the selection tint — has to go with it.
  editor.hidden[key] = false;
  selectNode(["door"]);
  selectAll();
  await sleep(40);
  expect(app.host.querySelector(".node")).toBeTruthy();
  expect(app.host.querySelector(".ants")).toBeTruthy();

  editor.hidden[key] = true;
  await sleep(40);
  expect(app.host.querySelector(".node")).toBeNull();
  expect(app.host.querySelector(".ants")).toBeNull();
  expect(pixel(1, 0)).toEqual([255, 0, 0, 255]);
});

test("hiding the body leaves its parts, which is the reason to hide it", async () => {
  // The door sits over the body at (1,0); (3,1) is body alone.
  expect(pixel(1, 0)).toEqual([0, 0, 255, 255]);
  expect(pixel(3, 1)).toEqual([255, 0, 0, 255]);

  // Hiding the sprite itself takes its grid and nothing else.
  editor.hidden[""] = true;
  await sleep(40);
  expect(pixel(1, 0)).toEqual([0, 0, 255, 255]); // the door, still there
  expect(pixel(3, 1)).toEqual([0, 0, 0, 0]); // the body, gone

  // And each row still answers for itself.
  editor.hidden.door = true;
  await sleep(40);
  expect(pixel(1, 0)).toEqual([0, 0, 0, 0]);

  editor.hidden[""] = false;
  await sleep(40);
  expect(pixel(3, 1)).toEqual([255, 0, 0, 255]);
  expect(pixel(1, 0)).toEqual([255, 0, 0, 255]); // body shows through the door
});

test("a hidden node cannot be clicked, but what is under it still can", async () => {
  editor.tool = "select";
  await clickStage(1, 0);
  expect(editor.path).toEqual(["door"]);

  selectNode([]);
  editor.hidden.door = true;
  await sleep(40);
  // The same press now means the body, because the door is not there to mean.
  await clickStage(1, 0);
  expect(editor.path).toEqual([]);
});

test("nothing may write to a hidden node, however the tools reach it", async () => {
  selectNode(["door"]);
  editor.hidden.door = true;
  editor.ink = "D";
  editor.tool = "pencil";
  await sleep(30);
  const before = cloneSprite(editor.sprite);

  await clickStage(1, 0);
  paint([[0, 0]], true);
  selectAll();
  deleteSelection();
  expect(editor.sprite).toEqual(before);
  expect(editor.status).toContain("hidden");
});

test("a borrowed part can be picked up, which is the only thing it needs", async () => {
  editor.sprite.parts = [
    ...(editor.sprite.parts ?? []),
    { name: "wheel", x: 0, y: 1, use: "spoke" } as Part,
  ];
  await sleep(40);

  // It has no body, so it used to refuse to be selected at all.
  selectNode(["wheel"]);
  expect(editor.path).toEqual(["wheel"]);
  // The panels show the sprite it draws, which is the truth about what is there.
  expect((activeNode() as SpriteFile).name).toBe("spoke");
  expect(activeRef()?.use).toBe("spoke");

  // And nothing may write to it: that document is not the one that is open.
  const before = cloneSprite(editor.sprite);
  editor.ink = "K";
  paint([[0, 0]], true);
  addFrame();
  expect(editor.sprite).toEqual(before);
  expect(editor.status).toContain("spoke");

  // Moving it is exactly what it is for.
  editor.tool = "move";
  const canvas = app.host.querySelector("[data-testid=canvas]") as HTMLCanvasElement;
  const r = canvas.getBoundingClientRect();
  const at = (x: number, y: number) => ({
    bubbles: true,
    pointerId: 1,
    pointerType: "mouse",
    clientX: r.left + ((x + 0.5) / canvas.width) * r.width,
    clientY: r.top + ((y + 0.5) / canvas.height) * r.height,
  });
  canvas.dispatchEvent(new PointerEvent("pointerdown", at(0, 1)));
  canvas.dispatchEvent(new PointerEvent("pointermove", at(2, 1)));
  canvas.dispatchEvent(new PointerEvent("pointerup", at(2, 1)));
  await sleep(30);
  expect(editor.sprite.parts!.find((p) => p.name === "wheel")).toMatchObject({ x: 2, y: 1 });
});

test("a selected borrowed part shows its box, in its own colour, and no ants", async () => {
  editor.sprite.parts = [
    ...(editor.sprite.parts ?? []),
    { name: "wheel", x: 1, y: 1, use: "spoke" } as Part,
  ];
  await sleep(40);

  selectNode(["wheel"]);
  selectAll();
  await sleep(40);

  // The box is what says it is selected and what you are about to pick up.
  const box = app.host.querySelector(".node") as HTMLElement;
  expect(box).toBeTruthy();
  expect(box.classList.contains("borrowed")).toBe(true);
  // But nothing about pixels: there are none of its own to select.
  expect(app.host.querySelector(".ants")).toBeNull();

  // And it is drawn where the part sits, not at its parent's corner.
  expect(box.style.left).not.toBe("0px");

  // A part with a body gets the ordinary box back.
  selectNode(["door"]);
  await sleep(40);
  expect(app.host.querySelector(".node")!.classList.contains("borrowed")).toBe(false);
});

test("select marquees pixels; it is Move that carries the part", async () => {
  selectNode(["door"]);
  editor.tool = "select";
  await sleep(30);
  const where = { ...(editor.sprite.parts![0] as { x: number; y: number }) };

  const canvas = app.host.querySelector("[data-testid=canvas]") as HTMLCanvasElement;
  const r = canvas.getBoundingClientRect();
  const at = (x: number, y: number) => ({
    bubbles: true,
    pointerId: 1,
    pointerType: "mouse",
    clientX: r.left + ((x + 0.5) / canvas.width) * r.width,
    clientY: r.top + ((y + 0.5) / canvas.height) * r.height,
  });
  // A drag across the door with Select takes pixels, and leaves it where it is.
  canvas.dispatchEvent(new PointerEvent("pointerdown", at(1, 0)));
  canvas.dispatchEvent(new PointerEvent("pointermove", at(2, 0)));
  canvas.dispatchEvent(new PointerEvent("pointerup", at(2, 0)));
  await sleep(30);
  expect(editor.sprite.parts![0]).toMatchObject(where);
  expect(hasSelection()).toBe(true);
});

test("select picks the part under the cursor, so you draw on what you clicked", async () => {
  editor.tool = "select";
  await clickStage(1, 0);
  expect(editor.path).toEqual(["door"]);
  // And back to the body by clicking a pixel the door does not cover.
  await clickStage(3, 1);
  expect(editor.path).toEqual([]);
});

test("dragging a part rewrites its placement, in one undo entry", async () => {
  editor.tool = "move";
  const canvas = app.host.querySelector("[data-testid=canvas]") as HTMLCanvasElement;
  const r = canvas.getBoundingClientRect();
  const at = (x: number, y: number) => ({
    bubbles: true,
    pointerId: 1,
    pointerType: "mouse",
    clientX: r.left + ((x + 0.5) / canvas.width) * r.width,
    clientY: r.top + ((y + 0.5) / canvas.height) * r.height,
  });
  const undos = history.undo;
  canvas.dispatchEvent(new PointerEvent("pointerdown", at(1, 0)));
  canvas.dispatchEvent(new PointerEvent("pointermove", at(2, 0)));
  canvas.dispatchEvent(new PointerEvent("pointermove", at(3, 0)));
  canvas.dispatchEvent(new PointerEvent("pointerup", at(3, 0)));
  await sleep(30);
  expect(editor.sprite.parts![0]).toMatchObject({ x: 3, y: 0 });
  // A whole drag is one step back, the way a stroke is.
  expect(history.undo).toBe(undos + 1);
});

test("a part keeps its own frames, and the body's strip is not the door's", async () => {
  selectNode(["door"]);
  expect(editor.sprite.frames.length).toBe(1);
  addFrame();
  expect((editor.sprite.parts![0] as { frames: string[][] }).frames.length).toBe(3);
  expect(editor.sprite.frames.length).toBe(1);
});

test("removing a frame leaves every clip valid rather than pointing past the end", async () => {
  (editor.sprite.parts![0] as { clips: Record<string, number[]> }).clips = {
    shut: [0],
    swing: [0, 1],
  };
  selectNode(["door"]);
  editor.frame = 0;
  removeFrame();
  await sleep(20);
  expect((editor.sprite.parts![0] as { clips?: unknown }).clips).toEqual({ swing: [0] });
  expect(validateSprite(editor.sprite)).toEqual([]);
});

test("padding a part grows its canvas and moves nothing on screen", async () => {
  selectNode(["door"]);
  const before = [pixel(1, 0), pixel(2, 0), pixel(3, 0)];
  padNode(["door"], 1, 0, 0, 0);
  await sleep(40);
  const part = editor.sprite.parts![0] as { w: number; x: number };
  expect(part.w).toBe(3);
  expect(part.x).toBe(0);
  expect([pixel(1, 0), pixel(2, 0), pixel(3, 0)]).toEqual(before);
});

test("padding out to a stray child swallows it, and the file stays valid", async () => {
  // The resize dialog's Fit-to-parts is groupBox + padNode; this is that path.
  placePart(["door"], { x: -1, y: 0 });
  await sleep(20);
  const b = groupBox(editor.sprite, resolvePart);
  padNode([], -b.x, -b.y, b.x + b.w - editor.sprite.w, b.y + b.h - editor.sprite.h);
  await sleep(40);
  expect(editor.sprite.w).toBe(5);
  expect(editor.sprite.parts![0]).toMatchObject({ x: 0 });
  expect(validateSprite(editor.sprite)).toEqual([]);
});

test("a see-through colour lets what is behind it through", async () => {
  // A part of glass over a solid red body.
  loadSprite(
    {
      name: "car",
      w: 2,
      h: 1,
      palette: { B: "#ff0000" },
      frames: [["BB"]],
      parts: [
        {
          name: "glass",
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          palette: { G: "#0000ff80" },
          frames: [["G"]],
        },
      ],
    },
    "car.json",
  );
  await sleep(40);

  // Half-opaque blue over red: neither, and both.
  const [r, g, b, a] = pixel(0, 0);
  expect(a).toBe(255);
  expect(r).toBeGreaterThan(100);
  expect(b).toBeGreaterThan(100);
  expect(g).toBe(0);
  // The body alone is still the body alone.
  expect(pixel(1, 0)).toEqual([255, 0, 0, 255]);
});

test("the button that opens the picker is a chip you can hit", async () => {
  loadSprite(
    { name: "pane", w: 2, h: 1, palette: { B: "#c81e3c", G: "#bfe3ff66" }, frames: [["BG"]] },
    "pane.json",
  );
  await sleep(40);

  // One chip, for whichever colour is selected. It has no text in it, so
  // nothing gives it a height but the stylesheet — and without one a button is
  // two borders and a gap.
  for (const ch of ["B", "G"]) {
    editor.ink = ch;
    await sleep(30);
    const r = (app.host.querySelector(".now .edit") as HTMLElement).getBoundingClientRect();
    expect(r.height).toBeGreaterThan(14);
    expect(r.width).toBeGreaterThan(14);
  }
});

test("the picker carries the opacity, so there is nowhere else to look for it", async () => {
  loadSprite({ name: "pane", w: 1, h: 1, palette: { G: "#3366ff" }, frames: [["G"]] }, "pane.json");
  await sleep(40);

  editor.ink = "G";
  await sleep(30);
  (app.host.querySelector(".now .edit") as HTMLButtonElement).click();
  await sleep(40);
  const pop = document.querySelector('[aria-label="Colour"]') as HTMLElement;
  expect(pop).toBeTruthy();

  // Hue, saturation and opacity are three tracks in the one popover.
  const tracks = [...pop.querySelectorAll("[role=slider]")].map((el) =>
    el.getAttribute("aria-label"),
  );
  expect(tracks).toEqual(["Saturation and brightness", "Hue", "Opacity"]);
  // And the system picker is still reachable from inside it.
  expect(pop.querySelector("input[type=color]")).toBeTruthy();

  // Dragging the opacity track to the middle writes an eight-digit colour.
  const bar = pop.querySelectorAll("[role=slider]")[2] as HTMLElement;
  const r = bar.getBoundingClientRect();
  const at = (fx: number) => ({
    bubbles: true,
    pointerId: 1,
    pointerType: "mouse",
    clientX: r.left + r.width * fx,
    clientY: r.top + r.height / 2,
  });
  bar.dispatchEvent(new PointerEvent("pointerdown", at(0.5)));
  bar.dispatchEvent(new PointerEvent("pointerup", at(0.5)));
  await sleep(40);
  expect(alphaOf(editor.sprite.palette.G)).toBeGreaterThan(100);
  expect(alphaOf(editor.sprite.palette.G)).toBeLessThan(160);
  // The hue survived the trip through the strip.
  expect(editor.sprite.palette.G.slice(0, 7)).toBe("#3366ff");

  // All the way over is opaque again, written the short way.
  bar.dispatchEvent(new PointerEvent("pointerdown", at(1)));
  bar.dispatchEvent(new PointerEvent("pointerup", at(1)));
  await sleep(40);
  expect(editor.sprite.palette.G).toBe("#3366ff");
});

test("alpha is part of the colour, so the hex field is all it takes", async () => {
  loadSprite({ name: "pane", w: 1, h: 1, palette: { G: "#88ccff" }, frames: [["G"]] }, "pane.json");
  await sleep(40);

  editor.ink = "G";
  await sleep(30);
  const field = app.host.querySelector(".now .hextext") as HTMLInputElement;
  // It shows the whole colour, alpha and all — no separate control to find.
  expect(field.value).toBe("#88ccff");

  field.value = "#88ccff40";
  field.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(30);
  expect(editor.sprite.palette.G).toBe("#88ccff40");
  expect((app.host.querySelector(".now .hextext") as HTMLInputElement).value).toBe("#88ccff40");

  // And back, by typing six digits: there is no state to turn off.
  field.value = "#88ccff";
  field.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(30);
  expect(editor.sprite.palette.G).toBe("#88ccff");
});

test("opacity is a property of the colour, so it survives a save", async () => {
  loadSprite({ name: "pane", w: 1, h: 1, palette: { G: "#88ccff" }, frames: [["G"]] }, "pane.json");
  await sleep(30);
  setColour("G", withAlpha(editor.sprite.palette.G, 64));
  expect(editor.sprite.palette.G).toBe("#88ccff40");
  expect(toJson(editor.sprite)).toContain('"#88ccff40"');
  expect(validateSprite(editor.sprite)).toEqual([]);

  // Back to opaque and the digits go, rather than being written as ff.
  setColour("G", withAlpha(editor.sprite.palette.G, 255));
  expect(editor.sprite.palette.G).toBe("#88ccff");
});

test("a variant reaches the parts that have it, and the rest draw their palette", async () => {
  (editor.sprite.parts![0] as { variants: Record<string, Record<string, string>> }).variants = {
    night: { D: "#00ffff" },
  };
  editor.variant = "night";
  await sleep(40);
  expect(pixel(1, 0)).toEqual([0, 255, 255, 255]); // the door has the look
  expect(pixel(0, 0)).toEqual([255, 0, 0, 255]); // the body has not, so its palette
});

test("a part with nothing in it yet is visible, and can be picked and placed", async () => {
  const name = addPart({ w: 2, h: 2 })!;
  await sleep(40);
  // Nothing is drawn — so the box is what says where it is and how big.
  const ghost = app.host.querySelector(".empty") as HTMLElement;
  expect(ghost).toBeTruthy();

  // And it is reachable by that box: a blank part has no pixel to aim at.
  selectNode([]);
  editor.tool = "select";
  await clickStage(0, 0);
  expect(editor.path).toEqual([name]);
});

test("a blank part is dragged by its box, since there is nothing in it to select", async () => {
  const name = addPart({ w: 2, h: 2 })!;
  selectNode([name]);
  editor.tool = "move";
  await sleep(40);

  const canvas = app.host.querySelector("[data-testid=canvas]") as HTMLCanvasElement;
  const r = canvas.getBoundingClientRect();
  const at = (x: number, y: number) => ({
    bubbles: true,
    pointerId: 1,
    pointerType: "mouse",
    clientX: r.left + ((x + 0.5) / canvas.width) * r.width,
    clientY: r.top + ((y + 0.5) / canvas.height) * r.height,
  });
  canvas.dispatchEvent(new PointerEvent("pointerdown", at(0, 0)));
  canvas.dispatchEvent(new PointerEvent("pointermove", at(2, 1)));
  canvas.dispatchEvent(new PointerEvent("pointerup", at(2, 1)));
  await sleep(30);
  expect(editor.sprite.parts!.find((p) => p.name === name)).toMatchObject({ x: 2, y: 1 });
});

test("once it has a pixel in it, the box is gone and select marquees again", async () => {
  const name = addPart({ w: 2, h: 2 })!;
  selectNode([name]);
  editor.ink = "A";
  editor.tool = "pencil";
  await clickStage(0, 0);
  await sleep(40);
  expect(app.host.querySelector(".empty")).toBeNull();

  editor.tool = "select";
  const before = { ...(editor.sprite.parts!.find((p) => p.name === name) as { x: number }) };
  await clickStage(0, 0);
  expect(editor.sprite.parts!.find((p) => p.name === name)).toMatchObject({ x: before.x });
});

test("a swatch is dragged to reorder, and a press without travel still paints", async () => {
  loadSprite(
    {
      name: "flag",
      w: 3,
      h: 1,
      palette: { A: "#ff0000", B: "#00ff00", C: "#0000ff" },
      frames: [["ABC"]],
    },
    "flag.json",
  );
  editor.ink = "A";
  await sleep(40);

  const swatches = () => [...app.host.querySelectorAll("[data-swatch]")] as HTMLElement[];
  const order = () => Object.keys(editor.sprite.palette);
  const at = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
    };
  };

  // A press that never travels is still "paint with this".
  const undos = history.undo;
  const b = swatches()[1];
  const still = at(b);
  b.dispatchEvent(new PointerEvent("pointerdown", still));
  b.dispatchEvent(new PointerEvent("pointerup", still));
  b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await sleep(20);
  expect(editor.ink).toBe("B");
  expect(order()).toEqual(["A", "B", "C"]);
  expect(history.undo).toBe(undos);

  // Drag C up above A.
  const c = swatches()[2];
  const a = swatches()[0];
  c.dispatchEvent(new PointerEvent("pointerdown", at(c)));
  c.dispatchEvent(new PointerEvent("pointermove", at(a)));
  c.dispatchEvent(new PointerEvent("pointerup", at(a)));
  await sleep(30);
  expect(order()).toEqual(["C", "A", "B"]);
  // One undo step for the whole drag, and the ink did not change under it.
  expect(history.undo).toBe(undos + 1);
  expect(editor.ink).toBe("B");
  // The pixels are untouched: this is an order, not a rename.
  expect(editor.sprite.frames[0]).toEqual(["ABC"]);
});

test("a new part is born in the parent's colours, not empty", async () => {
  const name = addPart({ w: 2, h: 2 })!;
  const part = editor.sprite.parts!.find((p) => p.name === name) as { palette: object };
  // The lamp is drawn against the car and is painted in the car's colours far
  // more often than not; the alternative is retyping them.
  expect(part.palette).toEqual({ B: "#ff0000" });
  // Copied, not inherited — the node still answers for its own cells alone.
  selectNode([name]);
  setColour("B", "#00ff00");
  expect(editor.sprite.palette.B).toBe("#ff0000");
});

test("a part can take what the bundle has and it has not, without repainting", async () => {
  selectNode(["door"]);
  expect(activeNode().palette).toEqual({ D: "#0000ff" });
  expect(paletteElsewhere()).toEqual([{ ch: "B", hex: "#ff0000", from: "car" }]);
  adoptFromBundle();
  expect(activeNode().palette).toEqual({ D: "#0000ff", B: "#ff0000" });
  // Additive: pressing again changes nothing, and a character it already has
  // keeps the colour it had.
  setColour("B", "#00ff00");
  adoptFromBundle();
  expect(activeNode().palette.B).toBe("#00ff00");
});

test("a colour added to the body is sent to every part in one press", async () => {
  // A second part, so "every part" means more than one.
  const lamp = addPart({ w: 2, h: 2 })!;
  selectNode([]);
  addColour("#00ff00"); // the body gains a colour the parts have not got
  const ch = Object.keys(activeNode().palette).find((c) => activeNode().palette[c] === "#00ff00")!;

  expect(pushTargets(ch)).toEqual(["door", lamp]);
  pushColour(ch);
  expect(pushTargets(ch)).toEqual([]);
  for (const p of editor.sprite.parts!) {
    expect((p as { palette: Record<string, string> }).palette[ch]).toBe("#00ff00");
  }
});

test("sending corrects a character that already meant a different colour", async () => {
  selectNode(["door"]);
  setColour("B", "#c02040"); // the door's B drifts from the body's
  selectNode([]);
  expect(pushTargets("B")).toEqual(["door"]);
  pushColour("B");
  expect((editor.sprite.parts![0] as { palette: Record<string, string> }).palette.B).toBe(
    "#ff0000",
  );
});

test("one character meaning two colours in one bundle is reported", async () => {
  selectNode(["door"]);
  expect(clashingChars()).toEqual([]);
  // Give the door a B of its own, a different red from the body's.
  setColour("B", "#c02040");
  expect(clashingChars()).toEqual([{ ch: "B", theirs: "#ff0000", where: "car" }]);
  // Taking that colour clears the report.
  setColour("B", "#ff0000");
  expect(clashingChars()).toEqual([]);
});

test("send-all reaches every node at once, and is a no-op the second time", async () => {
  addPart({ w: 2, h: 2 });
  selectNode([]);
  const undos = history.undo;
  pushPalette();
  for (const p of editor.sprite.parts!) {
    expect((p as { palette: Record<string, string> }).palette.B).toBe("#ff0000");
  }
  const after = history.undo;
  pushPalette();
  expect(history.undo).toBe(after); // nothing left to do, so no undo entry
  expect(after).toBe(undos + 1);
});

test("a box around the door becomes a part, and the body keeps its pixels", async () => {
  // A body with a door drawn into it, over two frames.
  loadSprite(
    {
      name: "car",
      w: 6,
      h: 3,
      palette: { B: "#ff0000", D: "#0000ff" },
      frames: [
        ["BBBBBB", "BBDDBB", "BBBBBB"],
        ["BBBBBB", "BBDDBB", "BBBBBB"],
      ],
    },
    "car.json",
  );
  await sleep(30);

  selectBox({ x: 1, y: 1 }, { x: 4, y: 1 });
  const name = partFromSelection("doorL")!;
  expect(name).toBe("doorL");

  const part = editor.sprite.parts![0] as { x: number; y: number; frames: string[][] };
  expect(part).toMatchObject({ x: 1, y: 1, w: 4, h: 1 });
  // Every frame comes along: the selection is a region of the drawing.
  expect(part.frames).toEqual([["BDDB"], ["BDDB"]]);
  // Copied, not cut — trim the part later and the same pixels are underneath.
  expect(editor.sprite.frames[0]).toEqual(["BBBBBB", "BBDDBB", "BBBBBB"]);
  expect(validateSprite(editor.sprite)).toEqual([]);
});

test("moving to a part clears what it took, from every frame", async () => {
  loadSprite(
    {
      name: "car",
      w: 4,
      h: 2,
      palette: { B: "#ff0000" },
      frames: [
        ["BBBB", "BBBB"],
        ["BBBB", "BBBB"],
      ],
    },
    "car.json",
  );
  await sleep(30);

  selectBox({ x: 1, y: 0 }, { x: 2, y: 0 });
  partFromSelection("hole", true);
  expect(editor.sprite.frames[0]).toEqual(["B..B", "BBBB"]);
  expect(editor.sprite.frames[1]).toEqual(["B..B", "BBBB"]);
  expect((editor.sprite.parts![0] as { frames: string[][] }).frames[0]).toEqual(["BB"]);
});

test("a detached part becomes a reference, and a duplicate of it shares the drawing", async () => {
  selectNode(["door"]);
  const drawing = spriteFromPart(["door"], "wheel")!;
  expect(drawing).toMatchObject({ name: "wheel", w: 2, h: 1 });
  // The placement stays behind: a sprite has no opinion about where it sits.
  expect("x" in drawing).toBe(false);

  sheet.byName = { ...sheet.byName, wheel: drawing };
  usePartInstead(["door"], "wheel");
  expect(editor.sprite.parts![0]).toEqual({ name: "door", x: 1, y: 0, use: "wheel" });

  // Which is what makes two of them one drawing.
  duplicatePart(["door"]);
  const refs = editor.sprite.parts!.filter((p) => "use" in p);
  expect(refs.length).toBe(2);
  expect(refs.every((p) => (p as { use: string }).use === "wheel")).toBe(true);
  expect(validateSprite(editor.sprite)).toEqual([]);
});

test("a clip names a run on its own node, and the play head walks the run", async () => {
  selectNode(["door"]);
  editor.frame = 1;
  addClip("open");
  expect((editor.sprite.parts![0] as { clips: Record<string, number[]> }).clips).toEqual({
    open: [1],
  });
  expect(editor.clip).toBe("open");
  // A repeat is a hold — pressing add twice is how a pause is written.
  appendToClip("open");
  expect(clipRun()).toEqual([1, 1]);
  // And the body's own strip is untouched by any of it.
  expect(editor.sprite.clips).toBeUndefined();
});

test("pressing play on a clip plays it, rather than arming something else", async () => {
  selectNode(["door"]);
  editor.frame = 0;
  addClip("shut");
  editor.clip = null;
  editor.playing = false;
  await sleep(30);

  const byLabel = (label: string) =>
    [...app.host.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label);

  byLabel("Play shut")!.click();
  await sleep(30);
  expect(editor.clip).toBe("shut");
  expect(editor.playing).toBe(true);

  // The same button stops it — it says Stop, so it has to.
  const stop = byLabel("Stop shut");
  expect(stop).toBeTruthy();
  stop!.click();
  await sleep(30);
  expect(editor.playing).toBe(false);
  // The clip stays chosen: the strip is still scrubbing that run.
  expect(editor.clip).toBe("shut");
});

test("a clip that loses its last frame is dropped rather than left naming nothing", async () => {
  selectNode(["door"]);
  addClip("shut");
  setClipFrames("shut", []);
  expect((editor.sprite.parts![0] as { clips?: unknown }).clips).toBeUndefined();
  expect(editor.clip).toBeNull();
});

test("renaming a sprite others borrow warns and names them", async () => {
  sheet.byName = {
    spoke: SPOKE,
    cart: {
      name: "cart",
      w: 2,
      h: 1,
      palette: {},
      frames: [[".."]],
      parts: [{ name: "wheel", x: 0, y: 0, use: "spoke" }],
    },
  };
  expect(usedBy("spoke")).toEqual(["cart"]);
  expect(usedBy("car")).toEqual([]);
});

test("a use naming nothing draws nothing and survives a save", async () => {
  editor.sprite.parts = [
    ...(editor.sprite.parts ?? []),
    { name: "ghost", x: 0, y: 0, use: "nowhere" } as Part,
  ];
  await sleep(40);
  // Nothing drawn where it sits, and the entry is still in the document.
  expect(pixel(0, 1)).toEqual([255, 0, 0, 255]);
  expect(toJson(editor.sprite)).toContain('"use": "nowhere"');
});
