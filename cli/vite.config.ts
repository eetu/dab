import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Two entries — the `dab` command and the Vite plugin — bundled with core's
// SOURCE inlined: core's own build keeps extensionless imports, which node's
// ESM loader will not run. The SDK, zod and vite stay external.
const CORE = fileURLToPath(new URL("../core/src/index.ts", import.meta.url));

export default defineConfig({
  resolve: { alias: { "dab-core": CORE } },
  ssr: { noExternal: ["dab-core"] },
  build: {
    ssr: true,
    outDir: "dist",
    target: "node22",
    rollupOptions: {
      input: { dab: "src/dab.ts", vite: "src/vite.ts" },
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
