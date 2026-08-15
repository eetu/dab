import svelte from "@anarkisti/eslint-config/svelte";

import svelteConfig from "./svelte.config.js";

// The house preset, unmodified.
export default [...svelte(svelteConfig), { ignores: ["dist/"] }];
