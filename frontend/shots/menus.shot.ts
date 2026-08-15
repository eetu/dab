// The context-menu policy, photographed: every row answers, disabled items
// grey with their reason instead of vanishing.
import { expect, onTestFinished, test } from "vitest";

import { editor } from "../src/lib/editor.svelte";
import { menu } from "../src/lib/menu.svelte";
import { open, SPRITES } from "./rig";

test("a frame thumbnail's menu, with the disabled reason visible", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(rig.stop);
  const thumb = rig.host.querySelector("ol li") as HTMLElement;
  const r = thumb.getBoundingClientRect();
  thumb.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
    }),
  );
  await rig.settle();
  expect(menu.open).toBe(true);
  await rig.shot("08-frame-menu");
});

test("the root parts row answers for the sprite", async () => {
  const rig = await open(SPRITES.car());
  onTestFinished(rig.stop);
  const root = rig.host.querySelector("ul li") as HTMLElement;
  const r = root.getBoundingClientRect();
  root.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: r.left + 40,
      clientY: r.top + r.height / 2,
    }),
  );
  await rig.settle();
  expect(menu.open).toBe(true);
  expect(menu.title).toBe(editor.sprite.name);
  await rig.shot("09-root-menu");
});
