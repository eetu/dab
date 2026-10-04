// Publish-integrity smoke test. Packs @anarkisti/dab exactly as npm consumers
// receive it (prepack runs the real build, editor included), installs the
// tarball into a throwaway consumer, and uses what shipped: the Vite plugin,
// the built editor beside it, and the `dab` command serving MCP over stdio —
// the only coverage of the package rather than of the source.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });
const yarn = (...args) => run("node", [".yarn/releases/yarn-4.16.0.cjs", ...args]);

const tgz = join(tmpdir(), "dab-smoke.tgz");
const consumer = mkdtempSync(join(tmpdir(), "dab-consumer-"));

try {
  yarn("workspace", "@anarkisti/dab", "pack", "--out", tgz);

  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "dab-smoke-consumer", private: true, type: "module" }),
  );
  run("npm", ["install", "--no-save", "--no-package-lock", tgz], { cwd: consumer });

  // A sprite folder with one sprite, for the command to serve.
  const sprites = join(consumer, "sprites");
  mkdirSync(sprites);
  writeFileSync(
    join(sprites, "dot.json"),
    JSON.stringify({ name: "dot", w: 1, h: 1, palette: { A: "#ff0000" }, frames: [["A"]] }),
  );

  const probe = join(consumer, "probe.mjs");
  writeFileSync(
    probe,
    `
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import dab from "@anarkisti/dab/vite";

const fail = (why) => { console.error("publish-smoke:", why); process.exit(1); };

const plugin = dab({ sprites: "sprites" });
if (plugin.name !== "dab" || typeof plugin.configureServer !== "function") fail("the plugin is not a plugin");

const root = dirname(createRequire(import.meta.url).resolve("@anarkisti/dab/package.json"));
if (!existsSync(join(root, "dist/editor/index.html"))) fail("the editor is not in the package");
if (!existsSync(join(root, "types/vite.d.ts"))) fail("the plugin's types are not in the package");
if (!existsSync(join(root, "LICENSE"))) fail("the license is not in the package");

const client = new Client({ name: "smoke", version: "0" });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [join(root, "dist/dab.js"), "mcp", "--root", ${JSON.stringify(sprites)}],
  stderr: "ignore",
}));
const listed = await client.callTool({ name: "list_sprites", arguments: {} });
if (!JSON.stringify(listed.content).includes("dot.json")) fail("dab mcp did not list the folder");
await client.close();
console.log("OK — plugin, editor, types, license and dab mcp all shipped");
`,
  );
  run("node", [probe], { cwd: consumer });

  if (!existsSync(join(consumer, "node_modules/.bin/dab"))) throw new Error("no dab command");
  console.log("publish-smoke: PASS");
} finally {
  rmSync(consumer, { recursive: true, force: true });
  rmSync(tgz, { force: true });
}
