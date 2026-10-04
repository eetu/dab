// The Navigate region, in a real browser: the folder's files as one tree, with
// the open sprite unfolded in place into its levels and parts.
//
// What is only checkable here: that thirty files cannot push the open sprite's
// parts off a laptop (the region scrolls, and opening brings the sprite into
// view), and that there is one list — no tab to have left on the wrong side.
import type { SpriteFile } from "dab-core";
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import { editor, loadSprite, selectNode } from "../lib/editor.svelte";
import type { Entry } from "../lib/files";
import Navigator from "../lib/Navigator.svelte";
import { panels } from "../lib/panels.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const sprite = (name: string): SpriteFile => ({
  name,
  w: 4,
  h: 2,
  palette: { A: "#ff0000" },
  frames: [["AAAA", "AAAA"]],
});

const NAMES = [
  "car",
  "spoke",
  "gantry",
  "palm",
  "pylon",
  "station",
  "stadion",
  "vesitorni",
  "nasinneula",
  "crownMast",
  "crownStep",
  "crownTank",
  "signArrow",
  "signBar",
  "signBlock",
  "signHeart",
  "signKanaHang",
  "signKanaHotel",
  "signKanaMilk",
  "signKanaShort",
  "signKanaTall",
  "signKanaWide",
  "lamp",
  "trunk",
  "doorPanel",
  "seatFront",
  "seatRear",
  "aerial",
  "bumper",
  "spoiler",
];
const ENTRIES: Entry[] = NAMES.map((n) => ({ file: `${n}.json`, sprite: sprite(n) }));

/** The car with a door on it, so the unfolded sprite has something inside. */
const carWithDoor = (): SpriteFile => ({
  ...sprite("car"),
  parts: [{ ...sprite("door"), x: 1, y: 0 }],
});

let host: HTMLElement;
let stop: () => void;
let opened: Entry[];

function boot(entries: Entry[]) {
  host = document.createElement("div");
  // A column's width, and short — the laptop the complaint came from. Bounded
  // the way the app's grid bounds it, or the region has no height to scroll in.
  host.style.cssText =
    "position:fixed;top:0;left:0;width:16rem;height:500px;display:grid;grid-template-rows:minmax(0,1fr)";
  document.body.appendChild(host);
  opened = [];
  const app = mount(Navigator, {
    target: host,
    props: {
      entries,
      problems: [],
      folder: { kind: "disk", handle: {} as never, name: "sprites" },
      canWrite: true,
      onopen: (e: Entry) => opened.push(e),
      onrename: () => {},
      onduplicate: () => {},
      ondelete: () => {},
    },
  });
  stop = () => {
    unmount(app);
    host.remove();
  };
}

const fileNames = () =>
  [...host.querySelectorAll(".file .name")].map((b) => b.textContent?.trim() ?? "");

beforeEach(() => {
  panels.folded = {};
  loadSprite(carWithDoor(), "car.json");
  return () => stop?.();
});

test("a long folder scrolls the region rather than growing it", async () => {
  boot(ENTRIES);
  await sleep(40);
  const body = host.querySelector(".body") as HTMLElement;
  expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
  expect(host.scrollHeight).toBeLessThanOrEqual(host.clientHeight + 1);
});

test("one list: the heading names the folder and counts it, with no tabs", async () => {
  boot(ENTRIES);
  await sleep(40);
  const head = host.querySelector(".head")!;
  expect(head.textContent).toContain("sprites");
  expect(head.textContent).toContain("30");
  expect(host.querySelector("[role=tab]")).toBeNull();
});

test("the open sprite unfolds where its file is, with its parts inside", async () => {
  boot(ENTRIES);
  await sleep(40);
  const items = [...host.querySelectorAll(".files > li")];
  // car.json is first in this folder, so its tree is the first item.
  expect(items[0].classList.contains("open")).toBe(true);
  const rows = [...items[0].querySelectorAll(".name")].map((n) => n.textContent?.trim());
  expect(rows).toEqual(["car", "door"]);
  // Every other file is a closed row — 29 of them, the car not among them.
  expect(fileNames()).toHaveLength(29);
  expect(fileNames()).not.toContain("car");
});

