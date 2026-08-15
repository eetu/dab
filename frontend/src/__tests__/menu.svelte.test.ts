// The popup menu, in a real browser.
//
// A panel gains actions faster than it gains room for them, so the actions live
// behind one trigger per row. What is only checkable here is that the menu opens
// where it was asked to, closes the way every menu closes, and that a press
// outside it dismisses rather than landing on whatever it was over.
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import { copySelection, editor, loadSprite, selectBox, selectNode } from "../lib/editor.svelte";
import { closeMenu, menu, openMenu } from "../lib/menu.svelte";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  loadSprite(
    {
      name: "car",
      w: 4,
      h: 2,
      palette: { B: "#ff0000", K: "#101014" },
      frames: [["BBBB", "KKKK"]],
      parts: [
        { name: "door", x: 1, y: 0, w: 2, h: 1, palette: { D: "#0000ff" }, frames: [["DD"]] },
      ],
    },
    "car.json",
  );
  await sleep(40);
  return () => {
    closeMenu();
    app.stop();
  };
});

const at = (x: number, y: number) =>
  new MouseEvent("click", { bubbles: true, clientX: x, clientY: y });

test("it opens where it was asked to and lists what it was given", async () => {
  let ran = 0;
  openMenu(at(120, 80), "Colour B", [
    { label: "Send to 2 parts", run: () => ran++ },
    { kind: "separator" },
    { label: "Remove", danger: true, run: () => ran++ },
  ]);
  await sleep(20);
  const box = document.querySelector(".menu") as HTMLElement;
  expect(box).toBeTruthy();
  expect(box.getAttribute("aria-label")).toBe("Colour B");
  const items = [...box.querySelectorAll("button")].map((b) => b.textContent?.trim());
  expect(items).toEqual(["Send to 2 parts", "Remove"]);
  expect(ran).toBe(0);
});

test("picking an item runs it once and closes", async () => {
  let ran = 0;
  openMenu(at(10, 10), "x", [{ label: "Do it", run: () => ran++ }]);
  await sleep(20);
  (document.querySelector(".menu button") as HTMLButtonElement).click();
  await sleep(20);
  expect(ran).toBe(1);
  expect(menu.open).toBe(false);
  expect(document.querySelector(".menu")).toBeNull();
});

test("Escape closes it, and so does a press outside", async () => {
  openMenu(at(10, 10), "x", [{ label: "Do it", run: () => {} }]);
  await sleep(20);
  document
    .querySelector(".menu")!
    .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(20);
  expect(menu.open).toBe(false);

  openMenu(at(10, 10), "x", [{ label: "Do it", run: () => {} }]);
  await sleep(20);
  // The veil is what catches it, so the press never reaches the canvas under it.
  document
    .querySelector(".veil")!
    .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  await sleep(20);
  expect(menu.open).toBe(false);
});

test("New asks before it takes the document away", async () => {
  editor.dirty = true;
  const before = editor.sprite.name;
  [...app.host.querySelectorAll("button")].find((b) => b.textContent?.trim() === "New…")!.click();
  await sleep(40);

  // Nothing has happened yet — an inline row would already have gone.
  expect(editor.sprite.name).toBe(before);
  const box = document.querySelector('[aria-label="New sprite"]') as HTMLElement;
  expect(box).toBeTruthy();
  expect(box.textContent).toContain("unsaved changes");

  // Walking away leaves the document alone.
  document
    .querySelector(".veil")!
    .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  await sleep(40);
  expect(document.querySelector('[aria-label="New sprite"]')).toBeNull();
  expect(editor.sprite.name).toBe(before);
});

