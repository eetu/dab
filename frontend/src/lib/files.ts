// Reading and writing sprite files on the real disk.
//
// Two ways in. A dev server running dab's Vite plugin SERVES a folder (see
// cli/src/vite.ts): any browser, no picker, and every write quotes the
// version it replaces, so a file the model changed since is a question rather
// than a loss. Otherwise the File System Access API, with a download/upload
// fallback: picking the repo's sprites folder once turns Save into an actual
// write to the file the scene imports. Browsers without it (Firefox, Safari)
// get a working editor whose Save is a download.
import { fromJson, type SpriteFile, toJson } from "dab-core";

import { forgetFolder, recallFolder, rememberFolder } from "./persist";

/** Minimal shapes of the File System Access API, which TS's DOM lib omits. */
type FileHandle = {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
};
type DirHandle = {
  name: string;
  values(): AsyncIterable<FileHandle & { kind: "file" | "directory" }>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandle>;
  removeEntry?(name: string): Promise<void>;
  queryPermission?(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
};
type Picker = {
  showDirectoryPicker?: (opts?: { mode?: "read" | "readwrite" }) => Promise<DirHandle>;
  showOpenFilePicker?: (opts?: unknown) => Promise<FileHandle[]>;
  showSaveFilePicker?: (opts?: unknown) => Promise<FileHandle>;
};

const picker = (): Picker => window as unknown as Picker;

export const canWriteToDisk = (): boolean => typeof picker().showDirectoryPicker === "function";

export type Folder =
  | { kind: "disk"; handle: DirHandle; name: string }
  /** `id` is the folder's path on the serving machine — its identity, since
   *  two projects can both call theirs `sprites`. `versions` is what each file
   *  was when last listed or written: what the next write of it replaces.
   *  `writing` is the files this tab has a write in flight to, whose change
   *  can come back on the feed before the write's own answer does. */
  | {
      kind: "served";
      name: string;
      id: string;
      versions: Map<string, string>;
      writing: Set<string>;
    };

/** Where dab's Vite plugin serves the folder. */
export const API = "/__dab/api";

/** A file changed on disk since the editor last saw it. */
export class Conflict extends Error {
  constructor(
    readonly file: string,
    /** The version on disk now, or null when it is gone. */
    readonly current: string | null,
  ) {
    super(`${file} changed on disk`);
  }
}

/** Write over what a conflict found — after asking. */
export function takeVersion(folder: Folder, c: Conflict): void {
  if (folder.kind !== "served") return;
  if (c.current) folder.versions.set(c.file, c.current);
  else folder.versions.delete(c.file);
}

/** The folder a dev server is serving, if this page came from one. */
export async function servedFolder(): Promise<Folder | null> {
  try {
    const res = await fetch(`${API}/files`);
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) return null;
    const { name, root } = (await res.json()) as { name: string; root: string };
    return { kind: "served", name, id: root, versions: new Map(), writing: new Set() };
  } catch {
    return null;
  }
}

/**
 * A served folder's changes as they happen — the model writing a sprite,
 * another tab saving one — each with its version now, or null once it is
 * gone. This tab's own writes are left out: they answer for themselves.
 */
export function watchFolder(
  folder: Folder,
  on: (file: string, version: string | null) => void,
): () => void {
  if (folder.kind !== "served" || typeof EventSource === "undefined") return () => {};
  const source = new EventSource(`${API}/events`);
  source.onmessage = (e: MessageEvent<string>) => {
    const { file, version } = JSON.parse(e.data) as { file: string; version: string | null };
    if (folder.writing.has(file)) return;
    // Already known: this tab's own write, answered before the feed caught up —
    // or a file it deleted, which it has already forgotten.
    if (version === null ? !folder.versions.has(file) : folder.versions.get(file) === version) {
      return;
    }
    on(file, version);
  };
  return () => source.close();
}

/** A served write, marked in flight for as long as it is. */
async function writing<T>(
  folder: Folder & { kind: "served" },
  file: string,
  run: () => Promise<T>,
) {
  folder.writing.add(file);
  try {
    return await run();
  } finally {
    folder.writing.delete(file);
  }
}

/** Ask for a folder — repo/packages/player/src/sprites, normally. Remembered,
 *  so this is asked once and not once per reload. */
export async function pickFolder(): Promise<Folder | null> {
  const show = picker().showDirectoryPicker;
  if (!show) return null;
  const handle = await show({ mode: "readwrite" });
  await rememberFolder(handle);
  return { kind: "disk", handle, name: handle.name };
}

/** The folder from a previous session, if the browser kept the handle. */
export async function restoreFolder(): Promise<Folder | null> {
  const handle = await recallFolder<DirHandle>();
  return handle ? { kind: "disk", handle, name: handle.name } : null;
}

export const dropFolder = (): Promise<unknown> => forgetFolder();

/** Is the folder already writable, without asking? Chrome can keep the grant
 *  across reloads; when it hasn't, `requestPermission` needs a user gesture,
 *  which is why this is separate from ensureWritable. */
export async function isWritable(folder: Folder): Promise<boolean> {
  if (folder.kind === "served") return true;
  return (await folder.handle.queryPermission?.({ mode: "readwrite" })) === "granted";
}

