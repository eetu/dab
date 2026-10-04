import { createHash } from "node:crypto";
import { readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  fromJson,
  isPartBody,
  isPartRef,
  type SpriteBody,
  type SpriteFile,
  toJson,
  validateSprite,
} from "dab-core";

// The server owns the files, inside one root folder. Every read hands out a
// version — a hash of the bytes on disk — and every write must quote the one it
// was based on, so a save made in the editor between a read and a write is a
// refusal rather than something silently overwritten.

/** What a refusal is about, so HTTP can answer with the right status. */
export type Refusal = "refused" | "stale" | "invalid" | "outside" | "missing";

export class ToolError extends Error {
  constructor(
    message: string,
    readonly kind: Refusal = "refused",
    /** For a stale write: the version on disk now, or null if it is gone. */
    readonly current: string | null = null,
  ) {
    super(message);
  }
}

/** Refuse, with a sentence that says what to do about it. */
export function fail(message: string, kind?: Refusal, current?: string | null): never {
  throw new ToolError(message, kind, current);
}

export const versionOf = (text: string): string =>
  createHash("sha256").update(text).digest("hex").slice(0, 12);

/** A write quotes the version it read; anything else on disk is someone's save. */
export function checkVersion(file: string, base: string, current: string): void {
  if (base === current) return;
  fail(
    `${file} changed on disk since version ${base} (it is now ${current}) — someone saved it. ` +
      `Read it again and redo the edit against what is there now.`,
    "stale",
    current,
  );
}

let writes = 0;

export type Loaded = { file: string; version: string; sprite: SpriteFile };

const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";

export class Store {
  private constructor(readonly root: string) {}

  static async open(root: string): Promise<Store> {
    return new Store(await realpath(root));
  }

  /** `file` as a path inside the root: `car`, `car.json` and `cars/car.json`
   *  all work, and anything that climbs out is refused. */
  async locate(file: string): Promise<{ rel: string; abs: string }> {
    const name = file.endsWith(".json") ? file : `${file}.json`;
    const abs = path.resolve(this.root, name);
    const rel = path.relative(this.root, abs);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
      fail(`${file} is outside the sprite folder ${this.root}; name a file inside it`, "outside");
    }
    // A symlink inside the root may still point out of it.
    const real = await realpath(abs).catch(async (e) => {
      if (!missing(e)) throw e;
      // Not written yet: then it is its folder that has to be inside.
      const dir = await realpath(path.dirname(abs)).catch(() => path.dirname(abs));
      return path.join(dir, path.basename(abs));
    });
    const back = path.relative(this.root, real);
    if (back.startsWith("..") || path.isAbsolute(back)) {
      fail(`${file} leads outside the sprite folder ${this.root}`, "outside");
    }
    return { rel: rel.split(path.sep).join("/"), abs };
  }

  /** A file's text as it is on disk, and its version. */
  async read(file: string): Promise<{ file: string; version: string; text: string }> {
    const { rel, abs } = await this.locate(file);
    const text = await readFile(abs, "utf8").catch((e) =>
      missing(e)
        ? fail(`${rel} does not exist — list_sprites shows what does`, "missing")
        : Promise.reject(e),
    );
    return { file: rel, version: versionOf(text), text };
  }

  async load(file: string): Promise<Loaded> {
    const { file: rel, version, text } = await this.read(file);
    const read = fromJson(text);
    if ("errors" in read) {
      fail(`${rel} is not a valid sprite:\n- ${read.errors.join("\n- ")}`, "invalid");
    }
    return { file: rel, version, sprite: read.sprite };
  }

  /**
   * Write a sprite, if the file is still the version the edit was based on.
   * `null` means the file must not exist yet. Validated and written by core,
   * through a rename, so a reader never sees half a file.
   */
  async save(
    file: string,
    base: string | null,
    sprite: SpriteFile,
  ): Promise<{ file: string; version: string; changed: boolean }> {
    const { rel, abs } = await this.locate(file);
    const errors = validateSprite(sprite);
    if (errors.length) {
      fail(`that edit would make ${rel} invalid:\n- ${errors.join("\n- ")}`, "invalid");
    }
    const now = await this.current(abs);
    if (base === null && now !== null) {
      fail(`${rel} already exists — read it and edit it instead`, "stale", versionOf(now));
    }
    if (base !== null) {
      if (now === null) fail(`${rel} has been deleted since version ${base}`, "stale", null);
      checkVersion(rel, base, versionOf(now));
    }
    const text = toJson(sprite);
    if (text === now) return { file: rel, version: versionOf(text), changed: false };
    const tmp = path.join(
      path.dirname(abs),
      `.${path.basename(abs)}.${process.pid}.${writes++}.tmp`,
    );
    try {
      await writeFile(tmp, text);
      await rename(tmp, abs);
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
    return { file: rel, version: versionOf(text), changed: true };
  }

  /** Delete a file, if it is still the version the caller last saw. */
  async remove(file: string, base: string): Promise<void> {
    const { rel, abs } = await this.locate(file);
    const now = await this.current(abs);
    if (now === null) fail(`${rel} does not exist`, "missing");
    checkVersion(rel, base, versionOf(now));
    await rm(abs);
  }

  private current(abs: string): Promise<string | null> {
    return readFile(abs, "utf8").catch((e) => (missing(e) ? null : Promise.reject(e)));
  }

  /** Every `.json` under the root, as root-relative paths. `deep: false` is the
   *  root alone, which is the folder the editor shows. */
  async list({ deep = true } = {}): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string) => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".") || e.name === "node_modules") continue;
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (deep) await walk(abs);
        } else if (e.name.endsWith(".json")) out.push(path.relative(this.root, abs));
      }
    };
    await walk(this.root);
    return out.map((f) => f.split(path.sep).join("/")).sort();
  }

  /** What a sprite's `use` parts draw: the sprites they name, from its folder.
   *  Loaded up front, since a flatten asks synchronously. */
  async resolver(loaded: Loaded): Promise<(name: string) => SpriteBody | null> {
    const names = new Set<string>();
    const walk = (n: SpriteBody) => {
      for (const p of n.parts ?? []) {
        if (isPartRef(p)) names.add(p.use);
        else if (isPartBody(p)) walk(p);
      }
    };
    walk(loaded.sprite);
    const dir = path.posix.dirname(loaded.file);
    const found = new Map<string, SpriteBody>();
    for (const name of names) {
      const other = await this.load(path.posix.join(dir, name)).catch(() => null);
      if (other) found.set(name, other.sprite);
    }
    return (name) => found.get(name) ?? null;
  }
}
