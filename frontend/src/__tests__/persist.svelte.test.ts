// What survives a reload. The dev server reloads on every source edit, so this
// is the path the tool takes constantly — and the one that can lose work.
import { expect, test } from "vitest";

import {
  clearDraft,
  forgetSaved,
  recallDraft,
  recallFile,
  recallPrefs,
  recallSaved,
  rememberDraft,
  rememberFile,
  rememberPrefs,
  rememberSaved,
  savedFile,
} from "../lib/persist";

const SPRITE = {
  name: "draft",
  w: 3,
  h: 2,
  palette: { A: "#ff0000" },
  frames: [["A..", ".A."]],
};

test("the open file is remembered, so a reload comes back to it", () => {
  rememberFile("car.json");
  expect(recallFile()).toBe("car.json");
  rememberFile(null);
  expect(recallFile()).toBe(null);
});

test("a draft round-trips through storage exactly", () => {
  clearDraft();
  expect(recallDraft()).toBe(null);
  rememberDraft(SPRITE, "draft.json");
  const back = recallDraft();
  expect(back?.file).toBe("draft.json");
  expect(back?.sprite).toEqual(SPRITE);
  clearDraft();
  expect(recallDraft()).toBe(null);
});

test("a draft written by an older format is dropped, not resurrected", () => {
  // Straight into storage, the shape a previous version might have left behind.
  localStorage.setItem(
    "sprite-editor:draft",
    JSON.stringify({ file: "old.json", sprite: JSON.stringify({ name: "old", w: 2 }) }),
  );
  expect(recallDraft()).toBe(null);
  clearDraft();
});

test("clearing after a save means the next reload is not unsaved work", () => {
  rememberDraft(SPRITE, "draft.json");
  expect(recallDraft()).not.toBe(null);
  clearDraft();
  expect(recallDraft()).toBe(null);
});

test("what is on disk is remembered too, so a reload can still be undone", () => {
  // Undo is in memory and a reload empties it. Without this the draft comes
  // back with nothing behind it, and the reload is what made the change stick.
  forgetSaved();
  expect(recallSaved()).toBe(null);
  expect(savedFile()).toBe(null);

  rememberSaved(SPRITE, "car.json");
  expect(recallSaved()?.sprite).toEqual(SPRITE);
  expect(savedFile()).toBe("car.json");

  // A draft on top of it does not disturb the baseline: they are two states of
  // the same document and Revert needs both.
  rememberDraft({ ...SPRITE, frames: [["AAA", "AAA"]] }, "car.json");
  expect(recallSaved()?.sprite).toEqual(SPRITE);
  expect(recallDraft()?.sprite.frames[0]).toEqual(["AAA", "AAA"]);

  forgetSaved();
  expect(savedFile()).toBe(null);
  clearDraft();
});

test("a sprite saved without a folder is still something to go back to", () => {
  // A download has no filename in the folder sense, but it IS the last state
  // that left the tab — so Revert has a target and needs a name for it.
  rememberSaved(SPRITE, null);
  expect(savedFile()).toBe("the last saved state");
  expect(recallSaved()?.sprite).toEqual(SPRITE);
  forgetSaved();
});

test("the desk survives a reload; per-document state does not travel between files", () => {
  // Prefs merge rather than replace, so two writers do not clobber each other.
  rememberPrefs({ tool: "fill", onion: false });
  rememberPrefs({ fps: 12 });
  const p = recallPrefs();
  expect(p.tool).toBe("fill");
  expect(p.onion).toBe(false);
  expect(p.fps).toBe(12);
  localStorage.removeItem("sprite-editor:prefs");
});
