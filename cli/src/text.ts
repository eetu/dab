import { isPaletteKey, isPartRef, LEVEL, nodeAt, type SpriteBody, TRANSPARENT } from "dab-core";

import { fail } from "./store";

// Text is the main representation: rows of characters, as the file has them.
// What a model needs on top is help COUNTING — it slips in a 54-wide row — so a
// ruled grid splits columns into tens with a space, numbers every row, and
// labels each ten. A space is never a palette key, so it can never be art, and
// rows written back may keep them.

/** A `node` argument as a path: "" is the sprite, "doorL/handle" a part,
 *  "@far" a level. */
export function parseNode(node: string | undefined): string[] {
  const s = (node ?? "").trim().replace(/^\/+|\/+$/g, "");
  return s ? s.split("/") : [];
}

export const where = (file: string, path: readonly string[]): string =>
  path.length ? `${file} › ${path.join("/")}` : file;

/** The node a path names, or a refusal that says what is there instead. */
export function findNode(sprite: SpriteBody, file: string, path: readonly string[]): SpriteBody {
  const found = nodeAt(sprite, path);
  if (found) return found;
  if (path.length === 1 && path[0].startsWith(LEVEL)) {
    const names = (sprite.levels ?? []).map((l) => LEVEL + l.name);
    fail(
      `${file} has no level ${path[0]}; ${names.length ? `its levels: ${names.join(", ")}` : "it has none"}`,
    );
  }
  let node = sprite;
  for (let i = 0; i < path.length; i++) {
    const part = (node.parts ?? []).find((p) => p.name === path[i]);
    const here = where(file, path.slice(0, i));
    if (!part) {
      const names = (node.parts ?? []).map((p) => p.name);
      fail(
        `${here} has no part ${path[i]}; ${names.length ? `its parts: ${names.join(", ")}` : "it has none"}`,
      );
    }
    if (isPartRef(part)) {
      fail(
        `${where(file, path.slice(0, i + 1))} borrows ${part.use}.json — edit that file instead`,
      );
    }
    node = part;
  }
  return node;
}

export function checkFrame(node: SpriteBody, label: string, frame: number): void {
  const n = node.frames.length;
  if (!Number.isInteger(frame) || frame < 0 || frame >= n) {
    fail(
      `frame ${frame} is out of range: ${label} has ${n} frame${n === 1 ? "" : "s"}, 0–${n - 1}`,
    );
  }
}

/** Every character `rows` paints with must be `.` or in the palette. */
export function checkChars(node: SpriteBody, label: string, chars: Iterable<string>): void {
  const bad = new Set<string>();
  for (const ch of chars) if (ch !== TRANSPARENT && !(ch in node.palette)) bad.add(ch);
  if (!bad.size) return;
  const list = [...bad].map((c) => JSON.stringify(c)).join(", ");
  const keys = Object.keys(node.palette).join("") || "(empty)";
  const hint = [...bad].every(isPaletteKey)
    ? "add it with the palette tool first"
    : "a palette key is one printable ASCII character";
  fail(
    `${list} ${bad.size === 1 ? "is" : "are"} not in ${label}'s palette (${keys}, and . for nothing); ${hint}`,
  );
}

/**
 * Rows of a frame as a ruled grid in the node's own coordinates: `x0, y0` is
 * where `rows` starts. Tens are split by a space and labelled with where they
 * start; a units line sits under the labels.
 */
export function ruled(rows: readonly string[], x0 = 0, y0 = 0): string {
  const w = rows[0]?.length ?? 0;
  const yw = String(y0 + rows.length - 1).length;
  const gutter = " ".repeat(yw + 2);
  const split = (cells: (i: number) => string) => {
    let out = "";
    for (let i = 0; i < w; i++) {
      if (i > 0 && (x0 + i) % 10 === 0) out += " ";
      out += cells(i);
    }
    return out;
  };
  // Each ten's label sits over its first column, padded to the ten's width; a
  // partial ten too narrow for its label goes without.
  let labels = "";
  for (let i = 0; i < w;) {
    const x = x0 + i;
    if (i > 0) labels += " ";
    const span = Math.min(10 - (x % 10), w - i);
    const label = String(x);
    labels += label.length <= span ? label.padEnd(span) : " ".repeat(span);
    i += span;
  }
  const lines = [gutter + labels.trimEnd(), gutter + split((i) => String((x0 + i) % 10))];
  rows.forEach((row, j) => {
    lines.push(`${String(y0 + j).padStart(yw)}  ${split((i) => row[i])}`);
  });
  return lines.join("\n");
}

/** Rows as they are written back: a ruled grid's spaces taken out. */
export const unspaced = (rows: readonly string[]): string[] => rows.map((r) => r.replace(/ /g, ""));

/** The palette entries `rows` use, one per line. */
export function legend(node: SpriteBody, rows: readonly string[]): string {
  const used = new Set(rows.join(""));
  const lines = Object.entries(node.palette)
    .filter(([ch]) => used.has(ch))
    .map(([ch, hex]) => `${ch} ${hex}`);
  return lines.length ? lines.join("\n") : "(nothing drawn here)";
}

/** Cells that differ between two frames of one size, as `[x, y]`. */
export function changed(a: readonly string[], b: readonly string[]): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < Math.max(a.length, b.length); y++) {
    const ra = a[y] ?? "";
    const rb = b[y] ?? "";
    for (let x = 0; x < Math.max(ra.length, rb.length); x++) {
      if (ra[x] !== rb[x]) out.push([x, y]);
    }
  }
  return out;
}
