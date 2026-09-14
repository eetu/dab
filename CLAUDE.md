# dab — repo overview

A pixel editor for character-grid sprites (rows of characters + a palette). Its
first customer is `../scene`'s neon-drive visualiser, but the format and the tool
are general. Sibling apps: `../scene` (consumer), `../nib` (whose canvas gesture
vocabulary this follows), `../raspi` (deploy).

## Layout

```text
core/        the format, its validator, and every pure operation on a sprite
             (pixels, shapes, flood, blocks, frames, palette, variants, parts,
             animations, JSON). Private to this repo; node-only tests.
frontend/    the editor — Vite + Svelte 5 (runes) SPA, browser-mode vitest
backend/     axum binary: serves frontend/dist with an SPA fallback, plus /status.
             No store and no upload route — the editor reaches the disk through
             the browser, so the server never sees a sprite.
```

## Conventions

- **The format is the contract; there is no library to depend on.** A cell's
  colour is `variant?.[ch] ?? palette[ch]`, with `.` transparent — one line, so a
  consumer owns its own reader and nothing has to be versioned between repos.
- **Nothing about a character is reserved.** Recolouring is expressed as named
  palette variants that override the entries they name and inherit the rest. The
  first cut of this format had `N`/`n` reserved for a "neon" pass with a hardcoded
  dim factor and one project's magenta/cyan defaults — that was one app's identity
  living in a general format.
- **A colour may carry alpha**: `#rrggbb` or `#rrggbbaa`. Eight digits rather
  than a parallel alpha map, so `variant?.[ch] ?? palette[ch]` stays the whole
  rule — a canvas takes that string as it is. Opaque is written the short way,
  so nothing gains digits it does not need and old files are unchanged.
- **A part is a sprite.** `SpriteBody` is the shape a sprite and a part share, so
  `setPixels`, `resizeSprite`, `addFrame` and the rest apply to a part with no
  second implementation. A part adds only where it sits — and either its own
  pixels or a `use` naming another sprite. Inline for composition, which is
  intrinsic to one subject; `use` for reuse, which is a link.
- **One document, a selected node.** `editor.path` names the part being drawn,
  and every mutation goes through `withNode`, so the tools keep knowing nothing
  about parts and a door drag stays one snapshot of the whole sprite. This is
  also what keeps a future MCP server (#12) a thin wrapper over core: path
  awareness lives in core, not in the editor.
- **Palettes are local to a node.** Inheritance would make a cell's colour
  `variant?.[ch] ?? palette[ch] ?? parent.palette[ch]`, and the one-line rule is
  the thing this repo is built on. The editor closes the gap instead.
- **Which frame a part shows is runtime state, not authored state.** Shown
  frames, visibility and the previewed variant are editor state and are never
  written; a door that has fallen off is the consumer not drawing that part.
- **Every frame operation remaps animations.** An animation left pointing past the end of a
  shortened strip is a file that fails validation the next time it is opened —
  the same surprise `removeColour` avoids by erasing the pixels it orphans.
- **Sprite JSON is written one frame row per line** and Prettier is kept away from
  it in every repo that holds sprites — packing those short arrays onto one line
  turns the art back into a wall of quoted strings. The writer recurses, so this
  holds at every depth; a `use` part is written on one line, because a moved wheel
  should read as one changed line.
- **A reload must be undoable.** The draft in localStorage is what makes this
  tool safe to reload mid-drawing, but undo lives in memory and a reload empties
  it — so the restored work had nothing behind it, and reloading was the one
  gesture that made a change permanent. The last state on disk is therefore
  remembered alongside the draft, and Revert goes back to it. Remembered rather
  than re-read from the file, because after a cold start the folder's permission
  is normally gone. A sprite that has never been saved has no baseline, and the
  button says so rather than disappearing.
- **The regions are the family's, not this app's.** Navigate left (what exists:
  the parts tree and the folder, as tabs), Surface centre, Subject right (the
  sprite panel, its palette and variants), the tool rail beside the Subject panel
  it feeds, the timeline across the bottom, outcomes
  in the status bar with the region toggles at its right end. A person who has
  used `../nib` should not have to find anything twice, which is worth more than
  any local argument for a different column. The Subject panel follows the
  SUBJECT, never the tool: select is the most-used tool and has no settings, so
  a "tool options" panel would read broken every time you press V.
- **An animation is a lane under the frames it names, and "animation" is what it
  is called.** The old arrangement was a row of frames with a column of clips
  beside it, each listing its frames again as chips: three reading directions for
  one subject, and the only link between "1 2 3" and the thumbnails was matching
  digits by eye. Aseprite puts the bar over the frames it covers, and position
  answers it instead. The bar is a cell per frame rather than a span, because a
  run here is an arbitrary list — a gap is a hole in the bar, a hold is a cell
  with two numbers in it, and numbers appear only when the run does not simply
  play in strip order. Click a cell to add or drop that frame, drag to sweep a
  run (one undo entry, since the sweep commits on release). The word: Godot,
  Unity and Spine all say "animation" for the thing a consumer asks for by name,
  and `../scene` already uses `Clip` for a piece of video. Files written as
  `clips` are still read — `fromJson` renames the key on the way in, at every
  depth, and the next save writes `animations`.
- **A bar says which frames; a sequence says in what order.** The lane's cells
  answer membership — click one to put a frame in or take it out, drag to sweep a
  run — and position cannot express "1 3 2" or a hold, so a run that does not
  simply play in strip order also shows its STEPS: a row of draggable chips in
  playing order, under its bar. The selected run shows them too, which is what
  clicking a lane's name is for (double-click renames, the deeper action behind
  the obvious one). A step is a position in the run, not a frame: two steps can
  name one frame, and that is what a hold is.
