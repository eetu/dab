// A rig for looking at the editor, rather than asserting about it.
//
// Every UI change in this repo has ended the same way: mount the app, drive it
// into the state in question, take a picture, look at the picture. That is the
// only way to catch a control that collapsed to a two-pixel line, a panel row
// that overflows, or a marquee whose colour says the wrong thing — none of which
// any assertion here was ever going to notice. Doing it with a throwaway test
// file each time meant re-typing the mount, the drag helper and a sprite to
// photograph, and deleting the lot afterwards.
//
// So it lives here. Scenes are `shots/*.shot.ts`, they are NOT part of `just
// check`, and they write PNGs to `shots/out/`. Run them with `just shots`.
//
// A scene still asserts — the minimum that makes its picture mean something.
// A screenshot of a component that failed to mount is a blank rectangle, and a
// blank rectangle looks like a rendering opinion rather than a broken build.
import type { SpriteFile } from "dab-core";
import { mount, unmount } from "svelte";
import { expect } from "vitest";
import { page } from "vitest/browser";

import App from "../src/App.svelte";
import { editor, loadSprite } from "../src/lib/editor.svelte";

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Sprites worth photographing, so a scene is about the editor rather than about
 * inventing art. A car because it is the subject parts were built for, and a
 * wheel because it is the one rotation is for.
 */
export const SPRITES = {
  car: (): SpriteFile => ({
    name: "car",
    w: 20,
    h: 12,
    palette: { B: "#3060c0", G: "#a0d8f0", T: "#222228", R: "#d04030" },
    frames: [
      [
        "....................",
        ".....BBBBBBBB.......",
        "....BGGGGGGGGB......",
        "...BGGGGGGGGGGB.....",
        "..BBBBBBBBBBBBBB....",
        ".BBBBBBBBBBBBBBBB...",
        ".BBBBBBBBBBBBBBBB...",
        ".BBRRBBBBBBBBRRBB...",
        "..TTT......TTT......",
        "..TTT......TTT......",
        "....................",
        "....................",
      ],
    ],
  }),
  wheel: (): SpriteFile => ({
    name: "wheel",
    w: 16,
    h: 16,
    palette: { T: "#222228", H: "#c8c8d0", S: "#8a8a96", R: "#d04030" },
    frames: [
      [
        "....TTTTTTTT....",
        "..TTTTTTTTTTTT..",
        ".TTTTSSSSSSTTTT.",
        ".TTTSSSSSSSSTTT.",
        "TTTSSSHHHHSSSTTT",
        "TTSSSHHHHHHSSSTT",
        "TTSSHHHRRHHHHSTT",
        "TTSSHHHRRHHHHSTT",
        "TTSSHHHHRRHHHSTT",
        "TTSSHHHHRRHHHSTT",
        "TTSSSHHHHHHSSSTT",
        "TTTSSSHHHHSSSTTT",
        ".TTTSSSSSSSSTTT.",
        ".TTTTSSSSSSTTTT.",
        "..TTTTTTTTTTTT..",
        "....TTTTTTTT....",
      ],
    ],
  }),
};

export type Rig = {
  host: HTMLElement;
  /** Take a picture. Lands in `shots/out/<name>.png`. */
  shot: (name: string) => Promise<void>;
  /** Client coordinates of the centre of a cell of the ACTIVE node's grid. */
  cell: (x: number, y: number) => { clientX: number; clientY: number };
  /** Press, travel through the given cells, release — one gesture. */
  drag: (path: [number, number][]) => Promise<void>;
  /** Right-click a cell, and wait for whatever opens. */
  menu: (x: number, y: number) => Promise<void>;
  /** Click the first thing matching a selector, and complain if there isn't one. */
  click: (selector: string) => Promise<void>;
  /** Let the canvas repaint and any transition finish. */
  settle: (ms?: number) => Promise<void>;
  stop: () => void;
};

/**
 * Mount the app with a sprite in it, and hand back the handles.
 *
 * Returned rather than held in module state so a scene file can open more than
 * one — and so the teardown is the caller's, which is what `onTestFinished`
 * wants.
 */
export async function open(sprite: SpriteFile, file = `${sprite.name}.json`): Promise<Rig> {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const app = mount(App, { target: host });
  await sleep(60);
  loadSprite(sprite, file);
  // Long enough for the viewport to fit the sprite and the first paint to land.
  await sleep(160);

  const canvas = () => {
    const el = host.querySelector("[data-testid=canvas]");
    if (!el) throw new Error("no canvas — the app did not mount");
    return el as HTMLCanvasElement;
  };

  const cell = (x: number, y: number) => {
    const r = canvas().getBoundingClientRect();
    const node = editor.sprite;
    return {
      clientX: r.left + ((x + 0.5) / node.w) * r.width,
      clientY: r.top + ((y + 0.5) / node.h) * r.height,
    };
  };

  const rig: Rig = {
    host,
    cell,
    settle: (ms = 120) => sleep(ms),
    async shot(name) {
      await sleep(120);
      await page.screenshot({ path: `out/${name}.png` });
    },
    async drag(path) {
      const el = canvas();
      const base = { bubbles: true, pointerId: 1, pointerType: "mouse", button: 0 };
      el.dispatchEvent(new PointerEvent("pointerdown", { ...base, ...cell(...path[0]) }));
      for (const step of path.slice(1)) {
        el.dispatchEvent(new PointerEvent("pointermove", { ...base, ...cell(...step) }));
        await sleep(10);
      }
      el.dispatchEvent(
        new PointerEvent("pointerup", { ...base, ...cell(...path[path.length - 1]) }),
      );
      await sleep(40);
    },
    async menu(x, y) {
      canvas().dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, ...cell(x, y) }),
      );
      await sleep(60);
    },
    async click(selector) {
      const el = host.querySelector(selector) ?? document.querySelector(selector);
      expect(el, `nothing matches ${selector}`).toBeTruthy();
      (el as HTMLElement).click();
      await sleep(60);
    },
    stop() {
      unmount(app);
      host.remove();
    },
  };
  return rig;
}
