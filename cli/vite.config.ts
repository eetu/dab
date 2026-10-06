import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Three entries — the `dab` command, the Vite plugin, and core for a game to
// read sprites with — bundled with EVERYTHING they import but Node's own
// modules: core's source, the MCP SDK and zod (only the paths dab reaches; the
// SDK's Express, CORS and the rest never are). The package installs nothing
// else, so a game that takes `@anarkisti/dab/core` takes one package. Vite is
// only ever a type here.
const CORE = fileURLToPath(new URL("../core/src/index.ts", import.meta.url));

/** The package a bundled module came from: its folder, name and version. */
const packageOf = (id: string) => {
  for (let dir = dirname(id); dir !== dirname(dir); dir = dirname(dir)) {
    const manifest = join(dir, "package.json");
    if (!existsSync(manifest)) continue;
    const p = JSON.parse(readFileSync(manifest, "utf8")) as {
      name?: string;
      version?: string;
      license?: string;
    };
    if (p.name && p.version) return { dir, name: p.name, version: p.version, license: p.license };
  }
  return null;
};

/** Every bundled package's licence, beside the code that carries it. */
const licences = (): Plugin => ({
  name: "third-party-licences",
  generateBundle() {
    const found = new Map<string, string>();
    for (const id of this.getModuleIds()) {
      if (!id.includes("/node_modules/")) continue;
      const p = packageOf(id);
      if (!p || found.has(`${p.name}@${p.version}`)) continue;
      const file = readdirSync(p.dir).find((f) => /^(licen[cs]e|copying)/i.test(f));
      const text = file ? readFileSync(join(p.dir, file), "utf8").trim() : `License: ${p.license}`;
      found.set(`${p.name}@${p.version}`, `${p.name}@${p.version} (${p.license})\n\n${text}`);
    }
    const body = [...found.keys()].sort().map((k) => found.get(k));
    this.emitFile({
      type: "asset",
      fileName: "THIRD-PARTY-LICENSES.txt",
      source: `Bundled into @anarkisti/dab:\n\n${body.join(`\n\n${"-".repeat(72)}\n\n`)}\n`,
    });
  },
});

export default defineConfig({
  resolve: { alias: { "dab-core": CORE } },
  ssr: { noExternal: true },
  plugins: [licences()],
  build: {
    ssr: true,
    outDir: "dist",
    target: "node22",
    rollupOptions: {
      input: { dab: "src/dab.ts", vite: "src/vite.ts", core: "src/core.ts" },
      output: {
        entryFileNames: "[name].js",
        banner: (chunk) => (chunk.name === "dab" ? "#!/usr/bin/env node" : ""),
      },
    },
  },
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
});
