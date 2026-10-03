import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer } from "./server";
import { Store } from "./store";

// `dab <command>` on a sprite folder: --root, or $DAB_ROOT, or where it is run.

const USAGE = `usage: dab mcp [--root DIR]

  mcp   an MCP server on stdio over the sprites in DIR (default: $DAB_ROOT, or here)`;

async function main(argv: string[]) {
  const [command, ...rest] = argv;
  const at = rest.indexOf("--root");
  const root = (at >= 0 ? rest[at + 1] : undefined) ?? process.env.DAB_ROOT ?? process.cwd();
  if (command !== "mcp") {
    console.error(USAGE);
    process.exit(command ? 2 : 0);
  }
  const store = await Store.open(root);
  await createServer(store).connect(new StdioServerTransport());
  // stdout is the protocol; anything for a person goes to stderr.
  console.error(`dab: serving MCP over ${store.root}`);
}

main(process.argv.slice(2)).catch((e: unknown) => {
  console.error(`dab: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
