import { encodeGif, encodePng, flattenSprite, levelOf, picture, type Pose } from "dab-core";

import { animationRun, playLength } from "./animations.svelte";
import { cycleShowing } from "./cycles.svelte";
import { editor } from "./state.svelte";
import { activeNode, frameOf, pathKey, resolvePart, stageNode } from "./tree.svelte";

// Images to hand to something that is not dab (core's image.ts writes them).
// What is exported is what the canvas shows: the assembly with every part where
// it is posed, hidden ones left out, in the colourway on screen — the bake
// `flattenSprite` does, once per output frame.

/** The stage as the canvas would draw it with the active node at `index`, in
 *  `variant`: one flat body, one frame. */
function pose(index: number, variant: string | null): Pose {
  const node = stageNode();
  const base = levelOf(editor.path) !== null ? editor.path : [];
  // The node being flattened shows its own frame — the active one's index if it
  // is the one being drawn, otherwise where it sits — and the rest are asked.
  const own = base.length || !editor.path.length ? index : frameOf([], node, index);
  const flat = flattenSprite(
    { ...node, frames: [node.frames[Math.min(own, node.frames.length - 1)]] },
    {
      resolve: resolvePart,
      frameOf: (path, n) => frameOf([...base, ...path], n, index),
      hidden: (path) => !!editor.hidden[pathKey([...base, ...path])],
      variant,
    },
  );
  return { body: { w: flat.w, h: flat.h, palette: flat.palette, frames: flat.frames }, frame: 0 };
}

export type ExportKind = "png" | "gif";

/** What an export would write: the poses, its name, and its rate. A GIF walks
 *  the run the play head walks — frames and a cycle's phases together, so one
 *  frame whose colours cycle exports as the water flowing. */
export function exportPlan(kind: ExportKind): { poses: Pose[]; name: string; fps: number } {
  const level = levelOf(editor.path);
  const stem = level ? `${editor.sprite.name}-${level}` : editor.sprite.name;
  if (kind === "png") {
    return { poses: [pose(editor.frame, editor.variant)], name: `${stem}.png`, fps: editor.fps };
  }
  const node = activeNode();
  const run = animationRun(node);
  const cycle = cycleShowing();
  const from = cycle && editor.variant ? cycle.phases.indexOf(editor.variant) : 0;
  const poses = Array.from({ length: playLength(node) }, (_, s) =>
    pose(
      run[s % run.length],
      cycle ? cycle.phases[(from + s) % cycle.phases.length] : editor.variant,
    ),
  );
  const name = editor.animation ? `${stem}-${editor.animation}.gif` : `${stem}.gif`;
  return { poses, name, fps: editor.fps };
}

/** Encode an export: the file's name, its bytes and its type. */
export async function exportImage(
  kind: ExportKind,
  scale: number,
): Promise<{ name: string; bytes: Uint8Array; type: string; frames: number }> {
  const plan = exportPlan(kind);
  const pic = picture(plan.poses, scale);
  if (kind === "png") {
    return { name: plan.name, bytes: await encodePng(pic), type: "image/png", frames: 1 };
  }
  const delay = 100 / Math.max(1, plan.fps);
  return {
    name: plan.name,
    bytes: encodeGif(pic, delay),
    type: "image/gif",
    frames: pic.frames.length,
  };
}
