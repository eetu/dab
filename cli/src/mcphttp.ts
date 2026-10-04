import type { IncomingMessage, ServerResponse } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { local } from "./api";
import { createServer } from "./server";
import type { Store } from "./store";

// The MCP tools over HTTP, beside the editor in the same dev server. Stateless:
// a server and a transport per request, over the ONE store the editor's API
// uses — so a model's write and a person's save are checked against the same
// versions, and the editor's change feed sees every write the model makes.

export function mcpHttp(store: Store) {
  return (req: IncomingMessage, res: ServerResponse) => {
    if (!local(req)) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "dab's MCP answers only on this machine" }));
      return;
    }
    void (async () => {
      const server = createServer(store);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    })().catch((e: unknown) => {
      if (res.headersSent) return res.end();
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    });
  };
}
