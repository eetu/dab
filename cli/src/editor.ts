import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

// The editor, built, served from a folder — the copy that ships beside the
// plugin, mounted at /__dab/ in someone's dev server. A path that is not a
// file is the app's to route, so it gets index.html, as any SPA host does.

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

export function serveEditor(dir: string) {
  const root = path.resolve(dir);
  return (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const wanted = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (wanted !== root && !wanted.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const isFile = await stat(wanted).then(
        (s) => s.isFile(),
        () => false,
      );
      const file = isFile ? wanted : path.join(root, "index.html");
      if (!(await stat(file).catch(() => null))) {
        if (next) return next();
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
        // Hashed assets could be cached forever, but this is a dev server and
        // the editor is rebuilt under it: always ask.
        "cache-control": "no-cache",
      });
      createReadStream(file).pipe(res);
    })().catch((e: unknown) => next?.(e));
  };
}
