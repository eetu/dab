# @anarkisti/dab

[dab](https://github.com/eetu/dab) on a folder of character-grid sprites — rows
of characters plus the palette they mean ([the format](https://github.com/eetu/dab/blob/main/FORMAT.md)).
Three ways in:

- **A Vite plugin**: the pixel editor in your project's dev server, editing your
  sprite folder in place — any browser, no folder picker. A sprite written by
  anything else shows up in the open editor.
- **An MCP server**: a model reads frames as ruled rows, looks at renders, and
  draws through the same operations the editor uses. Every read returns a
  version and every write must quote it, so a save in the editor is never
  overwritten.
- **`@anarkisti/dab/core`**: the format itself, for a game to draw its sprites
  with — the walk the editor draws an assembly in (`layers`), a grid's frame as
  packed pixels (`pixels`), a whole subject in one (`assembly`), animations
  (`frameAt`), the validator. Pure, no DOM; a bundler takes only what is used.

The package installs no dependencies of its own: what the MCP server and the
plugin run is bundled in (licences in `dist/THIRD-PARTY-LICENSES.txt`).

0.x: the interface may change between minor versions.

## In a Vite project

```sh
npm install -D @anarkisti/dab
```

```ts
// vite.config.ts
import dab from "@anarkisti/dab/vite";

export default defineConfig({
  plugins: [dab({ sprites: "src/lib/sprites" })],
});
```

`vite dev` then serves the editor at `/__dab/`, and MCP on port 3061. That port
is the same in every project, so the MCP server is registered once:

```sh
claude mcp add --transport http dab http://localhost:3061/mcp
```

It serves whichever project's dev server is running, one at a time. Pass
`mcp: <port>` for another port, or `mcp: false` for none.

## Without a dev server

```sh
claude mcp add dab -- npx @anarkisti/dab mcp --root src/lib/sprites
```

`dab mcp` serves one folder over stdio.

## In a game

```ts
import { assembly, frameAt } from "@anarkisti/dab/core";
import deer from "./sprites/deer.json";

// The deer at its walk's step, parts and all, facing left, as an ImageData.
const { w, h, x, y, px } = assembly(deer, frameAt(deer, "walk", step), { flip: "h" });
ctx.putImageData(new ImageData(new Uint8ClampedArray(px.buffer), w, h), left - x, top - y);
```

`layers` gives the same subject grid by grid, for a game that holds a part's own
frame or caches each grid; `pixels` draws one. Cache what you draw: these
compute a fresh grid every call.

## License

MIT
