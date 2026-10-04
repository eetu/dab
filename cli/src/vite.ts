import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

import { filesApi } from "./api";
import { serveEditor } from "./editor";
import { Store } from "./store";

// dab in a Vite project's dev server: the editor at /__dab/ and the sprite
// folder it edits at /__dab/api — any browser, no folder picker, and a change
// written by anything else shows up in the open editor. Dev only: a build
// never sees it.

export const BASE = "/__dab";
export const API = `${BASE}/api`;

/** The built editor, shipped beside this file. */
const EDITOR = fileURLToPath(new URL("./editor/", import.meta.url));

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
      const log = server.config.logger;
      server.middlewares.use(API, filesApi(store));
      const hasEditor = existsSync(path.join(EDITOR, "index.html"));
      if (hasEditor) {
        const editor = serveEditor(EDITOR);
        server.middlewares.use(BASE, (req, res, next) => {
          // The editor's assets are addressed under /__dab/, so its page must be
          // too: /__dab alone would resolve them against the wrong folder.
          if (req.url === "" || req.url === "/" || !req.url) {
            if ((req.originalUrl ?? "").replace(/\?.*$/, "") === BASE) {
              res.writeHead(302, { location: `${BASE}/` }).end();
              return;
            }
          }
          editor(req, res, next);
        });
      }
      server.httpServer?.once("listening", () => {
        // After Vite's own banner, which is printed once it is listening.
        setTimeout(() => {
          const at = server.resolvedUrls?.local[0];
          const where = at ? new URL(`${BASE.slice(1)}/`, at).href : `${BASE}/`;
          log.info(
            hasEditor
              ? `  ➜  dab:     ${where}  (${store.root})`
              : `  ➜  dab:     ${API} serves ${store.root}; the editor is not built`,
          );
        }, 0);
      });
    },
  };
}
