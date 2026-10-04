# cli — working here

`dab` on one folder of sprites: `dab mcp` is an MCP server over stdio, and
`dab/vite` a Vite plugin serving the folder to the editor. The root
`CLAUDE.md` has why it is a local process and not a service on the Pi.

## Layout

```text
src/dab.ts      the command: `dab mcp [--root DIR]` (else $DAB_ROOT, else cwd)
src/vite.ts     the plugin, dev server only: the built editor at /__dab/ (from
                dist/editor, beside it), the files API at /__dab/api, and MCP
                on its own port
src/mcpport.ts  MCP on port 3061 for whichever project is running — registered
                once, one project at a time; a second dev server leaves the
                port to the first and names it (from /status)
src/editor.ts   serves a built SPA from a folder, index.html for any route
src/api.ts      the files API — list, read, versioned write and delete, and
                /events, the folder's changes as server-sent events (one
                watcher, alive while anyone listens). It answers loopback
                requests addressed to localhost only, so `vite --host` does
                not put a write API on the LAN
src/server.ts   the MCP server, its instructions to the model, the tool modules
src/mcphttp.ts  the same server over Streamable HTTP, stateless: one per
                request, over the store the editor's API shares
src/store.ts    the folder: root confinement, versions, validated atomic writes,
                and what a sprite's `use` parts resolve to. A refusal carries
                its kind (stale, invalid, outside, missing) for HTTP's status
src/text.ts     node paths, located refusals, the ruled grid
src/render.ts   flatten → composite → PNG, scaled to about 512 px
src/tools/      read (outline, rows), look (render, lineup), draw (cells,
                shapes, rows), edit (frames, palette, animations, levels,
                transforms, parts), history (diff, carry — measured from a
                version the store has seen), batch; common.ts has the plans
```

## Adding a tool

- **Over core, never beside it.** If a tool needs logic core lacks, it goes
  into core first, with its test there, and the tool wraps it. Setting a key
  (a variant's colour, an animation's run) is data rather than logic, and may
  be done here.
- **A write tool is a plan, registered with `registerWrite`**: the node, a
  pure function on it, how to report it. `editNode` runs one — load, check the
  quoted version, apply through `withNode`, save through `validateSprite` and
  `toJson` — and `batch` runs many against one load and one save, so a tool is
  batchable the moment it exists. One write is one undo entry in the editor.
  What a level follows rather than owns (frames, animations) passes `shared`.
- **"Since" is a version the store has seen.** It keeps every version it reads
  or writes, the last 64 per file; `diff` and `carry` measure from one, and
  say so when asked about one they never saw.
- **A refusal is `fail`, and says where and what to do**: the node, the
  range, the keys there are. A model acts on the sentence it is given, so
  "frame 7 is out of range" without the range just gets a second guess.
- Coordinates are zero-based in the named node's own pixels. Rows are the
  working representation; a render is for looking.

## Build and test

- `build` bundles `src/dab.ts` and `src/vite.ts` with core's source inlined,
  because core's own build keeps extensionless imports that node's ESM loader
  rejects; the SDK, zod and vite stay external. Then it builds the editor
  into `dist/editor` with `/__dab/` as its base — after, since the first step
  empties `dist/`.
- Tests drive a real `Client` over `InMemoryTransport` against a temp folder.
  Before calling a tool done, use it on real sprites (copy them out first):
  nib's MCP found every one of its real bugs by drawing through it, and none
  by compiling or unit tests.
