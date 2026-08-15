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

type Chrome = {
  folded: Record<string, boolean>;
  hidden: Record<string, boolean>;
  underlay: Underlay;
};

const load = (): Chrome => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Chrome>;
    return { folded: raw.folded ?? {}, hidden: raw.hidden ?? {}, underlay: raw.underlay ?? "full" };
  } catch {
    return { folded: {}, hidden: {}, underlay: "full" };
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

export function setUnderlay(id: Underlay): void {
  panels.underlay = id;
  save();
}

export const showing = (id: Region): boolean => !panels.hidden[id];
