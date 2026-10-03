import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// The CLI is bundled with core's SOURCE inlined: core's own build keeps
// extensionless imports, which node's ESM loader will not run. The SDK and zod
// stay external and load from node_modules.
const CORE = fileURLToPath(new URL("../core/src/index.ts", import.meta.url));

export default defineConfig({
  resolve: { alias: { "dab-core": CORE } },
  ssr: { noExternal: ["dab-core"] },
  build: {
    ssr: "src/dab.ts",
    outDir: "dist",
    target: "node22",
    rollupOptions: { output: { banner: "#!/usr/bin/env node" } },
  },
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
});
