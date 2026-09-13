// The folder listing, in a real browser — mounted as the Navigate region holds
// it, because the tab strip is now where its count and its scroller live.
//
// It is navigation: you use it to get somewhere and then you are there for an
// hour. What is only checkable here is that a folder with thirty sprites in it
// cannot push the parts tree off the bottom of a laptop — which is exactly what
// it used to do when the two shared one column.
import type { SpriteFile } from "dab-core";
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import { editor, loadSprite } from "../lib/editor.svelte";
import type { Entry } from "../lib/files";
import Navigator from "../lib/Navigator.svelte";
import { panels, setNavTab } from "../lib/panels.svelte";

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
  setNavTab("folder");
  loadSprite(sprite("car"), "car.json");
  return () => {
    stop?.();
    setNavTab("parts");
  };
});

test("a long list scrolls the region rather than growing it", async () => {
  boot(ENTRIES);
  await sleep(40);
  const body = host.querySelector(".body") as HTMLElement;
  // Thirty rows do not fit in 500px, so the tab's body scrolls — which is what
  // stops the list pushing the app taller than its own box.
  expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
  expect(host.scrollHeight).toBeLessThanOrEqual(host.clientHeight + 1);
});

test("the tab says how many there are, and the other tab puts the list away", async () => {
  boot(ENTRIES);
  await sleep(40);
  const tab = [...host.querySelectorAll("[role=tab]")].find((b) =>
    b.textContent?.includes("Folder"),
  );
  expect(tab?.textContent).toContain("30");
  expect(host.querySelector(".list")).toBeTruthy();

  setNavTab("parts");
  await sleep(40);
  // The count stays readable on the tab with the list itself gone.
  expect(host.querySelector(".list")).toBeNull();
  expect(tab?.textContent).toContain("30");
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
