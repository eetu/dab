// What the chrome is showing and how the canvas is drawing, remembered.
//
// Two granularities, because they do different jobs. FOLDING a panel reclaims
// the height it was taking in its rail — useful when a sprite has no variants
// and that panel is just a heading. HIDING a region reclaims the whole column
// or bar, which folding cannot do at all: fold every panel in the right rail
// and you still have 16rem of empty background beside the canvas.
//
// Both survive a reload. A panel you closed reopening on every dev-server
// restart is worse than one that never closed.

const KEY = "dab.chrome";

/** The three pieces of chrome around the canvas. */
export type Region = "left" | "right" | "dock";

/**
 * Which list the Navigate region is showing.
 *
 * Chrome, so it is a global pref: which tab you left open is about the desk,
 * and opening another sprite must not move it.
 */
export type NavTab = "parts" | "folder";

/**
 * How the parts you are not drawing on are drawn.
 *
 * Solid by default: a part sitting on a body is a solid thing sitting on a
 * body, and drawing it see-through says something about the art that is not
 * true. Dim is for the moment you cannot tell which pixels are yours, and
 * outline for when even a dim copy is in the way — both of them a mode you
 * turn on, not the way the sprite looks.
 */
export type Underlay = "full" | "dim" | "outline";
export const UNDERLAYS: { id: Underlay; label: string; hint: string }[] = [
  { id: "full", label: "Solid", hint: "Parts drawn as they are" },
  { id: "dim", label: "Dim", hint: "Parts drawn back, so the part you are on reads" },
  { id: "outline", label: "Outline", hint: "Parts as silhouettes only" },
];

/**
 * The loupe: the sprite at a small fixed zoom, over the canvas.
 *
 * The one thing a canvas zoomed to ×29 cannot say is how the art reads at the
 * size it will be drawn at. ×1 is that size; the zoom is a knob because ×1 of a
 * 16×16 wheel on a 4K display is a postage stamp, and the question is "does this
 * read", not "is this literally one device pixel".
 *
 * A corner rather than a free position: a window that can sit anywhere sits over
 * the art half the time, and four choices are all this ever needed.
 */
export type Corner = "tl" | "tr" | "bl" | "br";
export const LOUPE_ZOOMS = [1, 2, 3, 4, 6, 8] as const;

type Loupe = { on: boolean; zoom: number; corner: Corner };

type Chrome = {
  folded: Record<string, boolean>;
  hidden: Record<string, boolean>;
  underlay: Underlay;
  nav: NavTab;
  loupe: Loupe;
};

const LOUPE: Loupe = { on: false, zoom: 1, corner: "br" };

const load = (): Chrome => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Chrome>;
    return {
      folded: raw.folded ?? {},
      hidden: raw.hidden ?? {},
      underlay: raw.underlay ?? "full",
      nav: raw.nav ?? "parts",
      loupe: { ...LOUPE, ...raw.loupe },
    };
  } catch {
    return { folded: {}, hidden: {}, underlay: "full", nav: "parts", loupe: { ...LOUPE } };
  }
};

export const panels = $state(load());

const save = () => {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        folded: panels.folded,
        hidden: panels.hidden,
        underlay: panels.underlay,
        nav: panels.nav,
        loupe: panels.loupe,
      }),
    );
  } catch {
    /* private mode, or a full quota: it still works for this session */
  }
};

export function toggleFold(id: string): void {
  panels.folded = { ...panels.folded, [id]: !panels.folded[id] };
  save();
}

export function toggleRegion(id: Region): void {
  panels.hidden = { ...panels.hidden, [id]: !panels.hidden[id] };
  save();
}

export function toggleLoupe(on = !panels.loupe.on): void {
  panels.loupe = { ...panels.loupe, on };
  save();
}

/** A stepper rather than a row of chips: the loupe is too small to hold one,
 *  and which zoom fits is the window's business, so the steps are picked there. */
export function setLoupeZoom(zoom: number): void {
  panels.loupe = { ...panels.loupe, zoom };
  save();
}

export function setLoupeCorner(corner: Corner): void {
  panels.loupe = { ...panels.loupe, corner };
  save();
}

export function setNavTab(id: NavTab): void {
  panels.nav = id;
  save();
}

export function setUnderlay(id: Underlay): void {
  panels.underlay = id;
  save();
}

export const showing = (id: Region): boolean => !panels.hidden[id];
