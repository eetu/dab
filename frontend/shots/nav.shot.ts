// The Navigate region: the two lists that answer "what exists?".
//
// Mounted on its own, because the picture worth having is the one the editor
// cannot easily be driven into — a folder with thirty sprites in it, which is
// what the tabs exist for. Stacked under the parts tree, that list used to push
// it off a laptop.
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
import { setNavTab } from "../src/lib/panels.svelte";
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
  // scrolls, the tab strip stays.
  host.style.cssText =
    "position:fixed;top:0;left:0;bottom:0;width:16rem;display:grid;grid-template-rows:minmax(0,1fr);border-right:1px solid var(--halo-border)";
  document.body.appendChild(host);
  const app = mount(Navigator, {
    target: host,
    props: {
      entries,
      problems: [],
      folder: { handle: {} as never, name: "sprites" },
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
      setNavTab("parts");
    },
  };
}

test("the parts tab: the car and what it is made of", async () => {
  // The sheet under it, or the borrowed wheels photograph as missing.
  sheet.byName = { ...EXAMPLE_SHEET };
  loadSprite(exampleCar(), "car.json");
  setNavTab("parts");
  const nav = openNav();
  onTestFinished(nav.stop);
  await sleep(200);
  expect(nav.host.querySelectorAll("ul li").length).toBe(6);
  await page.screenshot({ path: "out/18-nav-parts.png" });
});

test("the folder tab: twenty sprites, filter and all", async () => {
  // The sheet under it, or the borrowed wheels photograph as missing.
  sheet.byName = { ...EXAMPLE_SHEET };
  loadSprite(exampleCar(), "car.json");
  setNavTab("folder");
  const nav = openNav();
  onTestFinished(nav.stop);
  await sleep(200);
  expect(nav.host.querySelector(".find")).toBeTruthy();
  await page.screenshot({ path: "out/19-nav-folder.png" });
});
