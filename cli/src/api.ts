import { type FSWatcher, watch } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import { fromJson } from "dab-core";

import { type Refusal, type Store, ToolError } from "./store";

// The folder over HTTP, for the editor: the same store, versions and
// validation the MCP tools write through, so a save from either side is
// refused rather than lost when the other got there first.
//
//   GET    /files          the root's path and sprites, each with its version
//   GET    /files/<file>   one file's text; its version in ETag
//   PUT    /files/<file>   a sprite's JSON, If-Match its version, or
//                          If-None-Match: * for a new file
//   DELETE /files/<file>   If-Match its version
//   GET    /events         server-sent events: { file, version } each time a
//                          sprite in the root is written or removed (null)
//
// A stale write is 412 with the version on disk now.

const STATUS: Record<Refusal, number> = {
  refused: 400,
  stale: 412,
  invalid: 422,
  outside: 403,
  missing: 404,
};

/** Bodies above this are not sprites. */
const LIMIT = 4 << 20;

type Next = (err?: unknown) => void;

export function filesApi(store: Store) {
  const changes = feed(store);
  return (req: IncomingMessage, res: ServerResponse, next?: Next) => {
    handle(store, changes, req, res, next).catch((e: unknown) => {
      if (e instanceof ToolError) {
        send(res, STATUS[e.kind], { error: e.message, version: e.current });
      } else send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    });
  };
}

async function handle(
  store: Store,
  changes: Feed,
  req: IncomingMessage,
  res: ServerResponse,
  next?: Next,
) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const [head, ...rest] = url.pathname.split("/").filter(Boolean);
  if (head !== "files" && head !== "events") {
    return next ? next() : send(res, 404, { error: "not found" });
  }
  // The API writes files: it answers this machine, and only under a name for
  // it, so neither the LAN (`vite --host`) nor a rebinding page can reach it.
  if (!local(req)) return send(res, 403, { error: "dab's files answer only on this machine" });
  if (head === "events") return changes.subscribe(res);
  const file = rest.map(decodeURIComponent).join("/");

  if (!file) {
    if (req.method !== "GET") return send(res, 405, { error: "GET only" });
    const files = await store.list({ deep: false });
    const entries = [];
    const problems = [];
    for (const f of files) {
      try {
        const got = await store.load(f);
        entries.push({ file: got.file, version: got.version, sprite: got.sprite });
      } catch (e) {
        if (!(e instanceof ToolError)) throw e;
        const [first, ...listed] = e.message.split("\n- ");
        problems.push({ file: f, errors: listed.length ? listed : [first] });
      }
    }
    // `root` is the folder's identity: two projects can both call theirs `sprites`.
    return send(res, 200, { name: path.basename(store.root), root: store.root, entries, problems });
  }

  if (req.method === "GET") {
    const got = await store.read(file);
    res.writeHead(200, { "content-type": "application/json", etag: `"${got.version}"` });
    return res.end(got.text);
  }
  if (req.method === "PUT") {
    const base = precondition(req);
    const parsed = fromJson(await body(req));
    if ("errors" in parsed) return send(res, 422, { error: parsed.errors.join("; ") });
    const saved = await store.save(file, base, parsed.sprite);
    return send(res, 200, saved);
  }
  if (req.method === "DELETE") {
    const base = precondition(req);
    if (base === null) return send(res, 428, { error: "a delete needs If-Match: the version" });
    await store.remove(file, base);
    res.writeHead(204).end();
    return;
  }
  send(res, 405, { error: "GET, PUT or DELETE" });
}

type Feed = ReturnType<typeof feed>;

/**
 * The root's changes, to whoever is listening: one watcher, started for the
 * first listener and stopped with the last. A burst of events for one file —
 * a rename into place is two — becomes one announcement of the version it
 * settled on, and a touch that left the bytes alone is not news.
 */
function feed(store: Store) {
  const clients = new Set<ServerResponse>();
  const last = new Map<string, string | null>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let watcher: FSWatcher | null = null;

  const announce = async (file: string) => {
    const version = (await store.read(file).catch(() => null))?.version ?? null;
    if (last.get(file) === version) return;
    last.set(file, version);
    const line = `data: ${JSON.stringify({ file, version })}\n\n`;
    for (const c of clients) c.write(line);
  };

  const start = () => {
    watcher = watch(store.root, (_, name) => {
      // The store writes beside the file and renames into place; the hidden
      // temporary is not a sprite.
      if (!name || name.startsWith(".") || !name.endsWith(".json")) return;
      clearTimeout(timers.get(name));
      timers.set(
        name,
        setTimeout(() => {
          timers.delete(name);
          void announce(name);
        }, 40),
      );
    });
  };

  return {
    subscribe(res: ServerResponse) {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write(": dab\n\n");
      clients.add(res);
      if (!watcher) start();
      // A comment now and then, so nothing between here and the tab decides
      // the connection is idle.
      const beat = setInterval(() => res.write(": \n\n"), 25_000);
      res.on("close", () => {
        clearInterval(beat);
        clients.delete(res);
        if (!clients.size) {
          watcher?.close();
          watcher = null;
        }
      });
    },
  };
}

/** The version a write replaces: If-Match, or null for a new file. */
function precondition(req: IncomingMessage): string | null {
  const match = req.headers["if-match"];
  if (match) return match.replace(/^W\//, "").replace(/"/g, "");
  if (req.headers["if-none-match"] === "*") return null;
  throw new ToolError(
    "say which version this replaces (If-Match) or that the file is new (If-None-Match: *)",
    "refused",
  );
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function local(req: IncomingMessage): boolean {
  if (!LOOPBACK.has(req.socket.remoteAddress ?? "")) return false;
  const host = (req.headers.host ?? "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") || LOOPBACK.has(host);
}

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > LIMIT) throw new ToolError("that is too large to be a sprite", "refused");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}
