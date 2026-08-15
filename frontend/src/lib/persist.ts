// What survives a reload: the folder you saved into, the file you had open, and
// any unsaved work.
//
// The dev server reloads the page on every edit to the editor's own source, and
// picking the sprites folder again each time — then losing the drawing that was
// in progress — is the difference between a tool you use and one you fight. A
// directory handle is structured-cloneable, so IndexedDB can hold the real
// thing; the draft is JSON in localStorage.

import { fromJson, type SpriteFile, toJson } from "dab-core";

const DB_NAME = "sprite-editor";
const STORE = "handles";
const FOLDER_KEY = "folder";
const FILE_KEY = "sprite-editor:file";
const DRAFT_KEY = "sprite-editor:draft";
const SAVED_KEY = "sprite-editor:saved";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (!("indexedDB" in globalThis)) return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        const req = run(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => resolve(null);
      }),
  );
}

/** Remember the picked folder. The handle itself, not a path — a path would be
 *  useless, since the browser will only ever hand back access via the handle. */
export const rememberFolder = (handle: unknown): Promise<unknown> =>
  tx("readwrite", (s) => s.put(handle, FOLDER_KEY));

export const recallFolder = <T>(): Promise<T | null> => tx<T>("readonly", (s) => s.get(FOLDER_KEY));

export const forgetFolder = (): Promise<unknown> => tx("readwrite", (s) => s.delete(FOLDER_KEY));

// ---------- the open file, and unsaved work ----------

export function rememberFile(file: string | null) {
  try {
    if (file) localStorage.setItem(FILE_KEY, file);
    else localStorage.removeItem(FILE_KEY);
  } catch {
    /* private mode; the editor still works, it just forgets */
  }
}

export function recallFile(): string | null {
  try {
    return localStorage.getItem(FILE_KEY);
  } catch {
    return null;
  }
}

/**
 * The unsaved document.
 *
 * Kept separately from the file list so a reload mid-drawing comes back to the
 * drawing rather than to the last saved state — losing work to a hot reload is
 * the one failure this tool must not have.
 */
export function rememberDraft(sprite: SpriteFile, file: string | null) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ file, sprite: toJson(sprite) }));
  } catch {
    /* quota or private mode — nothing to do but carry on */
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function recallDraft(): Held | null {
  return recall(DRAFT_KEY);
}

/**
 * The document as it last stood on disk — opened or saved.
 *
 * Undo lives in memory, so a reload leaves the restored draft with nothing
 * behind it: the work is safely back but there is no way to decide against it.
 * A reload should not be the one gesture that makes a change permanent. Kept
 * here rather than re-read from the file so Revert works with the folder's
 * permission lapsed, which after a cold start is the normal state.
 */
export function rememberSaved(sprite: SpriteFile, file: string | null) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify({ file, sprite: toJson(sprite) }));
  } catch {
    /* quota or private mode — Revert is then simply unavailable */
  }
}

export function forgetSaved() {
  try {
    localStorage.removeItem(SAVED_KEY);
  } catch {
    /* ignore */
  }
}

export function recallSaved(): Held | null {
  return recall(SAVED_KEY);
}

/** What Revert would go back to, named — or null if there is nothing to go back
 *  to. Reads the label only, so it can be asked on every edit without parsing a
 *  sprite to answer whether a button should be live. */
export function savedFile(): string | null {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return null;
    return (JSON.parse(raw) as { file: string | null }).file ?? "the last saved state";
  } catch {
    return null;
  }
}

// ---------- the workbench ----------

/**
 * How you like the desk: tool, toggles, speeds, backdrops. Global, one blob —
 * unlike the draft these are not document state, so opening file B keeps them
 * and a reload hands back your desk along with your drawing.
 *
 * What is deliberately NOT here: zoom/pan (auto-fit is the right answer after a
 * reload), selection, variant and clip (per-document — they reset with it).
 */
export type Prefs = {
  tool?: string;
  onion?: boolean;
  grid?: boolean;
  fps?: number;
  backdrop?: string;
  previewZoom?: "fit" | number;
};

const PREFS_KEY = "sprite-editor:prefs";

export function rememberPrefs(patch: Prefs) {
  try {
    const held = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Prefs;
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...held, ...patch }));
  } catch {
    /* private mode; the desk resets, the work does not */
  }
}

export function recallPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Prefs;
  } catch {
    return {};
  }
}

type Held = { file: string | null; sprite: SpriteFile };

function recall(key: string): Held | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const held = JSON.parse(raw) as { file: string | null; sprite: string };
    const parsed = fromJson(held.sprite);
    // One that no longer parses is dropped rather than resurrected: the format
    // may have moved on since it was written.
    if ("errors" in parsed) return null;
    return { file: held.file, sprite: parsed.sprite };
  } catch {
    return null;
  }
}
