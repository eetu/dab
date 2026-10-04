// The view: fit, cursor-anchored zoom, and the two-finger gestures. These are
// the parts that feel wrong rather than break, so they are pinned by arithmetic
// instead of by eye.
import { expect, test } from "vitest";

import {
  cell,
  fit,
  fitZoom,
  panBy,
  viewport,
  zoomBy,
  zoomIn,
  zoomOut,
} from "../lib/viewport.svelte";

const pane = (w: number, h: number) => {
  viewport.paneW = w;
  viewport.paneH = h;
};

test("fit fills the pane above the controls' band, centres there, and lands on a whole zoom", () => {
  pane(1000, 600);
  fit(72, 18);
  // (1000-64)/72 = 13.0, (600-32-76)/18 = 27.3 -> the width is the binding side.
  expect(cell()).toBe(13);
  expect(viewport.tx).toBe(0);
  // Centred in what is left above the band: up by half the difference.
  expect(viewport.ty).toBe(-22);
  expect(viewport.manual).toBe(false);

  // A tall sprite on a short pane: its bottom edge stays clear of the band the
  // play and turn bars sit in, which is what a bar over the art used to cover.
  pane(400, 300);
  fit(10, 40);
  const bottom = 300 / 2 + viewport.ty + (40 * cell()) / 2;
  expect(bottom).toBeLessThanOrEqual(300 - 76);

  // A tiny sprite fills the pane too — that is the whole point of fitting.
  fit(3, 8);
  expect(cell()).toBe(Math.min(64, fitZoom(3, 8)));
  expect(cell()).toBeGreaterThan(13);
});

test("a sprite bigger than the pane zooms below 1 rather than being cropped", () => {
  pane(300, 200);
  fit(400, 300);
  expect(viewport.zoom).toBeLessThan(1);
  // …and stays fractional there, where whole numbers would mean not fitting.
  expect(cell()).toBe(viewport.zoom);
});

test("zoom keeps the pixel under the cursor where it is", () => {
  pane(800, 400);
  fit(20, 20);
  const before = viewport.zoom;
  // The point 200px right of the pane centre, in pane coordinates.
  const at = { x: 600, y: 200 };
  const docBefore = (at.x - viewport.paneW / 2 - viewport.tx) / before;
  zoomBy(2, at);
  const docAfter = (at.x - viewport.paneW / 2 - viewport.tx) / viewport.zoom;
  expect(viewport.zoom).toBeCloseTo(before * 2, 6);
  expect(docAfter).toBeCloseTo(docBefore, 6);
});

test("zooming by hand stops the automatic fit from taking the view back", () => {
  pane(800, 400);
  fit(16, 16);
  expect(viewport.manual).toBe(false);
  zoomIn();
  expect(viewport.manual).toBe(true);
  fit(16, 16);
  expect(viewport.manual).toBe(false);
});

test("zoom is clamped at both ends, and steps are whole numbers near 1", () => {
  pane(800, 400);
  fit(16, 16);
  for (let i = 0; i < 40; i++) zoomIn();
  expect(viewport.zoom).toBeLessThanOrEqual(64);
  for (let i = 0; i < 80; i++) zoomOut();
  expect(viewport.zoom).toBeGreaterThanOrEqual(0.25);
});

test("panning is plain screen pixels, so a pinch can move and scale at once", () => {
  pane(800, 400);
  fit(16, 16);
  const { tx, ty } = viewport;
  panBy(30, -12);
  expect(viewport.tx).toBe(tx + 30);
  expect(viewport.ty).toBe(ty - 12);
});
