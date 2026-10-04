// A folder served by dab's Vite plugin, against a fake of its API.
//
// The point of serving is that every write quotes the version it replaces, so
// a file the model rewrote while the editor had it open is a question, never a
// silent loss. The fake keeps the server's rules: If-Match must be the version
// on disk, If-None-Match: * means the file must not exist, a miss is 412 with
// the version there now.
import { toJson } from "dab-core";
import { mount, unmount } from "svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import App from "../App.svelte";
import { editor, history, loadSprite, undoEdit } from "../lib/editor.svelte";
import {
  Conflict,
  type Folder,
  listSprites,
  saveSprite,
  servedFolder,
  takeVersion,
} from "../lib/files";
import { clearDraft, rememberDraft } from "../lib/persist";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const sign = (row: string, name = "sign") => ({
  name,
  w: 2,
  h: 1,
  palette: { A: "#ff0000", B: "#0000ff" },
  frames: [[row]],
});

/** The folder the fake serves, as the plugin names it: by its path. */
const ROOT = "/work/game/src/sprites";

type Call = { method: string; file: string; match?: string; fresh?: boolean };

function fakeApi() {
  let n = 0;
  const disk = new Map<string, { text: string; version: string }>();
  const write = (file: string, text: string) => disk.set(file, { text, version: `v${++n}` });
  const calls: Call[] = [];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const fetch = async (url: string, init: RequestInit = {}) => {
    const path = new URL(url, location.href).pathname;
    if (!path.startsWith("/__dab/api/files")) return new Response("", { status: 404 });
    const file = decodeURIComponent(path.slice("/__dab/api/files/".length));
    const headers = (init.headers ?? {}) as Record<string, string>;
    const method = init.method ?? "GET";
    const match = headers["if-match"]?.replace(/"/g, "");
    calls.push({ method, file, match, fresh: headers["if-none-match"] === "*" });
    const now = disk.get(file);
    if (!file) {
      const entries = [...disk].map(([f, d]) => ({
        file: f,
        version: d.version,
        sprite: JSON.parse(d.text),
      }));
      return json(200, { name: "sprites", root: ROOT, entries, problems: [] });
    }
    if (match ? now?.version !== match : now) {
      return json(412, { error: "stale", version: now?.version ?? null });
    }
    if (method === "DELETE") {
      disk.delete(file);
      return new Response(null, { status: 204 });
    }
    write(file, String(init.body));
    return json(200, { file, version: disk.get(file)!.version, changed: true });
  };
  return { disk, write, calls, fetch };
}

let api: ReturnType<typeof fakeApi>;

/** The change feed, faked: the test says when a file changed on disk. */
class FakeFeed {
  static open: FakeFeed[] = [];
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  constructor(readonly url: string) {
    FakeFeed.open.push(this);
  }
  close() {
    FakeFeed.open = FakeFeed.open.filter((f) => f !== this);
  }
}
/** Something else — the model — wrote `file`; the feed says so. */
function theyWrote(file: string, rows: string) {
  api.write(file, toJson(sign(rows)));
  const version = api.disk.get(file)!.version;
  for (const f of FakeFeed.open) {
    f.onmessage?.({ data: JSON.stringify({ file, version }) } as MessageEvent<string>);
  }
}

beforeEach(() => {
  api = fakeApi();
  api.write("sign.json", toJson(sign("AB")));
  vi.stubGlobal("fetch", api.fetch);
  vi.stubGlobal("EventSource", FakeFeed);
});
afterEach(() => vi.unstubAllGlobals());

test("a served folder is found, and a save quotes the version it was listed at", async () => {
  const folder = (await servedFolder())!;
  expect(folder).toMatchObject({ kind: "served", name: "sprites" });
  const { entries } = await listSprites(folder);
  expect(entries.map((e) => e.file)).toEqual(["sign.json"]);

  await saveSprite(folder, sign("BB"), "sign.json");
  expect(api.calls.at(-1)).toMatchObject({ method: "PUT", file: "sign.json", match: "v1" });
  expect(api.disk.get("sign.json")!.text).toBe(toJson(sign("BB")));
});

test("a file changed since it was listed is a Conflict, and overwriting is a second, explicit step", async () => {
  const folder = (await servedFolder())! as Folder;
  await listSprites(folder);
  api.write("sign.json", toJson(sign("AA"))); // the model, meanwhile

  const err = await saveSprite(folder, sign("BB"), "sign.json").catch((e: unknown) => e);
  expect(err).toBeInstanceOf(Conflict);
  expect((err as Conflict).current).toBe("v2");
  expect(api.disk.get("sign.json")!.text).toBe(toJson(sign("AA")));

  takeVersion(folder, err as Conflict);
  await saveSprite(folder, sign("BB"), "sign.json");
  expect(api.disk.get("sign.json")!.text).toBe(toJson(sign("BB")));
});

test("a new file says it is new, and a rename deletes the old file at its version", async () => {
  const folder = (await servedFolder())!;
  await listSprites(folder);
  const res = await saveSprite(folder, sign("AB", "board"), "sign.json");
  expect(res).toEqual({ file: "board.json", removed: "sign.json" });
  expect(api.calls.find((c) => c.method === "PUT")).toMatchObject({
    file: "board.json",
    fresh: true,
  });
  expect(api.calls.find((c) => c.method === "DELETE")).toMatchObject({
    file: "sign.json",
    match: "v1",
  });
  expect([...api.disk.keys()]).toEqual(["board.json"]);
});

/** The app mounted over the fake folder; `stop` takes it down. */
async function mountApp() {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(host);
  const app = mount(App, { target: host });
  await sleep(80);
  return {
    host,
    stop: () => {
      unmount(app);
      host.remove();
      clearDraft();
    },
  };
}

test("a draft from elsewhere — the demo car — is not restored over a served folder", async () => {
  rememberDraft({ ...sign("AA"), name: "car" }, null);
  const { stop } = await mountApp();
  try {
    expect(editor.sprite.name).not.toBe("car");
    expect(editor.dirty).toBe(false);
    expect(editor.status).toContain("sprites: 1 sprite — open one");
  } finally {
    stop();
  }
});

test("a first visit to a served folder opens neither the help nor the demo car", async () => {
  localStorage.setItem("sprite-editor:prefs", JSON.stringify({ seenHelp: false }));
  const { host, stop } = await mountApp();
  try {
    expect(editor.sprite.name).not.toBe("car");
    const helpButton = host.querySelector("header button[title^='Help']");
    expect(helpButton?.classList.contains("active") ?? false).toBe(false);
    expect(document.querySelector("[role=dialog], .veil")).toBeNull();
  } finally {
    stop();
    localStorage.setItem("sprite-editor:prefs", JSON.stringify({ seenHelp: true }));
  }
});

test("a draft from another project whose folder is also called sprites stays out", async () => {
  rememberDraft(sign("BB"), "sign.json", "/work/other/src/sprites");
  const { stop } = await mountApp();
  try {
    expect(editor.dirty).toBe(false);
    expect(editor.sprite.frames[0]).not.toEqual(["BB"]);
  } finally {
    stop();
  }
});

test("a draft drawn in this served folder comes back", async () => {
  rememberDraft(sign("BB"), "sign.json", ROOT);
  const { stop } = await mountApp();
  try {
    expect(editor.sprite.frames[0]).toEqual(["BB"]);
    expect(editor.dirty).toBe(true);
  } finally {
    stop();
  }
});

test("the editor opens on the served folder, and asks before saving over a newer file", async () => {
  const { host, stop } = await mountApp();
  try {
    const folderButton = [...host.querySelectorAll("header button")].find((b) =>
      b.textContent?.includes("Folder: sprites"),
    ) as HTMLButtonElement;
    expect(folderButton.disabled).toBe(true);

    loadSprite(sign("AB"), "sign.json");
    editor.sprite = { ...editor.sprite, frames: [["BB"]] };
    editor.dirty = true;
    api.write("sign.json", toJson(sign("AA"))); // the model, meanwhile

    const save = host.querySelector("header button.save") as HTMLButtonElement;
    save.click();
    await sleep(80);
    const overwrite = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Overwrite",
    );
    expect(overwrite).toBeTruthy();
    expect(api.disk.get("sign.json")!.text).toBe(toJson(sign("AA")));

    overwrite!.click();
    await sleep(80);
    expect(api.disk.get("sign.json")!.text).toBe(toJson(sign("BB")));
    expect(editor.dirty).toBe(false);
  } finally {
    stop();
  }
});