test("opening a sprite with nothing inside moves nothing: its row is a file row's height", async () => {
  // Opening one unfolds it in place. With no parts and no levels there is
  // nothing to unfold, so the list must not shift by a hair — it did, by the
  // open block's own padding, and the jump read as something having opened.
  loadSprite(sprite("car"), "car.json");
  boot(ENTRIES);
  await sleep(40);
  const [open, closed] = [...host.querySelectorAll(".files > li")] as HTMLElement[];
  expect(open.classList.contains("open")).toBe(true);
  expect(open.getBoundingClientRect().height).toBeCloseTo(closed.getBoundingClientRect().height, 0);
});

const openNames = () => [...host.querySelectorAll(".open .name")].map((n) => n.textContent?.trim());
const spriteRow = () => host.querySelector(".open li .pick") as HTMLButtonElement;

test("a second click on the open sprite's row folds what is inside, and a third unfolds it", async () => {
  boot(ENTRIES);
  await sleep(40);
  expect(spriteRow().getAttribute("aria-expanded")).toBe("true");
  spriteRow().click();
  await sleep(20);
  expect(openNames()).toEqual(["car"]);
  expect(spriteRow().getAttribute("aria-expanded")).toBe("false");
  spriteRow().click();
  await sleep(20);
  expect(openNames()).toEqual(["car", "door"]);
});

test("with a part selected, the first click on the sprite's row selects the sprite", async () => {
  boot(ENTRIES);
  selectNode(["door"]);
  await sleep(40);
  spriteRow().click();
  await sleep(20);
  expect(editor.path).toEqual([]);
  expect(openNames()).toEqual(["car", "door"]);
});

test("selecting a part some other way unfolds the tree to show it", async () => {
  boot(ENTRIES);
  await sleep(40);
  spriteRow().click();
  await sleep(20);
  expect(openNames()).toEqual(["car"]);
  selectNode(["door"]); // the canvas, a menu
  await sleep(20);
  expect(openNames()).toEqual(["car", "door"]);
});

test("a closed file with something inside points right; one without has no chevron", async () => {
  const parted = { file: "truck.json", sprite: { ...carWithDoor(), name: "truck" } };
  boot([...ENTRIES.slice(0, 3), parted]);
  await sleep(40);
  const twist = (name: string) =>
    [...host.querySelectorAll(".file button")]
      .find((b) => b.querySelector(".name")?.textContent?.trim() === name)!
      .querySelector(".twist svg");
  expect(twist("truck")).toBeTruthy();
  expect(twist("spoke")).toBeNull();
});

test("a document not in the folder stands above the files", async () => {
  loadSprite(sprite("sketch"), null);
  boot(ENTRIES);
  await sleep(40);
  const body = host.querySelector(".body")!;
  const open = body.querySelector(":scope > .open");
  expect(open?.textContent).toContain("sketch");
  expect(fileNames()).toHaveLength(30);
});

test("a filter appears once the list stops being scannable, and never hides the open sprite", async () => {
  boot(ENTRIES.slice(0, 4));
  await sleep(40);
  expect(host.querySelector(".find")).toBeNull();
  stop();

  boot(ENTRIES);
  await sleep(40);
  const find = host.querySelector(".find input") as HTMLInputElement;
  find.value = "kana";
  find.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(40);
  expect(fileNames()).toHaveLength(6);
  expect(fileNames().every((n) => n.toLowerCase().startsWith("signkana"))).toBe(true);
  expect(host.querySelector(".open")?.textContent).toContain("car");
});

test("clicking a file reports it; the app is the one that opens it", async () => {
  boot(ENTRIES);
  await sleep(40);
  const palm = [...host.querySelectorAll(".file button")].find((b) =>
    b.textContent?.includes("palm"),
  ) as HTMLButtonElement;
  palm.click();
  await sleep(20);
  expect(opened.map((e) => e.file)).toEqual(["palm.json"]);
  expect(editor.file).toBe("car.json");
});