- **Reordering is the PLATFORM's drag and drop, as `../nib`'s layer list does
  it.** `draggable`, `dragover` reading which half of the target the pointer is
  over, `dropbefore`/`dropafter` markers, `dragend` to clear — the same names and
  the same shape as the sibling, so one app teaches the other. A pointer-driven
  version of this worked in Chrome and did nothing in Safari, which was the hint:
  Safari was already trying to start a native drag on the press, took the
  gesture, and stopped sending pointermoves. Doing it the browser's way is less
  code and brings the drag image, the cursor, Escape-to-abandon and edge
  autoscroll with it. Two deviations from nib, both because a thumbnail is not a
  text row: the marker is drawn OUTSIDE the box, since opaque art to within 3px
  of the border swallows an inset bar; and the app's own file-drop handlers guard
  on `dataTransfer.types` including `Files`, or every frame moved two places lit
  the whole window as a drop target.
- **What is carried is an index, and it lands in its own kind.** A frame drags in
  the strip, a step within one run; `dragOver` calls `preventDefault` only over
  something the lifted thing can land on, so the cursor refuses the rest without
  a word from us. `moveFrame` carries every animation's indices through the same
  permutation, so the runs follow the art. One drop is one undo entry.
- **The strip is pictures; the numbers live where a sequence needs them.** A
  thumbnail says which frame it is better than a label over the art does, so
  there is none — the play head is a dot in the corner (accent on the border
  already means selected, and the two are often different frames). Numbers stay
  on the lane cells and the step chips, because a run has to name frames to say
  "1 2 3 4 3 2"; pointing at a step lights the frame it plays, which is a better
  link than a number on every thumbnail forever.
