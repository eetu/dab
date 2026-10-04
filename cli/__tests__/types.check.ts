// The published types are written by hand (types/vite.d.ts). This is not a
// test that runs: it fails the TYPECHECK when they drift from the plugin.
import type * as Real from "../src/vite";
import type * as Published from "../types/vite";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export const options: Same<Published.Options, Real.Options> = true;
export const plugin: Same<typeof Published.default, typeof Real.default> = true;
export const base: Same<typeof Published.BASE, string> = true;
