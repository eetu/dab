import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { local } from "./api";
import { mcpHttp } from "./mcphttp";
import type { Store } from "./store";

// MCP on a port of its own, the same in every project: registered with an MCP
// client ONCE, and served by whichever project's dev server is running. One
// project is drawn in at a time; a second dev server leaves the port to the
// first and says which project has it, instead of each project needing an
// entry of its own under a port of its own.

export const MCP_PORT = 3061;

export type McpListening =
  | { server: Server; url: string }
  /** Another project's dev server has the port: its folder, if it said. */
  | { server: null; holder: string | null };

/** Answer MCP at /mcp, and /status with the folder being served. */
function handler(store: Store) {
  const mcp = mcpHttp(store);
  return (req: IncomingMessage, res: ServerResponse) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path === "/mcp") return mcp(req, res);
    if (path === "/status" && local(req)) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ dab: true, root: store.root }));
      return;
    }
    res.writeHead(404).end();
  };
}

/** Who has the port, if it is a dab: the folder it serves. */
async function holderOf(port: number): Promise<string | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`, {
      signal: AbortSignal.timeout(500),
    });
    const body = (await res.json()) as { dab?: boolean; root?: string };
    return body.dab && body.root ? body.root : null;
  } catch {
    return null;
  }
}

const listen = (server: Server, port: number) =>
  new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", fail);
      done();
    });
  });

/**
 * Serve MCP for `store` on `port`. The port held by this same folder is a dev
 * server restarting — its old self lets go in a moment — so that is waited
 * out; held by another, it is theirs.
 */
export async function listenMcp(store: Store, port = MCP_PORT): Promise<McpListening> {
  for (let attempt = 0; ; attempt++) {
    const server = createServer(handler(store));
    try {
      await listen(server, port);
      const at = server.address();
      const bound = typeof at === "object" && at ? at.port : port;
      return { server, url: `http://localhost:${bound}/mcp` };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE") throw e;
      const holder = await holderOf(port);
      if (holder !== store.root || attempt >= 10) return { server: null, holder };
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

/** Let go of the port now, open connections and all. */
export function closeMcp(server: Server): void {
  server.closeAllConnections();
  server.close();
}
