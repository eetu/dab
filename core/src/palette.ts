import { type SpriteBody, TRANSPARENT } from "./format";
import { patch } from "./patch";

/** Characters a sprite may use, in a stable order, skipping the taken ones. */
export const PALETTE_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+*=#@%&$";

export function nextFreeChar(s: SpriteBody): string | null {
  const taken = new Set([...Object.keys(s.palette), TRANSPARENT]);
  for (const ch of PALETTE_CHARS) if (!taken.has(ch)) return ch;
  return null;
}

export function addColour<T extends SpriteBody>(s: T, hex: string): T {
  const ch = nextFreeChar(s);
  if (!ch) return s;
  return patch(s, { palette: { ...s.palette, [ch]: hex } });
}

/** Rewrite every variant's character → colour entries, keeping their order.
 *  A variant may only name characters the palette has, so a palette edit that
 *  drops or renames one has to reach in here too, or the file fails to load. */
const mapVariants = (
  s: SpriteBody,
  fn: (entry: [string, string]) => [string, string] | null,
): SpriteBody["variants"] =>
  s.variants &&
  Object.fromEntries(
    Object.entries(s.variants).map(([name, colours]) => [
      name,
      Object.fromEntries(
        Object.entries(colours).flatMap((e) => {
          const kept = fn(e);
          return kept ? [kept] : [];
        }),
      ),
    ]),
  );

/**
 * Drop a colour and erase every pixel that used it.
 *
 * The alternative — leaving the character in place with no colour — produces a
 * file that fails validation the moment it is reloaded, which is a worse
 * surprise than losing the pixels you asked to drop.
 */
export function removeColour<T extends SpriteBody>(s: T, ch: string): T {
  const palette = { ...s.palette };
  delete palette[ch];
  const frames = s.frames.map((f) => f.map((row) => row.split(ch).join(TRANSPARENT)));
  const variants = mapVariants(s, (e) => (e[0] === ch ? null : e));
  return patch(s, { palette, frames, variants });
}

/** Move a colour to a different character, rewriting every pixel that used it. */
export function renameChar<T extends SpriteBody>(s: T, from: string, to: string): T {
  if (from === to || to === TRANSPARENT || to.length !== 1 || s.palette[to]) return s;
  const palette: Record<string, string> = {};
  for (const [ch, hex] of Object.entries(s.palette)) palette[ch === from ? to : ch] = hex;
  const frames = s.frames.map((f) => f.map((row) => row.split(from).join(to)));
  const variants = mapVariants(s, ([ch, hex]) => [ch === from ? to : ch, hex]);
  return patch(s, { palette, frames, variants });
}

export const setColour = <T extends SpriteBody>(s: T, ch: string, hex: string): T =>
  patch(s, { palette: { ...s.palette, [ch]: hex } });

/**
 * Move a colour to a different place in the palette.
 *
 * The map's order is the order the editor lists swatches in AND the order
 * `toJson` writes them in, so this is an edit to the document rather than a
 * view preference — a palette grouped light-to-dark stays that way in the file
 * and in the diff.
 */
export function movePaletteChar<T extends SpriteBody>(s: T, ch: string, to: number): T {
  const chars = Object.keys(s.palette);
  const from = chars.indexOf(ch);
  if (from < 0 || from === to || to < 0 || to >= chars.length) return s;
  const next = [...chars];
  next.splice(from, 1);
  next.splice(to, 0, ch);
  return patch(s, { palette: Object.fromEntries(next.map((c) => [c, s.palette[c]])) });
}

/** Palette entries no frame uses — the editor offers to sweep these up. A part
 *  has its own palette, so this is one node's question and not the tree's. */
export function unusedChars(s: SpriteBody): string[] {
  const used = new Set<string>();
  for (const f of s.frames) for (const row of f) for (const ch of row) used.add(ch);
  return Object.keys(s.palette).filter((ch) => !used.has(ch));
}

/**
 * Colours from a palette file, in its order: Lospec's `.hex` (one `RRGGBB` a
 * line, `#` optional) or GIMP's `.gpl` (`R G B name` a line, after a header).
 * Eight hex digits are read as `RRGGBBAA`, which is what this format writes
 * when a colour has alpha. Lines that are not colours — headers, comments,
 * blanks — are skipped rather than refused: these files are hand-edited.
 */
export function readPaletteFile(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const hex = /^#?([0-9a-f]{6}(?:[0-9a-f]{2})?)$/i.exec(line);
    if (hex) {
      out.push(`#${hex[1].toLowerCase()}`);
      continue;
    }
    const gpl = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s|$)/.exec(line);
    if (gpl) {
      const [r, g, b] = gpl.slice(1, 4).map((v) => Math.min(255, Number(v)));
      out.push(`#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
    }
  }
  return out;
}

/** A palette as a file another tool can read. `.gpl` has no alpha, so a
 *  see-through colour is written as its colour; `.hex` keeps the digits. */
export function writePaletteFile(
  palette: Record<string, string>,
  format: "hex" | "gpl",
  name: string,
): string {
  const entries = Object.entries(palette);
  if (format === "hex") return entries.map(([, c]) => c.slice(1)).join("\n") + "\n";
  const rows = entries.map(([ch, c]) => {
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
    return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${ch}`;
  });
  return `GIMP Palette\nName: ${name}\nColumns: 8\n#\n${rows.join("\n")}\n`;
}

/**
 * Add colours, each on the next free character. One the palette already has
 * is skipped — two characters for one colour is the drift the bundle tools
 * exist to end — and so is everything past the last free character.
 */
export function addColours<T extends SpriteBody>(
  s: T,
  hexes: readonly string[],
): { sprite: T; added: string[]; skipped: number } {
  const have = new Set(Object.values(s.palette).map((c) => c.toLowerCase()));
  let next = s;
  const added: string[] = [];
  for (const hex of hexes) {
    const c = hex.toLowerCase();
    if (have.has(c)) continue;
    const ch = nextFreeChar(next);
    if (!ch) break;
    next = patch(next, { palette: { ...next.palette, [ch]: c } });
    have.add(c);
    added.push(ch);
  }
  return { sprite: next, added, skipped: hexes.length - added.length };
}