/** Re-ask for write permission. Must be called from a user gesture. */
export async function ensureWritable(folder: Folder): Promise<boolean> {
  if (folder.kind === "served" || (await isWritable(folder))) return true;
  const r = await folder.handle.requestPermission?.({ mode: "readwrite" });
  return r === "granted";
}

export type Entry = { file: string; sprite: SpriteFile };
export type LoadResult = { entries: Entry[]; problems: { file: string; errors: string[] }[] };

type Listing = LoadResult & { entries: (Entry & { version: string })[] };

/** Every *.json in the folder that parses as a sprite, plus what didn't. */
export async function listSprites(folder: Folder): Promise<LoadResult> {
  if (folder.kind === "served") {
    const res = await fetch(`${API}/files`);
    if (!res.ok) throw new Error(`${folder.name} could not be listed`);
    const { entries, problems } = (await res.json()) as Listing;
    folder.versions.clear();
    for (const e of entries) folder.versions.set(e.file, e.version);
    return { entries: entries.map(({ file, sprite }) => ({ file, sprite })), problems };
  }
  const entries: Entry[] = [];
  const problems: { file: string; errors: string[] }[] = [];
  for await (const handle of folder.handle.values()) {
    if (handle.kind !== "file" || !handle.name.endsWith(".json")) continue;
    const text = await (await handle.getFile()).text();
    const parsed = fromJson(text);
    if ("errors" in parsed) problems.push({ file: handle.name, errors: parsed.errors });
    else entries.push({ file: handle.name, sprite: parsed.sprite });
  }
  entries.sort((a, b) => a.file.localeCompare(b.file));
  return { entries, problems };
}

/** Write straight into the folder, under the name the sprite carries. A served
 *  folder throws `Conflict` when the file is not what the editor last saw. */
export async function saveToFolder(folder: Folder, sprite: SpriteFile): Promise<string> {
  const file = `${sprite.name}.json`;
  if (folder.kind === "served") {
    const known = folder.versions.get(file);
    // Marked until the new version is recorded, not just until the answer
    // starts: in between, the feed's word on this write would read as news.
    return writing(folder, file, async () => {
      const res = await fetch(`${API}/files/${encodeURIComponent(file)}`, {
        method: "PUT",
        body: toJson(sprite),
        headers: known ? { "if-match": `"${known}"` } : { "if-none-match": "*" },
      });
      const body = (await res.json()) as { version?: string | null; error?: string };
      if (res.status === 412) throw new Conflict(file, body.version ?? null);
      if (!res.ok || !body.version) throw new Error(body.error ?? `${file} was not saved`);
      folder.versions.set(file, body.version);
      return file;
    });
  }
  const handle = await folder.handle.getFileHandle(file, { create: true });
  const w = await handle.createWritable();
  await w.write(toJson(sprite));
  await w.close();
  return file;
}

/**
 * Save, and move rather than copy when the sprite has been renamed.
 *
 * A rename that leaves the old file behind is not a rename — you end up with
 * two sprites, the scene still importing the stale one, and no way to tell from
 * the folder which is current. The new file is written FIRST and the old one
 * removed only once that succeeded, so a failure loses nothing.
 */
export async function saveSprite(
  folder: Folder,
  sprite: SpriteFile,
  previousFile: string | null,
): Promise<{ file: string; removed: string | null }> {
  const file = await saveToFolder(folder, sprite);
  if (!previousFile || previousFile === file) return { file, removed: null };
  // Not fatal when this fails: the save landed. The stale file is reported so
  // the status line can say it is still there rather than claim a clean rename.
  return { file, removed: (await deleteFromFolder(folder, previousFile)) ? previousFile : null };
}

/** Delete one file from the folder. The caller decides what that means for the
 *  editor — this only touches the disk. A served file that changed since it
 *  was listed is not deleted. */
export async function deleteFromFolder(folder: Folder, file: string): Promise<boolean> {
  if (folder.kind === "served") {
    const known = folder.versions.get(file);
    if (!known) return false;
    return writing(folder, file, async () => {
      const res = await fetch(`${API}/files/${encodeURIComponent(file)}`, {
        method: "DELETE",
        headers: { "if-match": `"${known}"` },
      });
      if (res.ok) folder.versions.delete(file);
      return res.ok;
    });
  }
  try {
    await folder.handle.removeEntry?.(file);
    return true;
  } catch {
    return false;
  }
}

// ---------- fallbacks, for browsers without the API ----------

export function downloadSprite(sprite: SpriteFile): void {
  const blob = new Blob([toJson(sprite)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${sprite.name}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Hand bytes to the browser as a download — what an export is, everywhere. */
export function downloadBytes(name: string, bytes: Uint8Array, type: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function readDroppedFiles(files: FileList | File[]): Promise<LoadResult> {
  const entries: Entry[] = [];
  const problems: { file: string; errors: string[] }[] = [];
  for (const f of Array.from(files)) {
    if (!f.name.endsWith(".json")) continue;
    const parsed = fromJson(await f.text());
    if ("errors" in parsed) problems.push({ file: f.name, errors: parsed.errors });
    else entries.push({ file: f.name, sprite: parsed.sprite });
  }
  return { entries, problems };
}
