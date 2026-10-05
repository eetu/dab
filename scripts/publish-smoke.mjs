// Publish-integrity smoke test. Packs @anarkisti/dab exactly as npm consumers
// receive it (prepack runs the real build, editor included), installs the
// tarball into a throwaway consumer, and uses what shipped: the Vite plugin,
// the built editor beside it, the `dab` command serving MCP over stdio, and
// `/core` in bare node and to tsc as node resolves it — the only coverage of
// the package rather than of the source.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });
const yarn = (...args) => run("node", [".yarn/releases/yarn-4.16.0.cjs", ...args]);

const tgz = join(tmpdir(), "dab-smoke.tgz");
const consumer = mkdtempSync(join(tmpdir(), "dab-consumer-"));
const cli = JSON.parse(readFileSync("cli/package.json", "utf8"));
const tsc = resolve("node_modules/.bin/tsc");

try {
  yarn("workspace", "@anarkisti/dab", "pack", "--out", tgz);

  // Everything dab runs is bundled into it: a consumer installs one package.
  if (Object.keys(cli.dependencies ?? {}).length) {
    throw new Error(`dab declares dependencies: ${Object.keys(cli.dependencies).join(", ")}`);
  }
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "dab-smoke-consumer", private: true, type: "module" }),
  );
  // The SDK is the probe's, for its MCP client; dab carries its own.
  const sdk = `@modelcontextprotocol/sdk@${cli.devDependencies["@modelcontextprotocol/sdk"]}`;
  run("npm", ["install", "--no-save", "--no-package-lock", tgz, sdk], { cwd: consumer });

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
if (!existsSync(join(root, "dist/THIRD-PARTY-LICENSES.txt"))) fail("the bundled licences are not in the package");

const core = await import("@anarkisti/dab/core");
const drawn = core.pixels({ w: 2, h: 1, palette: { A: "#ff0000" }, frames: [["A."]] });
if (drawn.px[0] !== 0xff0000ff || drawn.px[1] !== 0) fail("/core does not draw a sprite");

const client = new Client({ name: "smoke", version: "0" });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [join(root, "dist/dab.js"), "mcp", "--root", ${JSON.stringify(sprites)}],
  stderr: "ignore",
}));
const listed = await client.callTool({ name: "list_sprites", arguments: {} });
if (!JSON.stringify(listed.content).includes("dot.json")) fail("dab mcp did not list the folder");
await client.close();
console.log("OK — plugin, editor, types, licences, /core and dab mcp all shipped");
`,
  );
  run("node", [probe], { cwd: consumer });

  // /core's types as a game with node's resolution sees them; the expect-error
  // fails the check if they have quietly become \`any\`.
  writeFileSync(
    join(consumer, "game.ts"),
    `import { assembly, frameAt, layers, pixels, type SpriteFile } from "@anarkisti/dab/core";
const s: SpriteFile = { name: "t", w: 1, h: 1, palette: { A: "#ff0000" }, frames: [["A"]], animations: { a: [0] } };
// @ts-expect-error pixels are words, not a string
const wrong: string = pixels(s).px;
export const drawn = [frameAt(s, "a", 2), layers(s), assembly(s), wrong];
`,
  );
  writeFileSync(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "es2023",
        module: "nodenext",
        moduleResolution: "nodenext",
        lib: ["es2023", "dom"],
        strict: true,
        noEmit: true,
        types: [],
      },
      files: ["game.ts"],
    }),
  );
  run(tsc, ["-p", "tsconfig.json"], { cwd: consumer });

  if (!existsSync(join(consumer, "node_modules/.bin/dab"))) throw new Error("no dab command");
  console.log("publish-smoke: PASS");
} finally {
  rmSync(consumer, { recursive: true, force: true });
  rmSync(tgz, { force: true });
}
