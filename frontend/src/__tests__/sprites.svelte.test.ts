// The folder listing, in a real browser.
//
// It is navigation: you use it to get somewhere and then you are there for an
// hour. What is only checkable here is that a folder with thirty sprites in it
// cannot push the panels about the sprite you are drawing off the bottom of a
// laptop — which is exactly what it used to do.
import type { SpriteFile } from "dab-core";
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import { editor, loadSprite } from "../lib/editor.svelte";
import type { Entry } from "../lib/files";
import { panels, toggleFold } from "../lib/panels.svelte";
import Sprites from "../lib/Sprites.svelte";

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

let host: HTMLElement;
let stop: () => void;
let opened: Entry[];

function boot(entries: Entry[]) {
  host = document.createElement("div");
  // A rail's width, and short — the laptop the complaint came from.
  host.style.cssText = "position:fixed;top:0;left:0;width:16rem;height:500px;overflow:auto";
  document.body.appendChild(host);
  opened = [];
  const app = mount(Sprites, {
    target: host,
    props: {
      entries,
      problems: [],
      folder: { handle: {} as never, name: "sprites" },
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

beforeEach(() => {
  panels.folded = {};
  loadSprite(sprite("car"), "car.json");
  return () => stop?.();
});

test("a long list keeps its own scroller rather than growing the rail", async () => {
  boot(ENTRIES);
  await sleep(40);
  const list = host.querySelector(".list") as HTMLElement;
  // Thirty rows do not fit in 34dvh, so the list scrolls inside itself — which
  // is what stops it pushing everything below it off the screen.
  expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
  expect(host.scrollHeight).toBeLessThanOrEqual(host.clientHeight + 1);
});

test("it says how many there are, and folds away entirely", async () => {
  boot(ENTRIES);
  await sleep(40);
  expect(host.textContent).toContain("30");
  expect(host.querySelector(".list")).toBeTruthy();

  toggleFold("sprites");
  await sleep(40);
  // Folded it is a heading and a count: no list, and nothing to scroll past.
  expect(host.querySelector(".list")).toBeNull();
  expect(host.textContent).toContain("30");
});

test("a filter appears once the list stops being scannable, and narrows it", async () => {
  boot(ENTRIES.slice(0, 4));
  await sleep(40);
  expect(host.querySelector(".find")).toBeNull();
  stop();

  boot(ENTRIES);
  await sleep(40);
  const find = host.querySelector(".find input") as HTMLInputElement;
  expect(find).toBeTruthy();

  find.value = "kana";
  find.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(40);
  const names = [...host.querySelectorAll(".list button")].map((b) => b.textContent?.trim() ?? "");
  expect(names.length).toBe(6);
  expect(names.every((n) => n.toLowerCase().startsWith("signkana"))).toBe(true);
});

test("the open sprite is marked, and picking one reports it", async () => {
  boot(ENTRIES);
  await sleep(40);
  const on = host.querySelector(".list button.on");
  expect(on?.textContent?.trim().startsWith("car")).toBe(true);

  const buttons = [...host.querySelectorAll(".list button")] as HTMLButtonElement[];
  buttons.find((b) => b.textContent?.includes("palm"))?.click();
  await sleep(20);
  expect(opened.map((e) => e.file)).toEqual(["palm.json"]);
  // Reporting only: the list does not open it behind the app's back.
  expect(editor.file).toBe("car.json");
});
