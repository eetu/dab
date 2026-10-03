# cli — working here

`dab` on one folder of sprites: `dab mcp` is an MCP server over stdio. The root
`CLAUDE.md` has why it is a local process and not a service on the Pi.

## Layout

```text
src/dab.ts      the command: `dab mcp [--root DIR]` (else $DAB_ROOT, else cwd)
src/server.ts   the MCP server, its instructions to the model, the tool modules
src/store.ts    the folder: root confinement, versions, validated atomic writes,
                and what a sprite's `use` parts resolve to
src/text.ts     node paths, located refusals, the ruled grid
src/render.ts   flatten → composite → PNG, scaled to about 512 px
src/tools/      read (outline, rows), look (render, lineup), draw (cells,
                shapes, rows), edit (frames, palette, animations, levels,
                transforms, parts); common.ts has `editNode`
```

## Adding a tool

- **Over core, never beside it.** If a tool needs logic core lacks, it goes
  into core first, with its test there, and the tool wraps it. Setting a key
  (a variant's colour, an animation's run) is data rather than logic, and may
  be done here.
- **A write is `editNode`**: load, check the quoted version, edit ONE node
  through `withNode`, then save through `validateSprite` and `toJson`. One call
  is one write, which is one undo entry in the editor. What a level follows
  rather than owns (frames, animations) passes `shared`.
- **A refusal is `fail`, and says where and what to do**: the node, the
  range, the keys there are. A model acts on the sentence it is given, so
  "frame 7 is out of range" without the range just gets a second guess.
- Coordinates are zero-based in the named node's own pixels. Rows are the
  working representation; a render is for looking.

## Build and test

- `vite build` bundles `src/dab.ts` with core's source inlined, because core's
  own build keeps extensionless imports that node's ESM loader rejects. The
  SDK and zod stay external.
- Tests drive a real `Client` over `InMemoryTransport` against a temp folder.
  Before calling a tool done, use it on real sprites (copy them out first):
  nib's MCP found every one of its real bugs by drawing through it, and none
  by compiling or unit tests.
