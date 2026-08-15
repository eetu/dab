import { fileURLToPath } from "node:url";

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

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

export default defineConfig({
  // "/" everywhere except the GitHub Pages build, which serves from /dab/.
  // An env rather than a config fork: the Pages workflow is the only caller.
  base: process.env.DAB_BASE ?? "/",
  plugins: [svelte()],
  resolve: { alias: CORE_ALIAS },
  server: { port: 5180, fs: { allow: [REPO_ROOT] } },
});