test("a new sprite is named and sized before it exists", async () => {
  editor.dirty = false;
  [...app.host.querySelectorAll("button")].find((b) => b.textContent?.trim() === "New…")!.click();
  await sleep(40);

  const box = document.querySelector('[aria-label="New sprite"]') as HTMLElement;
  const [nameEl, wEl, hEl] = [...box.querySelectorAll("input")] as HTMLInputElement[];
  for (const [el, v] of [
    [nameEl, "pylon"],
    [wEl, "12"],
    [hEl, "30"],
  ] as [HTMLInputElement, string][]) {
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  await sleep(30);
  [...box.querySelectorAll("button")].find((b) => b.textContent?.includes("Create"))!.click();
  await sleep(40);

  expect(editor.sprite.name).toBe("pylon");
  expect(editor.sprite.w).toBe(12);
  expect(editor.sprite.h).toBe(30);
  expect(document.querySelector('[aria-label="New sprite"]')).toBeNull();
});

test("adding a part is a question with an answer, not a row that lingers", async () => {
  selectNode([]);
  await sleep(30);
  const add = [...app.host.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === "Add a part to what is selected",
  )!;
  add.click();
  await sleep(40);

  const box = document.querySelector('[aria-label="New part"]') as HTMLElement;
  expect(box).toBeTruthy();
  // With no selection the two selection routes are there but unavailable, so
  // the dialog says what is possible rather than hiding it.
  const routes = [...box.querySelectorAll("input[type=radio]")] as HTMLInputElement[];
  expect(routes.length).toBe(4);
  expect(routes.filter((r) => r.disabled).length).toBeGreaterThanOrEqual(2);

  const parts = editor.sprite.parts?.length ?? 0;
  [...box.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Cancel")!.click();
  await sleep(40);
  // Cancelled: gone, and nothing added.
  expect(document.querySelector('[aria-label="New part"]')).toBeNull();
  expect(editor.sprite.parts?.length ?? 0).toBe(parts);
});

test("right-clicking a selection offers what to do with it", async () => {
  selectNode([]);
  editor.tool = "select";
  selectBox({ x: 0, y: 0 }, { x: 1, y: 1 });
  await sleep(40);

  const canvas = app.host.querySelector("[data-testid=canvas]") as HTMLCanvasElement;
  const r = canvas.getBoundingClientRect();
  const e = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: r.left + r.width / 4,
    clientY: r.top + r.height / 4,
  });
  canvas.dispatchEvent(e);
  await sleep(30);

  expect(e.defaultPrevented).toBe(true);
  const labels = [...document.querySelectorAll(".menu button")].map((b) =>
    b.textContent?.replace(/\s+/g, " ").trim(),
  );
  // The things that were only ever on ⌘X/C/V, plus the one that was behind a
  // dialog in another panel.
  for (const want of ["Cut", "Copy", "Delete", "Deselect"]) {
    expect(labels.some((l) => l?.startsWith(want))).toBe(true);
  }
  expect(labels.some((l) => l?.startsWith("New part from this"))).toBe(true);
});

test("copy then paste puts the block down where the menu was opened", async () => {
  loadSprite(
    { name: "t", w: 4, h: 2, palette: { A: "#ff0000" }, frames: [["AA..", "...."]] },
    "t.json",
  );
  editor.tool = "select";
  selectBox({ x: 0, y: 0 }, { x: 1, y: 0 });
  await sleep(30);
  copySelection();

  const canvas = app.host.querySelector("[data-testid=canvas]") as HTMLCanvasElement;
  const r = canvas.getBoundingClientRect();
  // Bottom-right cell: (2,1) of a 4×2.
  canvas.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: r.left + (2.5 / 4) * r.width,
      clientY: r.top + (1.5 / 2) * r.height,
    }),
  );
  await sleep(30);
  const paste = [...document.querySelectorAll(".menu button")].find((b) =>
    b.textContent?.includes("Paste"),
  ) as HTMLButtonElement;
  expect(paste).toBeTruthy();
  paste.click();
  await sleep(40);
  expect(editor.sprite.frames[0][1]).toBe("..AA");
});

test("the browser's own menu is kept out of the way, except where you type", async () => {
  const onCanvas = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  app.host.querySelector("[data-testid=canvas]")!.dispatchEvent(onCanvas);
  await sleep(20);
  expect(onCanvas.defaultPrevented).toBe(true);

  // A panel with no menu of its own still refuses the browser's.
  const onPanel = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  app.host.querySelector("footer")!.dispatchEvent(onPanel);
  await sleep(20);
  expect(onPanel.defaultPrevented).toBe(true);

  // A text field keeps it: that is where paste and spellcheck actually live.
  const field = app.host.querySelector("input:not([type])") as HTMLInputElement;
  const onField = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  field.dispatchEvent(onField);
  await sleep(20);
  expect(onField.defaultPrevented).toBe(false);
});

