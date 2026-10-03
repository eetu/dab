import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import pkg from "../package.json" with { type: "json" };
import type { Store } from "./store";
import { registerDraw } from "./tools/draw";
import { registerEdit } from "./tools/edit";
import { registerLook } from "./tools/look";
import { registerRead } from "./tools/read";

const INSTRUCTIONS = `dab sprites: JSON files of rows of characters plus the palette they mean.
- Coordinates are zero-based, x right and y down, in the pixels of the node named.
- A node is the sprite (omit \`node\`), a part by path ("doorL/handle"), or a level ("@far").
- Every read returns a version; every write must quote the one it was based on. A refused
  write means the file changed (often the person saved it in the editor) — read it again.
- Rows are the working representation: read_frame to see coordinates, put_rows / set_pixels /
  draw to write. render is for looking — at a frame, a strip, or a lineup of sprites at one scale.
- One write is one change in the file, and one undo step in the editor.`;

export function createServer(store: Store): McpServer {
  const server = new McpServer(
    { name: "dab", version: pkg.version },
    { instructions: INSTRUCTIONS },
  );
  registerRead(server, store);
  registerLook(server, store);
  registerDraw(server, store);
  registerEdit(server, store);
  return server;
}
