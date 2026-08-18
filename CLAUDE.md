# dab — repo overview

A pixel editor for character-grid sprites (rows of characters + a palette). Its
first customer is `../scene`'s neon-drive visualiser, but the format and the tool
are general. Sibling apps: `../scene` (consumer), `../nib` (whose canvas gesture
vocabulary this follows), `../raspi` (deploy).

## Layout

```text
core/        the format, its validator, and every pure operation on a sprite
             (pixels, shapes, flood, blocks, frames, palette, variants, parts,
             clips, JSON). Private to this repo; node-only tests.
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
- **Every frame operation remaps clips.** A clip left pointing past the end of a
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
- **Prefs are the desk, document state is the drawing.** Tool, onion, grid, fps,
  backdrop and the preview zoom persist globally (`sprite-editor:prefs`) and
  survive a reload; selection, variant, clip and the play head are per-document
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
- **Rotation is a mode, and it may invent colours.** Nobody knows the angle they
  want until they see it, so it previews live on the real canvas — a dialog would
  have to show its own, and a rotated door says nothing without the car under it.
  Every angle re-samples the PRISTINE source, never the last preview: turning one
  wheel five times costs 9, 4, 4, 1, 4 palette entries and climbs, where turning
  the original to five angles costs 9, 3, 2, 0, 0 and settles. Quarter turns skip
  the sampler entirely and are exact.
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
- Scale, sub-pixel offsets, tweening, bones. Rotation came in because it is a
  different kind of thing from the rest of that list: it is an operation on
  pixels and leaves no trace in the file, where `flip` is a part PROPERTY and
  drags coordinate arithmetic behind it. Rotation as a part property would too,
  and stays out.
- RotSprite. It exists to keep pixel art crisp when you cannot add colours; here
  you can, so supersampling covers the same ground for a few hundred lines less.
  If it ever lands it is also the point at which wasm would earn its keep — an
  8× upscale is 64× the pixels, where the present sampler is ~3ms on a node this
  format can hold and does not justify putting one operation outside core.
- Per-frame durations. A consumer's clock is its own. If they ever land, they
  land as Aseprite does it — a per-frame array, orthogonal to clips.
- Chained `use` references (a borrowed part is a leaf) and `flip` on a subtree.
  Both are additive later; neither is worth the coordinate arithmetic now.
- Resampling. Resize crops or pads — there is no meaningful resample for pixel
  art, and "make it bigger" means a bigger canvas, not a blurrier drawing.
- A server-side file store. The editor reaches the disk through the browser; the
  backend exists to serve the SPA, not to hold sprites.
