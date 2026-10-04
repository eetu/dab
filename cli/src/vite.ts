import path from "node:path";

import type { Plugin } from "vite";

import { filesApi } from "./api";
import { Store } from "./store";

// dab in a Vite project's dev server: the sprite folder over HTTP at
// /__dab/api, so the editor reaches it from any browser with no folder picker.
// Dev only — a build never sees it.

export const API = "/__dab/api";

export type Options = {
  /** The sprite folder, relative to the Vite root. */
  sprites: string;
};

export default function dab(options: Options): Plugin {
  return {
    name: "dab",
    apply: "serve",
    async configureServer(server) {
      const store = await Store.open(path.resolve(server.config.root, options.sprites));
      server.middlewares.use(API, filesApi(store));
      server.config.logger.info(`  dab: ${store.root} at ${API}`);
    },
  };
}
