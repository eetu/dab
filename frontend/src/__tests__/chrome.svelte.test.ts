// The app's own chrome: the theme switch, the help, and the first visit.
import { mount, unmount } from "svelte";
import { beforeEach, expect, test } from "vitest";

import App from "../App.svelte";
import { editor } from "../lib/editor.svelte";
import { setTheme, theme } from "../lib/theme.svelte";

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
      setTheme("auto");
    },
  };
  await sleep(60);
  return () => app.stop();
});

test("the theme switch writes the attribute the tokens read", async () => {
  setTheme("light");
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(theme.choice).toBe("light");
  setTheme("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  // Auto resolves against the system rather than pinning either.
  setTheme("auto");
  expect(["light", "dark"]).toContain(document.documentElement.dataset.theme);
  // And the choice survives a "reload" (a fresh read of prefs).
  const { recallPrefs } = await import("../lib/persist");
  expect(recallPrefs().theme).toBe("auto");
});

test("settings opens from the status bar and Escape closes it", async () => {
  const gear = [...app.host.querySelectorAll("footer button")].find(
    (b) => b.getAttribute("aria-label") === "Settings",
  ) as HTMLButtonElement;
  expect(gear).toBeTruthy();
  gear.click();
  await sleep(60);
  const dialog = document.querySelector("[role=dialog][aria-label=Settings]");
  expect(dialog).toBeTruthy();
  // Theme options are right there.
  const labels = [...dialog!.querySelectorAll("button")].map((b) => b.textContent?.trim());
  for (const want of ["Auto", "Dark", "Light"]) expect(labels).toContain(want);
  document.activeElement?.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await sleep(40);
  expect(document.querySelector("[role=dialog][aria-label=Settings]")).toBeNull();
});

test("? opens the help, which knows the tools and the keys", async () => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
  await sleep(60);
  const dialog = document.querySelector("[role=dialog][aria-label='How dab works']");
  expect(dialog).toBeTruthy();
  const text = dialog!.textContent ?? "";
  expect(text).toContain("Pencil");
  expect(text).toContain("Right-click everything");
  expect(text).toContain("Parts");
  // Keys are inert while it is up — the dialog owns the keyboard.
  const before = editor.tool;
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true }));
  await sleep(20);
  expect(editor.tool).toBe(before);
});

test("a first visit opens the help by itself, once", async () => {
  app.stop();
  localStorage.removeItem("sprite-editor:prefs");
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const mounted = mount(App, { target: host });
  await sleep(80);
  const dialog = document.querySelector("[role=dialog][aria-label='How dab works']");
  expect(dialog).toBeTruthy();
  // Closing marks it seen, so the next mount stays quiet.
  const draw = [...dialog!.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Draw",
  ) as HTMLButtonElement;
  draw.click();
  await sleep(40);
  const { recallPrefs } = await import("../lib/persist");
  expect(recallPrefs().seenHelp).toBe(true);
  unmount(mounted);
  host.remove();
  // Restore for the harness teardown, which will run app.stop() again harmlessly.
  const host2 = document.createElement("div");
  document.body.appendChild(host2);
  const m2 = mount(App, { target: host2 });
  await sleep(40);
  expect(document.querySelector("[role=dialog][aria-label='How dab works']")).toBeNull();
  unmount(m2);
  host2.remove();
  app = { host: host2, stop: () => {} };
});
