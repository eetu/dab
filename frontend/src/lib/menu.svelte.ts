// The popup menu, as one thing the whole app shares.
//
// A panel gains actions faster than it gains room for them — the palette alone
// wants rename, remove, send to the other parts and take their colour, and that
// is four buttons on every swatch for a row that is already five columns wide.
// So the actions live in a menu and the row keeps one trigger.
//
// One menu, opened by whoever wants it, rather than a component per call site:
// only one can be on screen at a time, and it has to be able to sit outside the
// panel it was opened from without being clipped by it.

export type MenuItem =
  | {
      kind?: "item";
      label: string;
      /** The reason, or what it will cost — shown quiet, on the right. */
      hint?: string;
      /** A colour chip before the label, for actions that are about one. */
      swatch?: string;
      danger?: boolean;
      disabled?: boolean;
      run: () => void;
    }
  | { kind: "separator" };

export const menu = $state({
  open: false,
  x: 0,
  y: 0,
  /** What the menu is about, shown as a heading — a swatch's character, a part's
   *  name. Without it a menu of four verbs says nothing about its subject. */
  title: "",
  items: [] as MenuItem[],
});

/** Whether an event target is somewhere a person types. Text fields keep the
 *  BROWSER's menu — paste and spellcheck live there — and that exception has to
 *  win even when an ancestor row or canvas has a menu of its own, so every
 *  handler checks here rather than each remembering to. */
export const typing = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable === true;
};

/**
 * Open at the pointer. Pass the event so a right-click and a click on a trigger
 * both land in the same place, and so the default browser menu is suppressed
 * exactly when ours replaces it.
 *
 * Disabled items are KEPT, greyed, with their reason as the hint. An action
 * that vanishes teaches that it does not exist; one that greys with "this part
 * is borrowed" teaches how the tool works.
 */
export function openMenu(e: MouseEvent, title: string, items: MenuItem[]): void {
  if (typing(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
  menu.x = e.clientX;
  menu.y = e.clientY;
  menu.title = title;
  menu.items = items;
  menu.open = true;
}

export function closeMenu(): void {
  menu.open = false;
  menu.items = [];
}