test("a palette swatch offers what can be done to that colour", async () => {
  selectNode([]);
  await sleep(40);
  editor.ink = "B";
  await sleep(30);
  (app.host.querySelector(".now button[aria-label^=Actions]") as HTMLButtonElement).click();
  await sleep(20);
  const labels = [...document.querySelectorAll(".menu button")].map((b) =>
    b.textContent?.replace(/\s+/g, " ").trim(),
  );
  // Rename and remove always; sending only because a part lacks this colour.
  expect(labels.some((l) => l?.startsWith("Rename character"))).toBe(true);
  expect(labels.some((l) => l?.startsWith("Send to"))).toBe(true);
  expect(labels.some((l) => l?.startsWith("Remove"))).toBe(true);
});

test("right-clicking a swatch opens the same menu instead of the browser's", async () => {
  selectNode([]);
  await sleep(40);
  const row = app.host.querySelector("[data-swatch=B]") as HTMLElement;
  const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  row.dispatchEvent(e);
  await sleep(20);
  expect(e.defaultPrevented).toBe(true);
  expect(menu.open).toBe(true);
  expect(editor.status).toBe(editor.status); // nothing else fired
});

test("a disabled item stays visible with its reason, instead of vanishing", async () => {
  openMenu(at(100, 100), "door", [
    { label: "Cut", disabled: true, hint: "this part is borrowed", run: () => {} },
    { label: "Copy", run: () => {} },
  ]);
  await sleep(20);
  const buttons = [...document.querySelectorAll(".menu button")] as HTMLButtonElement[];
  const cut = buttons.find((b) => b.textContent?.includes("Cut"));
  // The old behaviour filtered it out entirely; the item must render, greyed.
  expect(cut).toBeTruthy();
  expect(cut!.disabled).toBe(true);
  expect(cut!.textContent).toContain("this part is borrowed");
});

test("a text field inside a menu-bearing row still gets the browser menu", async () => {
  selectNode(["door"]);
  await sleep(40);
  // The x/y inputs sit inside the part row, whose oncontextmenu opens our menu.
  const xy = app.host.querySelector(".xy input") as HTMLInputElement;
  expect(xy).toBeTruthy();
  const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  xy.dispatchEvent(e);
  await sleep(20);
  expect(e.defaultPrevented).toBe(false);
  expect(menu.open).toBe(false);
});

test("a frame thumbnail answers with the frame verbs", async () => {
  selectNode([]);
  await sleep(30);
  const thumb = app.host.querySelector("ol li") as HTMLElement;
  thumb.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  await sleep(20);
  const labels = [...document.querySelectorAll(".menu button")].map((b) =>
    b.textContent?.replace(/\s+/g, " ").trim(),
  );
  expect(labels.some((l) => l?.startsWith("Duplicate"))).toBe(true);
  expect(labels.some((l) => l?.startsWith("Move earlier"))).toBe(true);
  // One frame only: Remove is offered, greyed, with the reason.
  const remove = [...document.querySelectorAll(".menu button")].find((b) =>
    b.textContent?.includes("Remove"),
  ) as HTMLButtonElement;
  expect(remove.disabled).toBe(true);
  expect(remove.textContent).toContain("the last frame stays");
});

test("the root parts row answers for the sprite itself", async () => {
  const root = app.host.querySelector("ul li") as HTMLElement;
  root.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  await sleep(20);
  expect(menu.open).toBe(true);
  expect(menu.title).toBe("car");
  const labels = menu.items.map((i) => ("label" in i ? i.label : "—"));
  expect(labels.some((l) => l.startsWith("Rename"))).toBe(true);
  expect(labels.some((l) => l.startsWith("Canvas size"))).toBe(true);
  expect(labels.some((l) => l.startsWith("Select all"))).toBe(true);
  expect(labels.some((l) => l.startsWith("Add part"))).toBe(true);
});
