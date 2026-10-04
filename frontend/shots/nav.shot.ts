// The Navigate region: one tree answering "what exists?" — the folder,
// and the open sprite unfolded in it.
//
// Mounted on its own, because the picture worth having is the one the editor
// cannot easily be driven into: a folder of twenty sprites with a six-part car
// open in the middle of it.
// Mounted without App, so the tokens and the type have to be asked for here.
import "../src/halo.css";

import type { SpriteFile } from "dab-core";
import { mount, unmount } from "svelte";
import { expect, onTestFinished, test } from "vitest";
import { page } from "vitest/browser";

import { loadSprite, sheet } from "../src/lib/editor.svelte";
import { EXAMPLE_SHEET, exampleCar } from "../src/lib/examples";
import type { Entry } from "../src/lib/files";
import Navigator from "../src/lib/Navigator.svelte";
import { sleep, SPRITES } from "./rig";

const NAMES = [
  "car",
  "spoke",
  "gantry",
  "palm",
  "pylon",
  "station",
  "vesitorni",
  "crownMast",
  "crownStep",
  "signArrow",
  "signBar",
  "signHeart",
  "signKanaHang",
  "signKanaHotel",
  "signKanaMilk",
  "signKanaTall",
  "lamp",
  "trunk",
  "doorPanel",
  "seatFront",
];

const entries: Entry[] = NAMES.map((n) => ({
  file: `${n}.json`,
  sprite: { ...SPRITES.car(), name: n } as SpriteFile,
}));

function openNav() {
  const host = document.createElement("div");
  // The column the region gets in the app, bounded the same way: the body
  // scrolls, the heading stays.
  host.style.cssText =
    "position:fixed;top:0;left:0;bottom:0;width:16rem;display:grid;grid-template-rows:minmax(0,1fr);border-right:1px solid var(--halo-border)";
  document.body.appendChild(host);
  const app = mount(Navigator, {
    target: host,
    props: {
      entries,
      problems: [],
      folder: { kind: "disk", handle: {} as never, name: "sprites" },
      canWrite: true,
      onopen: () => {},
      onrename: () => {},
      onduplicate: () => {},
      ondelete: () => {},
      onforget: () => {},
    },
  });
  return {
    host,
    stop: () => {
      unmount(app);
      host.remove();
    },
  };
}

test("the tree: the car unfolded among its folder", async () => {
  // The sheet under it, or the borrowed wheels photograph as missing.
  sheet.byName = { ...EXAMPLE_SHEET };
  loadSprite(exampleCar(), "car.json");
  const nav = openNav();
  onTestFinished(nav.stop);
  await sleep(200);
  expect(nav.host.querySelectorAll(".open li").length).toBe(6);
  expect(nav.host.querySelectorAll(".file").length).toBe(NAMES.length - 1);
  await page.screenshot({ path: "out/18-nav-tree.png" });
});

test("the tree: an unsaved sprite above the folder, filter and all", async () => {
  sheet.byName = { ...EXAMPLE_SHEET };
  loadSprite(exampleCar(), null);
  const nav = openNav();
  onTestFinished(nav.stop);
  await sleep(200);
  expect(nav.host.querySelector(".body > .open")).toBeTruthy();
  expect(nav.host.querySelector(".find")).toBeTruthy();
  await page.screenshot({ path: "out/19-nav-unsaved.png" });
});
