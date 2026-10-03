import { type SpriteBody, TRANSPARENT, variantNames } from "./format";
import { patch } from "./patch";

// Colour cycling — Deluxe Paint's cycle ranges — said in palette variants.
//
// A cycle rotates a run of palette entries, so water flows and lights chase at
// no cost in frames. It is written as one variant per PHASE, `name 1` …
// `name n`, each naming only the characters it rotates. The file gains no key
// and a consumer gains no rule: it draws `name k` with the same
// `variant?.[ch] ?? palette[ch]` as any other variant, and picks k from its own
// clock the way it picks frames. A key with a rate would put timing in the
// file, which is the consumer's, and a second lookup in every reader.
//
// The phases hold colours, not references, so they go stale when the palette
// changes under them. `refreshCycles` re-derives them from the palette — the way
// a DPaint cycle follows the registers it rotates.

export type Cycle = {
  name: string;
  /** The characters it rotates, in order: each phase moves every colour one
   *  place along this list. */
  chars: string[];
  /** Whether the colours move toward the start of `chars` instead. */
  reverse: boolean;
  /** Its variant names, phase 1 first. */
  phases: string[];
};

export const phaseName = (name: string, k: number): string => `${name} ${k + 1}`;

/**
 * Every phase's colours, one per character. Phase 1 is the palette as it
 * stands, so a consumer's clock may start anywhere and the art is still the art
 * at its start.
 */
export function cyclePhases(
  palette: Record<string, string>,
  chars: readonly string[],
  reverse = false,
): Record<string, string>[] {
  const n = chars.length;
  return Array.from({ length: n }, (_, k) => {
    const step = reverse ? -k : k;
    return Object.fromEntries(
      chars.map((ch, i) => [ch, palette[chars[(((i - step) % n) + n) % n]]]),
    );
  });
}

/**
 * The order a variant can keep. Any JS object lists integer-like keys first and
 * ascending, so a phase written over `A 1 B` reads back as `1 A B` and turns the
 * other way. The palette is under the same rule, so a run picked in palette
 * order is already in it; anything else is put in it here, before it is
 * written, so the cycle read back is the cycle that was asked for.
 */
const keyOrder = (chars: readonly string[]): string[] =>
  Object.keys(Object.fromEntries(chars.map((ch) => [ch, ch])));

const sameColours = (a: Record<string, string>, b: Record<string, string>): boolean => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};

/**
 * The cycles a node carries, in the order their first phases are declared.
 *
 * Read off the variants rather than stored anywhere: a cycle is every `name`
 * whose variants run `name 1` … `name n`, where n is the number of characters
 * phase 1 names and each phase is phase 1 turned that many places. The last
 * condition is what keeps two hand-made colourways called `night 1` and
 * `night 2` from being read as one.
 */
export function cyclesOf(s: SpriteBody): Cycle[] {
  const variants = s.variants ?? {};
  const out: Cycle[] = [];
  for (const first of variantNames(s)) {
    const m = /^(.+) 1$/.exec(first);
    if (!m) continue;
    const name = m[1];
    const chars = Object.keys(variants[first]);
    const n = chars.length;
    if (n < 2) continue;
    const phases = Array.from({ length: n }, (_, k) => phaseName(name, k));
    if (!phases.every((p) => variants[p]) || variants[phaseName(name, n)]) continue;
    const fits = (reverse: boolean) =>
      cyclePhases(variants[first], chars, reverse).every((want, k) =>
        sameColours(variants[phases[k]], want),
      );
    if (fits(false)) out.push({ name, chars, reverse: false, phases });
    else if (fits(true)) out.push({ name, chars, reverse: true, phases });
  }
  return out;
}

/** Variant names already taken, so a new or renamed cycle cannot land on one. */
const clashes = (s: SpriteBody, name: string, n: number, own: readonly string[] = []) =>
  Array.from({ length: n }, (_, k) => phaseName(name, k)).some(
    (p) => s.variants?.[p] && !own.includes(p),
  );

/**
 * Add a cycle over `chars` as the variants `name 1` … `name n`, after the rest.
 *
 * Unchanged when it cannot be one: fewer than two characters, one the palette
 * has not got, or a name whose phases would overwrite variants that exist.
 */
export function addCycle<T extends SpriteBody>(
  s: T,
  name: string,
  chars: readonly string[],
  reverse = false,
): T {
  const key = name.trim();
  const order = keyOrder(chars);
  if (!key || order.length < 2 || order.length !== chars.length) return s;
  if (order.some((ch) => ch === TRANSPARENT || !(ch in s.palette))) return s;
  if (clashes(s, key, order.length)) return s;
  const phases = cyclePhases(s.palette, order, reverse).map((v, k) => [phaseName(key, k), v]);
  return patch(s, { variants: { ...(s.variants ?? {}), ...Object.fromEntries(phases) } });
}

/**
 * Write the given cycles' phases again from the palette as it is now.
 *
 * Pass the cycles from BEFORE an edit that drops a colour: a phase that has lost
 * a character is no longer a turn of phase 1, so the cycle cannot be read off
 * the result — but it can be rebuilt over the characters that are left, and one
 * left with fewer than two is no cycle at all and goes. Each cycle's phases stay
 * where the first of them was declared.
 */
export function refreshCycles<T extends SpriteBody>(s: T, cycles: Cycle[] = cyclesOf(s)): T {
  if (!cycles.length || !s.variants) return s;
  const owner = new Map<string, Cycle>();
  for (const c of cycles) for (const p of c.phases) owner.set(p, c);
  const out: [string, Record<string, string>][] = [];
  for (const [name, colours] of Object.entries(s.variants)) {
    const c = owner.get(name);
    if (!c) out.push([name, colours]);
    else if (name === c.phases[0]) {
      const chars = c.chars.filter((ch) => ch in s.palette);
      if (chars.length < 2) continue;
      cyclePhases(s.palette, chars, c.reverse).forEach((v, k) =>
        out.push([phaseName(c.name, k), v]),
      );
    }
  }
  return patch(s, { variants: out.length ? Object.fromEntries(out) : undefined });
}

/** A cycle's phases, gone together. */
export function removeCycle<T extends SpriteBody>(s: T, name: string): T {
  const c = cyclesOf(s).find((x) => x.name === name);
  if (!c) return s;
  return refreshCycles(s, [{ ...c, chars: [] }]);
}

/** Every phase renamed in place, so the cycle keeps its position in the file. */
export function renameCycle<T extends SpriteBody>(s: T, from: string, to: string): T {
  const key = to.trim();
  const c = cyclesOf(s).find((x) => x.name === from);
  if (!c || !key || key === from || clashes(s, key, c.phases.length, c.phases)) return s;
  const index = new Map(c.phases.map((p, k) => [p, k]));
  return patch(s, {
    variants: Object.fromEntries(
      Object.entries(s.variants ?? {}).map(([n, v]) =>
        index.has(n) ? [phaseName(key, index.get(n)!), v] : [n, v],
      ),
    ),
  });
}

/** The same colours, flowing the other way. */
export function reverseCycle<T extends SpriteBody>(s: T, name: string): T {
  const c = cyclesOf(s).find((x) => x.name === name);
  return c ? refreshCycles(s, [{ ...c, reverse: !c.reverse }]) : s;
}
