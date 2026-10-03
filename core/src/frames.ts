import { blankFrame, type Level, type SpriteBody } from "./format";
import { patch } from "./patch";

/**
 * Move every animation's indices through the same permutation the frames just went
 * through. Returning null from `move` drops that entry, and an animation that empties
 * is dropped with it.
 *
 * Not optional: an animation left pointing past the end of a shortened strip is a file
 * that fails validation the next time it is opened, which is the same worse
 * surprise `removeColour` avoids by erasing the pixels it orphans.
 */
function remapAnimations(
  animations: Record<string, number[]> | undefined,
  move: (i: number) => number | null,
): Record<string, number[]> | undefined {
  if (!animations) return undefined;
  const out: Record<string, number[]> = {};
  for (const [name, list] of Object.entries(animations)) {
    const next = list.map(move).filter((i): i is number => i !== null);
    if (next.length) out[name] = next;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Carry a frame operation to every level. They are the same subject at other
 * sizes, and a frame added to one strip and not the other is a consumer
 * reading past the end of it — so this is not optional either.
 */
const inStep = <T extends SpriteBody>(s: T, next: T, op: (level: Level) => Level): T =>
  s.levels ? patch(next, { levels: s.levels.map(op) }) : next;

export function addFrame<T extends SpriteBody>(s: T, after = s.frames.length - 1): T {
  const at = after + 1;
  return inStep(
    s,
    patch(s, {
      frames: [...s.frames.slice(0, at), blankFrame(s.w, s.h), ...s.frames.slice(at)],
      // A blank frame joins no animation: it is not part of any animation until asked.
      animations: remapAnimations(s.animations, (i) => (i >= at ? i + 1 : i)),
    }),
    (l) => addFrame(l, after),
  );
}

/**
 * Put a run of ready-made frames in after `after`, as one operation.
 *
 * What a generated turn lands through: the frames arrive together, so the
 * animations that pointed past the insertion shift once rather than once per
 * frame. The new frames join no animation here — naming them is the caller's,
 * and the whole point of generating a run is usually that it gets a name.
 */
export function insertFrames<T extends SpriteBody>(s: T, after: number, frames: string[][]): T {
  if (!frames.length) return s;
  const at = Math.max(0, Math.min(s.frames.length, after + 1));
  // A level gets copies of its own frame where the run starts: the generated
  // frames are this size's art, and the copies are the start of the others'.
  return inStep(
    s,
    patch(s, {
      frames: [...s.frames.slice(0, at), ...frames.map((f) => [...f]), ...s.frames.slice(at)],
      animations: remapAnimations(s.animations, (i) => (i >= at ? i + frames.length : i)),
    }),
    (l) => {
      const from = l.frames[Math.max(0, Math.min(at - 1, l.frames.length - 1))];
      return insertFrames(
        l,
        after,
        frames.map(() => from),
      );
    },
  );
}

export function duplicateFrame<T extends SpriteBody>(s: T, index: number): T {
  return inStep(
    s,
    patch(s, {
      frames: [...s.frames.slice(0, index + 1), [...s.frames[index]], ...s.frames.slice(index + 1)],
      // The copy joins no animation either — a duplicate is a starting point, and an animation
      // that silently doubled a frame would be a hold nobody asked for.
      animations: remapAnimations(s.animations, (i) => (i > index ? i + 1 : i)),
    }),
    (l) => duplicateFrame(l, index),
  );
}

export function removeFrame<T extends SpriteBody>(s: T, index: number): T {
  if (s.frames.length <= 1) return s;
  return inStep(
    s,
    patch(s, {
      frames: s.frames.filter((_, i) => i !== index),
      animations: remapAnimations(s.animations, (i) =>
        i === index ? null : i > index ? i - 1 : i,
      ),
    }),
    (l) => removeFrame(l, index),
  );
}

export function moveFrame<T extends SpriteBody>(s: T, from: number, to: number): T {
  if (from === to || from < 0 || to < 0 || from >= s.frames.length || to >= s.frames.length)
    return s;
  const frames = [...s.frames];
  const [f] = frames.splice(from, 1);
  frames.splice(to, 0, f);
  return inStep(
    s,
    patch(s, {
      frames,
      animations: remapAnimations(s.animations, (i) => {
        if (i === from) return to;
        if (from < to) return i > from && i <= to ? i - 1 : i;
        return i >= to && i < from ? i + 1 : i;
      }),
    }),
    (l) => moveFrame(l, from, to),
  );
}
