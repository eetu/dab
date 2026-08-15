// Reverting: the way out of an unsaved change once undo cannot do it.
//
// The case this is for is a reload. The draft comes back, which is the whole
// point of the draft, but the undo stack does not — so without this a reload is
// the one gesture that makes a change permanent.
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import { editor, history, loadSprite, paint } from "../lib/editor.svelte";
import { clearDraft, forgetSaved, rememberDraft, rememberSaved } from "../lib/persist";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SAVED = {
  name: "car",
  w: 4,
  h: 2,
  palette: { A: "#ff0000", B: "#0000ff" },
  frames: [["AA..", "...."]],
};
const EDITED = { ...SAVED, frames: [["AABB", "BBBB"]] };

let app: { host: HTMLElement; stop: () => void };

/** Mount as if the page had just been reloaded onto a restored draft: the work
 *  is back, and there is no undo behind it. */
async function reloadOnto(draft: typeof SAVED | null, saved: typeof SAVED | null) {
  clearDraft();
  forgetSaved();
  if (saved) rememberSaved(saved, "car.json");
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const mounted = mount(App, { target: host });
  await sleep(40);
  if (draft) {
    loadSprite(structuredClone(draft), "car.json");
    editor.dirty = true;
    rememberDraft(draft, "car.json");
  }
  await sleep(60);
  return {
    host,
    stop: () => {
      unmount(mounted);
      host.remove();
      clearDraft();
      forgetSaved();
    },
  };
}

const revertButton = (host: HTMLElement) =>
  [...host.querySelectorAll("header button")].find((b) => b.textContent?.trim() === "Revert") as
    HTMLButtonElement | undefined;

beforeEach(() => () => app?.stop());

test("after a reload the work is back, and undo is not — so Revert is offered", async () => {
  app = await reloadOnto(EDITED, SAVED);
  expect(editor.sprite.frames[0]).toEqual(["AABB", "BBBB"]);
  // The thing that makes this necessary.
  expect(history.undo).toBe(0);
  const button = revertButton(app.host);
  expect(button).toBeTruthy();
  expect(button?.disabled).toBe(false);
});

test("Revert asks first, and a dismissal changes nothing", async () => {
  app = await reloadOnto(EDITED, SAVED);
  revertButton(app.host)!.click();
  await sleep(60);
  const dialog = document.querySelector(".veil, dialog, [role=dialog]");
  expect(dialog).toBeTruthy();
  // Escape is the dismissal every dialog here takes.
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(60);
  expect(editor.sprite.frames[0]).toEqual(["AABB", "BBBB"]);
  expect(editor.dirty).toBe(true);
});

test("confirming puts back what is on disk, and clears the draft with it", async () => {
  app = await reloadOnto(EDITED, SAVED);
  revertButton(app.host)!.click();
  await sleep(60);
  const confirm = [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Discard",
  );
  expect(confirm).toBeTruthy();
  confirm!.click();
  await sleep(80);

  expect(editor.sprite.frames[0]).toEqual(["AA..", "...."]);
  expect(editor.dirty).toBe(false);
  // The draft has to go too, or the next reload brings the change straight back.
  const { recallDraft } = await import("../lib/persist");
  expect(recallDraft()).toBe(null);
  // And with nothing unsaved, there is nothing to revert.
  expect(revertButton(app.host)).toBeUndefined();
});

test("a sprite that has never been saved has nothing to go back to, and says so", async () => {
  app = await reloadOnto(EDITED, null);
  const button = revertButton(app.host);
  expect(button).toBeTruthy();
  expect(button?.disabled).toBe(true);
  expect(button?.title).toContain("never been written");
});

test("with no unsaved change there is nothing to revert", async () => {
  app = await reloadOnto(null, SAVED);
  loadSprite(structuredClone(SAVED), "car.json");
  await sleep(60);
  expect(editor.dirty).toBe(false);
  expect(revertButton(app.host)).toBeUndefined();

  // One stroke, and the way out appears.
  editor.ink = "B";
  paint([[3, 1]], true);
  await sleep(60);
  expect(revertButton(app.host)?.disabled).toBe(false);
});
