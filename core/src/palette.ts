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
  return patch(s, { palette, frames });
}

/** Move a colour to a different character, rewriting every pixel that used it. */
export function renameChar<T extends SpriteBody>(s: T, from: string, to: string): T {
  if (from === to || to === TRANSPARENT || to.length !== 1 || s.palette[to]) return s;
  const palette: Record<string, string> = {};
  for (const [ch, hex] of Object.entries(s.palette)) palette[ch === from ? to : ch] = hex;
  const frames = s.frames.map((f) => f.map((row) => row.split(from).join(to)));
  return patch(s, { palette, frames });
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
