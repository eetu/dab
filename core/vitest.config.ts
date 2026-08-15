import { defineConfig } from "vitest/config";

// Pure functions on strings — no browser, no DOM. Everything here is
// string-in/string-out by design (that is what makes the editor's undo stack a
// list of sprites rather than a list of inverse operations), so node is the whole
// environment the format needs.
export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
});
