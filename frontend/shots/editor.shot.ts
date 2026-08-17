// Scenes worth a picture. Each drives the app into one state and photographs
// it; the assertions are only enough that a broken build fails here rather than
// producing a blank rectangle that looks like a design decision.
//
// `just shots` — pictures land in shots/out/.
import { expect, onTestFinished, test } from "vitest";

import {
  beginTurn,
  cancelTurn,
  clearSelection,
  copySelection,
  editor,
  floating,
  pasteClipboard,
  selectAll,
  selectBox,
  setTurn,
  turning,
} from "../src/lib/editor.svelte";
import { clearDraft, forgetSaved, rememberSaved } from "../src/lib/persist";
import { open, SPRITES } from "./rig";

test("the editor, with a sprite open", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(rig.stop);
  await rig.shot("01-editor");
});

test("a selection, and the menu on it", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(rig.stop);
  editor.tool = "select";
  await rig.drag([
    [2, 8],
    [4, 9],
  ]);
  await rig.menu(3, 8);
  expect(document.querySelector(".menu")).toBeTruthy();
  await rig.shot("02-selection-menu");
});

test("a paste, floating over what it landed on", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(rig.stop);
  editor.tool = "select";
  // The front wheel, dropped onto the body — floating over art that is not its.
  selectBox({ x: 11, y: 8 }, { x: 13, y: 9 });
  await rig.settle(40);
  copySelection();
  pasteClipboard({ x: 2, y: 5 });
  await rig.settle();
  expect(floating.on).toBe(true);
  expect(rig.host.querySelector("[data-testid=afloat]")).toBeTruthy();
  await rig.shot("03-floating-paste");
});

test("rotation, crisp and smooth, on the shape it is for", async () => {
  const rig = await open(SPRITES.wheel());
  onTestFinished(rig.stop);
  editor.tool = "select";
  selectAll();
  await rig.settle(40);
  beginTurn(false);

  setTurn(37, 1);
  await rig.settle();
  expect(turning.added).toBe(0);
  await rig.shot("04-rotate-crisp");

  setTurn(37, 3);
  await rig.settle();
  // The whole point of the smooth end: it costs palette entries, and says so.
  expect(turning.added).toBeGreaterThan(0);
  expect(rig.host.querySelector("[data-testid=cost]")?.textContent).toContain("+");
  // And the handle hangs off the pivot, arm at the angle.
  expect(rig.host.querySelector(".rotgrip")).toBeTruthy();
  await rig.shot("05-rotate-smooth");
  cancelTurn();
});

test("a reloaded draft, with the way out of it", async () => {
  const saved = SPRITES.car();
  rememberSaved(saved, "car.json");
  const rig = await open({ ...saved, frames: [saved.frames[0].map((r) => r.replace(/B/g, "R"))] });
  onTestFinished(() => {
    rig.stop();
    forgetSaved();
    clearDraft();
  });
  // As a reload leaves it: the work is back and the undo stack is empty.
  editor.dirty = true;
  await rig.settle();
  await rig.shot("07-revert");
});

test("rotation of a whole node, which grows to hold it", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(rig.stop);
  clearSelection();
  beginTurn(true);
  setTurn(20, 3);
  await rig.settle();
  expect(editor.sprite.w).toBeGreaterThan(20);
  await rig.shot("06-rotate-whole");
});
