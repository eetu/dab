// Sprites made and never saved, in a real browser: each stays in the sprites list as a draft
// until it is saved or discarded, through moving away and through a reload.
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import { drafts } from "../lib/drafts.svelte";
import { addColour, editor, paint } from "../lib/editor.svelte";
import { closeMenu } from "../lib/menu.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let app: { host: HTMLElement; stop: () => void };
const start = async () => {
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
  await sleep(60);
};

beforeEach(async () => {
  localStorage.removeItem("sprite-editor:drafts");
  localStorage.removeItem("sprite-editor:draft");
  drafts.list = [];
  drafts.open = null;
  editor.dirty = false;
  await start();
  return () => {
    closeMenu();
    app.stop();
    // The next file's app starts from nothing of these.
    localStorage.removeItem("sprite-editor:drafts");
    localStorage.removeItem("sprite-editor:draft");
    drafts.list = [];
    drafts.open = null;
    editor.dirty = false;
  };
});

/** A new sprite called `name`, through the sprites panel's + and its dialog. */
async function make(name: string) {
  [...app.host.querySelectorAll("button")]
    .find((b) => b.getAttribute("aria-label") === "Add a sprite")!
    .click();
  await sleep(40);
  const box = document.querySelector('[aria-label="New sprite"]') as HTMLElement;
  const input = box.querySelector("input") as HTMLInputElement;
  input.value = name;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(20);
  [...box.querySelectorAll("button")].find((b) => b.textContent?.includes("Create"))!.click();
  await sleep(40);
}

/** The closed draft rows, by name. */
const draftRow = (name: string) =>
  [...app.host.querySelectorAll('[aria-label="Drafts"] li.file')].find((li) =>
    li.textContent?.includes(name),
  ) as HTMLElement | undefined;

async function discardFromMenu(name: string) {
  draftRow(name)!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  await sleep(20);
  [...document.querySelectorAll<HTMLButtonElement>(".menu button")]
    .find((b) => b.textContent?.includes("Discard"))!
    .click();
  await sleep(40);
}

test("a new sprite stays in the list when another is opened, untouched or not", async () => {
  await make("lamp");
  addColour("#ff0000");
  editor.ink = "A";
  paint([[0, 0]], true);
  expect(editor.dirty).toBe(true);
  await make("pylon");
  expect(editor.sprite.name).toBe("pylon");
  expect(draftRow("lamp")).toBeTruthy();
  expect(drafts.list.map((d) => d.sprite.name)).toEqual(["lamp", "pylon"]);

  // Back to the first, where it was left; the second is set aside in its turn.
  draftRow("lamp")!.querySelector("button")!.click();
  await sleep(40);
  expect(editor.sprite.name).toBe("lamp");
  expect(editor.file).toBeNull();
  expect(editor.dirty).toBe(true);
  expect(editor.sprite.frames[0][0][0]).toBe("A");
  expect(draftRow("pylon")).toBeTruthy();
});

test("an untouched draft is discarded at once; one drawn on asks first", async () => {
  await make("empty");
  await make("drawn");
  editor.dirty = true;
  await make("third");

  await discardFromMenu("empty");
  expect(document.querySelector('[aria-label^="Discard"]')).toBeNull();
  expect(drafts.list.map((d) => d.sprite.name)).toEqual(["drawn", "third"]);

  await discardFromMenu("drawn");
  const ask = document.querySelector('[aria-label="Discard drawn?"]') as HTMLElement;
  expect(ask).toBeTruthy();
  [...ask.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Discard")!.click();
  await sleep(40);
  expect(drafts.list.map((d) => d.sprite.name)).toEqual(["third"]);
});

test("drafts come back after a reload, the open one open", async () => {
  await make("crate");
  await make("barrel");
  // The list is written on a timer, as the draft is.
  await sleep(500);
  app.stop();
  drafts.list = [];
  drafts.open = null;
  await start();
  await sleep(60);
  expect(drafts.list.map((d) => d.sprite.name)).toEqual(["crate", "barrel"]);
  expect(editor.sprite.name).toBe("barrel");
  expect(draftRow("crate")).toBeTruthy();
});
