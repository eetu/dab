// The published types of `@anarkisti/dab/vite`. Written by hand, so the package
// carries no declarations of its internals; `__tests__/types.check.ts` fails
// the typecheck if they drift from src/vite.ts.
import type { Plugin } from "vite";

/** Where the editor is served in the dev server: `/__dab/`. */
export declare const BASE: string;
/** Where the sprite folder is served to the editor: `/__dab/api`. */
export declare const API: string;

export type Options = {
  /** The sprite folder, relative to the Vite root. */
  sprites: string;
  /** The port MCP is served on — the same in every project, registered once —
   *  or false for none. Default 3061. */
  mcp?: number | false;
};

/**
 * dab in a Vite dev server: the editor at /__dab/, the sprite folder it edits
 * at /__dab/api, and MCP on port 3061. Dev only; a build never sees it.
 */
export default function dab(options: Options): Plugin;
