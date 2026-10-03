---
name: dab-design
description: Visual identity for dab — a sibling in eetu's homebrew web app family. Layers dab's editor vocabulary (the marks on the canvas, the tool rail, the timeline) on top of the shared halo-design tokens. Use when building or styling dab's UI.
user-invocable: true
---

# dab-design

Shared tokens + conventions come from `halo-design`, in
`frontend/src/halo.css` (deviations listed in its header). Use the `--halo-*`
vars in Svelte `<style>` blocks. Below is dab's delta — most of it is what the
canvas says, because the canvas is the product.

## The four deltas

**Glyph / wordmark** — not yet. The header reads a plain `sprite editor`; a
family wordmark (`dab.` with a riff) and a glyph are owed.

**Layout / density** — the family shell (halo-interaction): Navigate left
(parts tree, levels, folder), the surface centre, Subject right (sprite,
palette, variants) with the tool rail beside it, the timeline docked across the
bottom, the status bar with the region toggles at its right end. Dense: rows of
small controls, `0.68–0.78rem` text, hairline borders inside panels.

**Voice** — lowercase, terse, the art's own nouns: frames, parts, levels,
phases, characters. A status says what happened (`exported car.gif · 8
frames`) or why not (`a level has no parts — add them to the sprite`), never
both, never cheerful.

## What the canvas says

One meaning per mark, everywhere it appears:

| mark                                 | means                                                    |
| ------------------------------------ | -------------------------------------------------------- |
| checker under the art                | transparent — `.`                                        |
| white marching ants                  | the marquee: what block operations act on                |
| accent ants + status chip            | a floating paste — not yet yours                         |
| white tint on cells                  | selected cells                                           |
| cool blue (`rgba(150, 205, 255, …)`) | an aid: hover hint, rotate arm, perspective grid, guides |
| blue-washed frame behind             | the onion skin (`ghost` in `render.ts`)                  |
| accent border                        | selected / active (frame, part row, swatch, lane cell)   |
| accent border, no fill               | picked with the selected part                            |
| dashed border                        | borrowed (`use`), or a frame a turn session has angled   |
| accent soft fill + accent border     | a frame in an animation lane                             |

Accent is unclaimed on the art itself, which is why a float takes it.

## Differences from the family baseline

|                | dab                                                     |
| -------------- | ------------------------------------------------------- |
| Theme          | `data-theme` with an auto/dark/light switch, dark-first |
| Fonts          | no Inter shipped — `system-ui` until it is              |
| Glyph/wordmark | owed                                                    |
| Hero           | the canvas at ×N, pixelated; the loupe shows it at ×1   |
| Extra hue      | the cool aid blue, never on the art and never for state |

## Source-of-truth files

- `frontend/src/halo.css` — tokens.
- `frontend/src/lib/Canvas.svelte` — the marks (ants, hints, part boxes).
- `frontend/src/lib/render.ts` — how art, dims, outlines and the ghost draw.
- `frontend/src/lib/{ToolRail,Frames,Palette,Parts}.svelte` — rail, timeline, palette, tree.
