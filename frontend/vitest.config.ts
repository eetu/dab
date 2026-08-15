import { svelte } from "@sveltejs/vite-plugin-svelte";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

import { CORE_ALIAS } from "./vite.config.ts";

// One project: this tool is UI, so what is worth testing is that it mounts,
// paints and saves in a real browser. The format and the operations on it are
// tested in the `core` package, where they live.
export default defineConfig({
  plugins: [svelte()],
  // A separate config file means vite.config.ts is NOT read, so the alias has to
  // be brought in by hand — without it the tests resolve core through its
  // `exports` and need it built first.
  resolve: { alias: CORE_ALIAS },
  // A cache of its own, NOT the dev server's `node_modules/.vite`.
  //
  // Vite keys its optimized-dependency cache on a hash of the config that built
  // it, and this config is not the dev server's — different plugins, no fs.allow,
  // no discovery. Sharing the directory meant each side kept finding the other's
  // cache "changed" and rewriting it: run the tests with `just dev` up and the
  // dev server logs "optimized dependencies changed. reloading", forces a full
  // page reload, and serves 504 Outdated Optimize Dep to any module request in
  // flight — a browser tab that hangs or goes white while the server itself
  // looks perfectly healthy. Which is what "the dev server got stuck, restart
  // it" was.
  cacheDir: "node_modules/.vitest-cache",
  // No dependency pre-bundling, and no discovery.
  //
  // On a cold cache — which is every CI run — vite finds a dependency it has not
  // bundled, re-bundles, and reloads the page. Any module import in flight at that
  // moment dies, and it surfaces as "Failed to fetch dynamically imported module"
  // against whichever suite happened to be loading: a different file each time,
  // passing on its own and on the second run, which is the signature of a race
  // rather than a broken import. The suite is small enough that pre-bundling buys
  // nothing worth that.
  optimizeDeps: { noDiscovery: true, include: [] },
  test: {
    include: ["src/__tests__/*.svelte.test.ts"],
    // One file at a time. Every suite here mounts the whole app in a real
    // browser, and several of those at once is more than a two-core CI runner
    // has to give.
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      // The window size, set ONCE for the whole run. Every suite wants the same
      // one, and each used to ask for it with `page.viewport(1200, 800)` at the
      // top of every test — resizing the real browser window over and over. A
      // resize while another file's module is still being fetched kills that
      // fetch, and it surfaces as "Failed to fetch dynamically imported module":
      // a broken-looking import that runs perfectly on its own. Only the layout
      // suite varies the viewport now, because varying it is what it tests.
      viewport: { width: 1200, height: 800 },
      instances: [{ browser: "chromium" as const }],
    },
  },
});
