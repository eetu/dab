import { type Slice, type SpriteBody } from "./format.ts";
import { patch } from "./patch.ts";

// Slices: a sprite in depth (see `Slice`). A new one is a copy of the one in front of it, as a
// new level is derived and then drawn over: what lies a voxel further back mostly has the
// outline of what lies in front of it, and redrawing that from nothing is the slow part.

/** A slice put in right behind slice `after` (0 the sprite's own grid, the front), a copy of it. */
export function addSlice<T extends SpriteBody>(s: T, after = s.slices?.length ?? 0): T {
  const slices = [...(s.slices ?? [])];
  const at = Math.max(0, Math.min(after, slices.length));
  const from = at === 0 ? s.frames : slices[at - 1].frames;
  const copy: Slice = { frames: from.map((f) => [...f]) };
  slices.splice(at, 0, copy);
  return patch(s, { slices });
}

/** Slice `n` named `to`, a label only: its path is still `#n`. An empty name takes it off. */
export function renameSlice<T extends SpriteBody>(s: T, n: number, to: string): T {
  const slice = s.slices?.[n - 1];
  const name = to.trim() || undefined;
  if (!slice || slice.name === name) return s;
  const next: Slice = name ? { name, frames: slice.frames } : { frames: slice.frames };
  return patch(s, { slices: s.slices?.map((l, i) => (i === n - 1 ? next : l)) });
}

/** Slice `n` (1 right behind the front) taken out; the last one gone, the key goes too. */
export function removeSlice<T extends SpriteBody>(s: T, n: number): T {
  const slices = (s.slices ?? []).filter((_, i) => i !== n - 1);
  return patch(s, { slices: slices.length ? slices : undefined });
}
