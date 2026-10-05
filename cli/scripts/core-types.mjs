// The declarations of `@anarkisti/dab/core` are core's own, as its build writes them: copied
// beside the hand-written ones, so they can never drift from what core exports.
import { cpSync, rmSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

const from = fileURLToPath(new URL("../../core/dist", import.meta.url));
const to = fileURLToPath(new URL("../types/core", import.meta.url));
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true, filter: (src) => !src.endsWith(".js") });