/** The app on the served folder, with sign.json open as it is on disk. */
async function openSign() {
  const app = await mountApp();
  loadSprite(sign("AB"), "sign.json");
  return app;
}

test("a file the model rewrote is reloaded as one step undo takes back", async () => {
  const { stop } = await openSign();
  try {
    theyWrote("sign.json", "AA");
    await sleep(60);
    expect(editor.sprite.frames[0]).toEqual(["AA"]);
    expect(editor.dirty).toBe(false);
    expect(history.undo).toBe(1);
    expect(editor.status).toContain("sign.json changed on disk — reloaded");

    undoEdit();
    expect(editor.sprite.frames[0]).toEqual(["AB"]);
  } finally {
    stop();
  }
});

test("unsaved work is never replaced: it is kept, and Save asks before writing over theirs", async () => {
  const { host, stop } = await openSign();
  try {
    editor.sprite = { ...editor.sprite, frames: [["BB"]] };
    editor.dirty = true;
    theyWrote("sign.json", "AA");
    await sleep(60);
    expect(editor.sprite.frames[0]).toEqual(["BB"]);
    expect(editor.statusBad).toBe(true);
    expect(editor.status).toContain("your edits are kept");

    (host.querySelector("header button.save") as HTMLButtonElement).click();
    await sleep(80);
    const overwrite = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Overwrite",
    );
    expect(overwrite).toBeTruthy();
    expect(api.disk.get("sign.json")!.text).toBe(toJson(sign("AA")));
    (document.querySelector(".veil") as HTMLElement | null)?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  } finally {
    stop();
  }
});

test("this tab's own save coming back on the feed is not news", async () => {
  const { host, stop } = await openSign();
  try {
    editor.sprite = { ...editor.sprite, frames: [["BB"]] };
    editor.dirty = true;
    (host.querySelector("header button.save") as HTMLButtonElement).click();
    await sleep(80);
    const saved = api.disk.get("sign.json")!;
    for (const f of FakeFeed.open) {
      f.onmessage?.({
        data: JSON.stringify({ file: "sign.json", version: saved.version }),
      } as MessageEvent<string>);
    }
    await sleep(60);
    expect(editor.status).toBe("saved sign.json");
    expect(history.undo).toBe(0);
  } finally {
    stop();
  }
});
