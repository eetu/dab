import { fileURLToPath } from "node:url";

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";

// The workspace root, so the dev server may serve files from outside this app —
// specifically `core/src`, which the alias below points at.
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * The core package, resolved to its SOURCE rather than to its build.
 *
 * Its `exports` point at `dist/` because that is what an npm consumer gets, but
 * inside this repo that would mean a clean clone cannot start the editor until
 * someone has built core, and an edit to the format would not reach the editor
 * until they built it again. Vite transpiles the TypeScript either way, so
 * pointing at the source costs nothing and keeps the two packages one live tree.
 */
export const CORE_ALIAS = {
  "dab-core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
};

/**
 * `just ui-on <folder>`: that folder served through dab's Vite plugin — the
 * BUILT plugin, which is what a consumer's dev server runs, so the editor is
 * tried against the real thing. Built by `just cli`.
 */
async function served(): Promise<Plugin[]> {
  const root = process.env.DAB_ROOT;
  if (!root) return [];
  const built = new URL("../cli/dist/vite.js", import.meta.url).href;
  const plugin = (await import(/* @vite-ignore */ built).catch(() => {
    throw new Error("DAB_ROOT is set but cli/dist/vite.js is not built — run `just cli`");
  })) as { default: (o: { sprites: string }) => Plugin };
  return [plugin.default({ sprites: root })];
}

export default defineConfig({
  // "/" everywhere except the GitHub Pages build, which serves from /dab/.
  // An env rather than a config fork: the Pages workflow is the only caller.
  base: process.env.DAB_BASE ?? "/",
  plugins: [svelte(), ...(await served())],
  resolve: { alias: CORE_ALIAS },
  server: { port: 5180, fs: { allow: [REPO_ROOT] } },
});
