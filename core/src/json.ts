import { isPartRef, type Part, type SpriteBody, type SpriteFile } from "./format.ts";
import { validateSprite } from "./validate.ts";

/**
 * Stable JSON: keys in a fixed order and one frame row per line.
 *
 * Written by hand rather than with JSON.stringify's indent, because the default
 * puts every row on its own heavily-indented line and the point of this format
 * is that a frame reads as a picture in the diff.
 */
export function toJson(s: SpriteFile): string {
  const entries: [string, string][] = [["name", q(s.name)], ...bodyEntries(s, "  ")];
  return `{\n${entries.map(([k, v]) => `  ${q(k)}: ${v}`).join(",\n")}\n}\n`;
}

const q = (v: unknown): string => JSON.stringify(v);

/** A `{ … }` whose entries sit one level in from `ind` and whose brace closes on
 *  `ind` — the shape every block below is written to. */
const mapBlock = <V>(o: Record<string, V>, ind: string, fmt: (v: V) => string): string =>
  `{\n${Object.entries(o)
    .map(([k, v]) => `${ind}  ${q(k)}: ${fmt(v)}`)
    .join(",\n")}\n${ind}}`;

const framesBlock = (frames: string[][], ind: string): string =>
  `[\n${frames
    .map((f) => `${ind}  [\n${f.map((row) => `${ind}    ${q(row)}`).join(",\n")}\n${ind}  ]`)
    .join(",\n")}\n${ind}]`;

/**
 * A node's keys, in a fixed order, with `ind` the indent its key lines sit at.
 *
 * One line per variant and per animation: they are short, and a diff of a recolour or
 * a retimed animation should read as one changed line rather than a reflowed
 * block. Frames keep one row per line at every depth, which is the whole reason
 * this writer exists instead of `JSON.stringify`'s indent.
 */
function bodyEntries(n: SpriteBody, ind: string): [string, string][] {
  const out: [string, string][] = [
    ["w", String(n.w)],
    ["h", String(n.h)],
    ["palette", mapBlock(n.palette, ind, q)],
  ];
  if (n.variants && Object.keys(n.variants).length) {
    out.push(["variants", mapBlock(n.variants, ind, q)]);
  }
  if (n.animations && Object.keys(n.animations).length)
    out.push(["animations", mapBlock(n.animations, ind, q)]);
  out.push(["frames", framesBlock(n.frames, ind)]);
  if (n.parts?.length) {
    out.push([
      "parts",
      `[\n${n.parts.map((p) => `${ind}  ${partBlock(p, ind + "  ")}`).join(",\n")}\n${ind}]`,
    ]);
  }
  if (n.levels?.length) {
    out.push([
      "levels",
      `[\n${n.levels.map((l) => `${ind}  ${namedBlock(l.name, l, ind + "  ")}`).join(",\n")}\n${ind}]`,
    ]);
  }
  return out;
}

/** A level: its name, then a body like any other. */
function namedBlock(name: string, body: SpriteBody, ind: string): string {
  const entries: [string, string][] = [["name", q(name)], ...bodyEntries(body, ind)];
  return `{\n${entries.map(([k, v]) => `${ind}  ${q(k)}: ${v}`).join(",\n")}\n${ind}}`;
}

function partBlock(p: Part, ind: string): string {
  const head: [string, string][] = [
    ["name", q(p.name)],
    ["x", String(p.x)],
    ["y", String(p.y)],
  ];
  if (p.behind) head.push(["behind", "true"]);
  if (p.flip) head.push(["flip", q(p.flip)]);
  // A reference is four short values; on one line a moved wheel is one changed
  // line, which is the same thing the frame rows are after.
  if (isPartRef(p)) {
    return `{ ${[...head, ["use", q(p.use)]].map(([k, v]) => `${q(k)}: ${v}`).join(", ")} }`;
  }
  const entries = [...head, ...bodyEntries(p, ind)];
  return `{\n${entries.map(([k, v]) => `${ind}  ${q(k)}: ${v}`).join(",\n")}\n${ind}}`;
}

/**
 * `clips` was this key's first name, and files on disk still carry it.
 *
 * Read as the new name, at every depth, on the way in — so nothing downstream
 * has two names for one thing, and the next save writes `animations`. A node
 * carrying both keeps the new one: it has already been through here.
 */
function readAnimations(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(readAnimations);
  if (!value || typeof value !== "object") return value;
  const node = { ...(value as Record<string, unknown>) };
  if ("clips" in node) {
    if (!("animations" in node)) node.animations = node.clips;
    delete node.clips;
  }
  if (Array.isArray(node.parts)) node.parts = node.parts.map(readAnimations);
  return node;
}

export function fromJson(text: string): { sprite: SpriteFile } | { errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { errors: [`not JSON: ${(e as Error).message}`] };
  }
  const sprite = readAnimations(parsed);
  const errors = validateSprite(sprite);
  return errors.length ? { errors } : { sprite: sprite as SpriteFile };
}
