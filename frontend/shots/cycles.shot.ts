// Colour cycling: a run of swatches taken, turned into a cycle, and played.
//
// What the pictures have to show: the run reads as one thing in the grid and
// says what it would do, a cycle is ONE row in the Variants panel however many
// phases it writes, and a single frame plays with the play bar counting phases.
import { expect, onTestFinished, test } from "vitest";

import { addVariant, editor, setPlaying } from "../src/lib/editor.svelte";
import { open, type Rig } from "./rig";

/** A pool in a rock frame: five blues in diagonal bands, so a turn reads as flow. */
const pool = () => {
  const ramp = "ABCDE";
  const [w, h] = [16, 10];
  return {
    name: "pool",
    w,
    h,
    palette: {
      R: "#5a4a3a",
      A: "#0b2a6b",
      B: "#1546a0",
      C: "#2a6fd0",
      D: "#5aa0ec",
      E: "#a8d8ff",
    },
    frames: [
      Array.from({ length: h }, (_, y) =>
        Array.from({ length: w }, (_, x) =>
          x === 0 || y === 0 || x === w - 1 || y === h - 1 ? "R" : ramp[(x + y) % 5],
        ).join(""),
      ),
    ],
  };
};

const swatch = (rig: Rig, ch: string) =>
  rig.host.querySelector(`[data-swatch="${ch}"]`) as HTMLElement;

async function takeRun(rig: Rig) {
  swatch(rig, "A").click();
  swatch(rig, "E").dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
  await rig.settle();
}

test("a run of swatches, and the verb it brings", async () => {
  const rig = await open(pool());
  onTestFinished(() => rig.stop());
  await takeRun(rig);
  expect(rig.host.textContent).toContain("Cycle these");
  await rig.shot("30-cycle-run");
});

test("a cycle is one row beside a plain variant, with its menu", async () => {
  const rig = await open(pool());
  onTestFinished(() => rig.stop());
  addVariant("night");
  await takeRun(rig);
  const go = [...rig.host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Cycle these"),
  );
  go!.click();
  await rig.settle();
  expect(rig.host.querySelectorAll('[aria-label^="Show cycle"]')).toHaveLength(1);
  await rig.shot("31-cycle-row");
  const row = rig.host.querySelector('[aria-label^="Show cycle"]')!.closest("li")!;
  const r = row.getBoundingClientRect();
  row.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: r.left + r.width / 2,
      clientY: r.bottom,
    }),
  );
  await rig.settle();
  await rig.shot("32-cycle-menu");
});

test("one frame playing, its colours turning", async () => {
  const rig = await open(pool());
  onTestFinished(() => {
    setPlaying(false);
    rig.stop();
  });
  await takeRun(rig);
  [...rig.host.querySelectorAll("button")]
    .find((b) => b.textContent?.includes("Cycle these"))!
    .click();
  await rig.settle();
  editor.fps = 4;
  setPlaying(true);
  await rig.settle(400);
  expect(document.querySelector('[aria-label="Playing"]'), "no play bar").toBeTruthy();
  await rig.shot("33-cycle-playing");
});
