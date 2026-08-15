// Palette variants: one drawing, more than one colourway.
//
// A variant names alternate colours for some of the palette's characters and
// inherits the rest, so recolouring a two-tone sign means naming two colours
// rather than repainting it. What is only checkable here is that the editor
// previews the variant a consumer would draw — the fallback rule itself is tested
// in core.
import { cellColour } from "dab-core";
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import {
  addVariant,
  clearVariantColour,
  editor,
  loadSprite,
  removeVariant,
  renameVariant,
  setVariantColour,
  undoEdit,
} from "../lib/editor.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Two characters, so a variant can override one and inherit the other. */
const SIGN = () => ({
  name: "sign",
  w: 2,
  h: 1,
  palette: { A: "#ff0000", B: "#0000ff" },
  frames: [["AB"]],
});

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
  loadSprite(structuredClone(SIGN()), "sign.json");
  editor.variant = null;
  await sleep(40);
  return () => app.stop();
});

test("a new variant starts from the palette, so nothing changes until it is edited", () => {
  addVariant("cyan");
  expect(editor.variant).toBe("cyan");
  expect(cellColour(editor.sprite, "A", "cyan")).toBe("#ff0000");
  expect(cellColour(editor.sprite, "B", "cyan")).toBe("#0000ff");
});

test("a variant overrides what it names and inherits the rest", () => {
  addVariant("cyan");
  setVariantColour("cyan", "A", "#00ffff");
  expect(cellColour(editor.sprite, "A", "cyan")).toBe("#00ffff");
  expect(cellColour(editor.sprite, "B", "cyan")).toBe("#0000ff");
  // The palette itself is untouched — that is the point of a variant.
  expect(cellColour(editor.sprite, "A", null)).toBe("#ff0000");
});

test("clearing an entry falls back to the palette rather than to nothing", () => {
  addVariant("cyan");
  setVariantColour("cyan", "A", "#00ffff");
  clearVariantColour("cyan", "A");
  expect(cellColour(editor.sprite, "A", "cyan")).toBe("#ff0000");
});

test("renaming keeps the colours and follows the selection", () => {
  addVariant("cyan");
  setVariantColour("cyan", "A", "#00ffff");
  renameVariant("cyan", "ice");
  expect(editor.variant).toBe("ice");
  expect(cellColour(editor.sprite, "A", "ice")).toBe("#00ffff");
  expect(editor.sprite.variants?.cyan).toBeUndefined();
});

test("removing the shown variant drops the preview back to the palette", () => {
  addVariant("cyan");
  removeVariant("cyan");
  expect(editor.variant).toBeNull();
  expect(editor.sprite.variants).toBeUndefined();
});

test("every variant edit is undoable", () => {
  addVariant("cyan");
  setVariantColour("cyan", "A", "#00ffff");
  undoEdit();
  expect(cellColour(editor.sprite, "A", "cyan")).toBe("#ff0000");
});

test("the canvas paints the shown variant, not the palette", async () => {
  addVariant("cyan");
  setVariantColour("cyan", "A", "#00ffff");
  await sleep(80);
  const canvas = app.host.querySelector("[data-testid=canvas]") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  expect([r, g, b]).toEqual([0, 255, 255]);
});
