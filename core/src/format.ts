import { patch } from "./patch";

/** Mirror a part's own grid. Free in this format: reverse rows, reverse each. */
export type Flip = "h" | "v" | "hv";

/**
 * A grid and everything that colours it — the shape a sprite and a part share.
 *
 * The sharing is the point: a part with a body IS a sprite, so `setPixels`,
 * `resizeSprite`, `addFrame` and the rest apply to a part with no second
 * implementation. What a part adds on top is only where it sits.
 */
export type SpriteBody = {
  w: number;
  h: number;
  /** Character → `#rrggbb` or `#rrggbbaa`. Order is the palette's order in
   *  the editor, and the order the file is written in. */
  palette: Record<string, string>;
  /**
   * Named alternate colours, each overriding a subset of `palette`. A consumer
   * picks one by name; nothing here is required, and a sprite with no variants
   * is simply drawn in its palette.
   */
  variants?: Record<string, Record<string, string>>;
  /**
   * Named runs of frame indices. Repeats are legal and mean a hold; reversing is
   * reading the list backwards, so there is no direction field and no duration —
   * a consumer's clock is its own.
   */
  animations?: Record<string, number[]>;
  /** One entry per animation frame; each is `h` rows of `w` characters. */
  frames: string[][];
  /** Children, drawn in list order after this grid — see `Part`. */
  parts?: Part[];
};

/** Where a part sits on its parent, in the parent's own pixel coordinates. */
export type Placement = {
  /** Unique among its siblings: the key a consumer holds this part's state under. */
  name: string;
  x: number;
  y: number;
  /** Draw before the parent's own grid rather than after — a seat behind a body,
   *  showing through the windows. Godot spells this `show_behind_parent`. */
  behind?: boolean;
  flip?: Flip;
};

/**
 * A part: a placement, plus either its own pixels or the name of a sprite in the
 * same folder to draw there.
 *
 * Inline for composition, which is intrinsic — a car's trunk lid is not a thing
 * apart from that car, and giving it a file of its own would split one subject
 * across two documents and put its offset out of reach of the undo stack.
 * `use` for reuse, which is a link — one wheel drawn once and fixed once for
 * every car in the folder.
 */
export type Part = Placement & (SpriteBody | { use: string });

export type SpriteFile = SpriteBody & { name: string };

/** How deep inline parts may nest. A backstop against a malformed file, not a
 *  design goal — nothing real is four levels of car. */
export const MAX_PART_DEPTH = 4;

export const TRANSPARENT = ".";

/** A part that names another sprite rather than carrying pixels. */
export const isPartRef = (p: Part): p is Placement & { use: string } => "use" in p;

/** A part that carries its own pixels — and is therefore a sprite. */
export const isPartBody = (p: Part): p is Placement & SpriteBody => !("use" in p);

/**
 * What a cell paints as: the variant's colour for that character if the named
 * variant has one, otherwise the palette's.
 *
 * This is the whole rule a consumer needs — the reason the format is the contract
 * and there is no library to depend on.
 */
export function cellColour(s: SpriteBody, ch: string, variant?: string | null): string | null {
  if (ch === TRANSPARENT) return null;
  if (variant) {
    const alt = s.variants?.[variant]?.[ch];
    if (alt) return alt;
  }
  return s.palette[ch] ?? null;
}

/**
 * What a colour may look like: `#rrggbb`, or `#rrggbbaa` for one you can see
 * through.
 *
 * Eight digits rather than a separate alpha map, because a canvas and a
 * stylesheet both take that string as it stands — so the one-line rule a
 * consumer needs does not grow a second lookup to handle glass. It is also how
 * an indexed PNG says it, one alpha per palette entry in `tRNS`.
 *
 * `.` is still the only way to say NOTHING IS HERE. A colour ending `00` is a
 * colour that happens to be invisible, which is a different statement and one
 * the format has no reason to forbid.
 */
export const COLOUR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

/** How opaque a colour is, 0–255. A colour with no alpha digits is opaque. */
export const alphaOf = (hex: string): number =>
  hex.length === 9 ? parseInt(hex.slice(7, 9), 16) : 255;

/** The same colour at a different opacity. 255 drops the digits again, so a
 *  colour that is opaque is written the short way it always was. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hex.slice(0, 7);
  const a = Math.max(0, Math.min(255, Math.round(alpha)));
  return a >= 255 ? rgb : `${rgb}${a.toString(16).padStart(2, "0")}`;
}

/** The variant names a sprite offers, in declaration order. */
export const variantNames = (s: SpriteBody): string[] => Object.keys(s.variants ?? {});

/**
 * A part's grid, mirrored. Shared with consumers rather than left to each,
 * because a flipped part has to look the same in the editor as in the game.
 */
export function flipRows(rows: string[], flip?: Flip): string[] {
  if (!flip) return rows;
  const v = flip === "v" || flip === "hv" ? [...rows].reverse() : rows;
  return flip === "h" || flip === "hv" ? v.map((r) => [...r].reverse().join("")) : v;
}

export const blankFrame = (w: number, h: number): string[] =>
  Array.from({ length: h }, () => TRANSPARENT.repeat(w));

export function blankSprite(name: string, w: number, h: number): SpriteFile {
  return { name, w, h, palette: {}, frames: [blankFrame(w, h)] };
}

/** Deep copy. Rows are strings, so only the arrays need cloning. */
export function cloneSprite<T extends SpriteBody>(s: T): T {
  return patch(s, {
    palette: { ...s.palette },
    variants: s.variants
      ? Object.fromEntries(Object.entries(s.variants).map(([k, v]) => [k, { ...v }]))
      : undefined,
    animations: s.animations
      ? Object.fromEntries(Object.entries(s.animations).map(([k, v]) => [k, [...v]]))
      : undefined,
    frames: s.frames.map((f) => [...f]),
    parts: s.parts?.map((p) => (isPartRef(p) ? { ...p } : cloneSprite(p))),
  });
}
