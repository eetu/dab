# frontend — working here

The root `CLAUDE.md` has the editor's conventions and why. This is the
working detail it leaves out.

## The store

`src/lib/editor/` is one module per concern, importing only downward (state →
tree → selection → history → verbs → document); `editor.svelte.ts` is the list
of what components may call. A new verb goes in the lowest layer that has what
it needs, and is added to that list explicitly.

- Commit through `commit` (whole document), `commitNode` (the active node) or
  `commitShared` (frames and animations — to the sprite when a level is being
  drawn). Writing `editor.sprite` directly is only for the rest of a gesture
  whose first step committed (`fresh = false`).
- Editor state that must not be written to the file lives on `editor` and
  resets in `loadSprite`; desk prefs are listed in `persist.ts` `Prefs` and
  loaded and saved in `App.svelte`.
- A mode (turn, perspective) gates the others in the UI, not by importing them:
  the modules would cycle.

## Traps

- A module and a component must not differ only by case — macOS resolves
  `./leveldialog.svelte` to `LevelDialog.svelte`. Name openers by verb
  (`newlevel.svelte.ts`).
- A bar over the canvas centred with `left: 50%` lays out in what is left of
  the pane — half of it — and wraps. Give it `width: max-content`, and stop
  `pointerdown` on it, or the pane's capture eats its clicks.
- An `$effect` that resets fields on open must run untracked, or the fields'
  own writes re-run it (`LevelDialog.svelte`).
- Sticky gutters need an opaque ground under every row; a tinted or missing
  cell lets scrolled content through (`Frames.svelte`, `.ground`).

## Checking

`yarn validate` is typecheck, lint and format; `just check` adds the tests.
Browser tests (`*.svelte.test.ts`) share one origin's storage — `setup.ts`
clears the document keys before each, or a draft from one file is restored
over the next. Look at UI changes with `just shots <name>`.