- **The surface plays; there is no second canvas.** P (or the strip's ▶) puts the
  canvas in the play mode: the run walks, the grid, ants, part boxes and onion go
  away, the tools are inert, and what is on screen is what a consumer draws.
  Escape or P stops and puts back the frame you were drawing. A separate preview
  pane is a second renderer of the same assembly that has to be kept in step and
  is one bug away from showing a different frame from the strip — and it was
  furniture: always on screen, seldom looked at. One frame number,
  `shownFrame`, is what the canvas, the strip and the bar all read. fps lives on
  the bar over the surface, because it is the number you change while watching.
- **The loupe is a size window, not a magnifier.** The family's loupe magnifies
  pixels under a picker; dab's does the opposite, because the thing a canvas at
  ×29 cannot tell you is how the art reads at the size a consumer draws it — where
  a sign turns to mush and a one-pixel highlight vanishes. It sits in a corner of
  the surface, plays when the surface plays, and its zoom is a knob because ×1 of
  a 16×16 wheel on a 4K display is a postage stamp. It can never take more than
  two fifths of the pane: a window that covers the drawing is not a second opinion
  about it, so a zoom that would is refused, said in the accent, with Bigger
  greyed rather than doing nothing.
- **Prefs are the desk, document state is the drawing.** Tool, onion, grid, fps
  and backdrop persist globally (`sprite-editor:prefs`); the chrome — folded
  panels, hidden regions, the Navigate tab, the loupe's state — lives beside it
  under `dab.chrome`. Both survive a reload;
  selection, variant, animation and the play head are per-document
  and reset in `loadSprite` — opening sprite B must not carry sprite A's view.
  Zoom/pan deliberately persist nowhere: auto-fit is the right answer after a
  reload.
- **Files are edited in place** through the File System Access API. Chrome/Edge
  can write back to the opened folder; other browsers get a download. The folder
  handle is persisted (IndexedDB) so a dev-server reload comes back where it was —
  the permission is not, so a re-grant click is expected after a cold start.
- **Undo holds whole sprites, not inverse operations.** A sprite is a handful of
  strings, so a hundred of them costs less than the machinery for correctly
  undoing a flood fill, and nothing can drift out of sync with the document.
- **A move is a lift and a put-down.** The selection's cells are lifted out as a
  stamp, the frame is snapshotted once, and each step of the drag puts the stamp
  down on the cleared frame — so a whole drag is one undo entry.
- **A paste floats over the frame it lands on, and bakes when you do something
  else.** It uses the same machinery as a move, with the untouched frame as the
  base rather than the cleared one, so shoving a paste into place puts back what
  it was covering a step ago. Deselecting, selecting elsewhere or drawing lets go
  of it. And a stamp is matte: transparent cells are gaps, never paint, or the
  empty corners of a box selection would rub holes in whatever it was dropped on.
- **Only a paste says it is floating.** A move and a turn both carry a base the
  block was lifted out of, so there is nothing under them to lose; a paste is the
  one sitting over art that is not its own. It is said twice — accent ants where
  the block is, an accent chip in the status bar naming the state and offering
  Drop — because the ants say where and the chip says what. Accent is unclaimed
  on the canvas (blue says which node, white says what is selected), and the chip
  goes ahead of the message, away from the region toggles: it is about the
  document, they are about the furniture.
- **Turning is a mode, and it may invent colours.** Nobody knows the angle they
  want until they see it, so it previews live on the real canvas — a dialog would
  have to show its own, and a rotated door says nothing without the car under it.
  Every angle re-samples the PRISTINE source, never the last preview: turning one
  wheel five times costs 9, 4, 4, 1, 4 palette entries and climbs, where turning
  the original to five angles costs 9, 3, 2, 0, 0 and settles. Quarter turns skip
  the sampler entirely and are exact.
- **Three axes, and only one of them rotates.** `z` spins the art in the picture
  plane — a wheel — and needs corners the box did not have, so the node grows.
  `y` and `x` are HINGES: the art turns OUT of the picture and an orthographic
  view shows that as foreshortening, the same art `cos θ` as wide about the hinge
  line. So a hinge never grows the box (a door gets narrower, not bigger), the
  dial stops at 90° (past edge-on you are looking at the other face, which is the
  artist's to draw), and the sign does not matter — toward and away project the
  same. The hinge is a handle ON the art, like the rotate pivot, because the line
  a turn is about belongs on the thing being turned.
- **A turn can write a RUN of frames, and name it.** Closed to open in four is
  the whole reason a door has frames, and doing it by hand is four turns of the
  same block. The frames stepper writes one frame per step from where the art is
  to the dial, each sampled from the pristine source against the palette the step
  before it grew — so the last frame is as clean as the first and the run costs
  what one turn costs plus change. They land through `insertFrames` (one remap of
  the animations after them, not one per frame) and get an animation naming the
  run, because a run of frames nobody named is the next three clicks. A selection
  cannot: it is floating, and a float has no frames of its own.
- **A blend that is not near an existing colour becomes one.** Indexed art cannot
  interpolate, so smoothing either invents entries or does not smooth. "Near" is
  OKLab distance, not RGB — green carries most of the perceived brightness and
  blue almost none, so an RGB metric merges the wrong pairs and the palette fills
  with duplicates nobody can tell apart. There are 69 characters in total, which
  is why the bar shows the cost before it is paid, and why running out reuses the
  nearest colour rather than failing.
- **Blending is in sRGB and premultiplied.** Linear light is correct for
  photographs and wrong here: hand-placed antialiasing is chosen in sRGB, so a
  generated blend has to sit where an artist would have put one. Premultiplied
  means an edge against nothing fades to transparent instead of toward a guessed
  backdrop — that guess is what makes a rotated sprite look right in the editor
  and wrong in the game.
- **A whole node grows to hold a turn, and never shrinks.** Only the current
  frame rotates; the rest are padded to the new size, never cropped, so turning
  frame 2 cannot quietly trim frame 1. A selection stays in its frame instead —
  it is floating, and growing the document from a marquee would be a surprise.
  A part keeps its CENTRE while it grows: the placement walks back by half the
  growth, or the art orbits its own corner as the box breathes with the angle.
- **A parted node does not turn or flip whole — flatten is the door out.** Parts
  cannot rotate together: a borrowed wheel is another sprite's pixels, each part
  would invent blends in its own local palette, and per-part sampling fades every
  edge against nothing — a halo at each seam. `flattenSprite` bakes the assembly
  (same walk as the renderer, colours composited source-over in sRGB BEFORE they
  become characters, then rotation's reuse-or-allocate rule) into a flat copy
  that turns as one grid. The editor bakes the VIEW — shown frames, hidden eyes —
  because posing the parts is how you aim the bake; variants stay behind. The
  flat copy opens as a new unsaved document, so it works with no folder at all.
- **Browser tests set the viewport once, in the config.** Per-test
  `page.viewport()` calls resize the real window, and a resize while another
  file's module is still being fetched kills that fetch — it surfaces as "Failed
  to fetch dynamically imported module", an import that looks broken but passes on
  its own. Only the layout suite varies the viewport, because that is its subject.

## Working on this repo

- `just dev` — backend (bacon, headless) + frontend (vite) together, one Ctrl-C.
  `just ui` is the frontend alone, which is enough for editor work: nothing in the
  tool needs the backend.
- Ports: the backend takes `127.0.0.1:3060` (`DAB_BIND`), clear of scene's 3010 / 3020. `DAB_STATIC_DIR` points at the SPA build.
- `just check` — the whole gate (CI, when it lands, runs exactly this): format, lint,
  typecheck, test across both packages
  and the Rust workspace. Safe to run with `just dev` up: vitest keeps its
  optimized-dependency cache in `node_modules/.vitest-cache`, NOT the dev
  server's `node_modules/.vite`. Sharing it meant each side found the other's
  cache built by a different config, rewrote it, and the dev server answered
  `504 Outdated Optimize Dep` to module requests while re-optimizing — a browser
  tab that hangs or goes white while the server process looks perfectly healthy.
- `just shots [filter]` — **look at** the editor. Each scene in
  `frontend/shots/*.shot.ts` drives the app into one state and photographs it
  into `frontend/shots/out/` (gitignored). Deliberately outside `check`: the
  point is a picture someone reads, and a picture nobody reads is a slow test
  with an artefact attached. Add a scene when working on UI — every design bug
  this repo has had was found by looking (a control collapsed to a 2px line, a
  row overflowing, a marquee whose colour said the wrong thing), and none of them
  by an assertion. The rig (`shots/rig.ts`) has the mount, a drag/menu/click
  driver in CELL coordinates, and stock sprites, so a scene is about the editor
  rather than about inventing art. A scene still asserts the minimum that makes
  its picture mean something: a screenshot of a component that failed to mount is
  a blank rectangle, and a blank rectangle reads as a design decision.
- The backend needs no config to serve the SPA; `backend/.env` is read if present.
- core is private. `yarn workspace dab-core build` exists so a type
  error in it fails a build, not to publish anything.

## Out of scope

- Layers. The format is one grid per frame, and the tools are built on that.
  Parts are not layers: nothing composites into the grid being edited.
- Free scale, sub-pixel offsets, tweening, bones. Turning came in because it is a
  different kind of thing from the rest of that list: it is an operation on
  pixels and leaves no trace in the file, where `flip` is a part PROPERTY and
  drags coordinate arithmetic behind it. Rotation as a part property would too,
  and stays out. A hinge turn scales one axis, which is the one place this line
  bends — it is a turn expressed as a scale, not a scale tool, which is why it
  has an angle and a hinge rather than a width.
- RotSprite. It exists to keep pixel art crisp when you cannot add colours; here
  you can, so supersampling covers the same ground for a few hundred lines less.
  If it ever lands it is also the point at which wasm would earn its keep — an
  8× upscale is 64× the pixels, where the present sampler is ~3ms on a node this
  format can hold and does not justify putting one operation outside core.
- Per-frame durations. A consumer's clock is its own. If they ever land, they
  land as Aseprite does it — a per-frame array, orthogonal to animations.
- Chained `use` references (a borrowed part is a leaf) and `flip` on a subtree.
  Both are additive later; neither is worth the coordinate arithmetic now.
- Resampling as a RESIZE. Resize crops or pads: "make it bigger" means a bigger
  canvas, not a blurrier drawing. Turning resamples — it has to, at any angle
  that is not a quarter — and a hinge turn resamples one axis. The difference is
  that a turn is a drawing operation with an artist behind it, crisp by default
  so it drops pixels rather than inventing colours, and the result is a starting
  point to draw over.
- A server-side file store. The editor reaches the disk through the browser; the
  backend exists to serve the SPA, not to hold sprites.
