import { defineConfig } from "vitest/config";

import base from "./vitest.config.ts";

// The screenshot rig — see shots/rig.ts. Same browser and same viewport as the
// suite, a different include, and deliberately NOT part of `just check`: these
// are for looking at, and a picture nobody looks at is a slow test with an
// artefact attached.
//
// Spread rather than `mergeConfig`, which CONCATENATES arrays — merging would
// have added the scenes to the suite instead of replacing it, and `just shots`
// would quietly run the whole test run as well.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["shots/*.shot.ts"],
    // Each scene mounts the whole app and paints it; several at once on a
    // two-core machine gives blurred or half-laid-out pictures.
    fileParallelism: false,
  },
});
