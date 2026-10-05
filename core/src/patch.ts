import { type SpriteBody } from "./format.ts";

/**
 * Spread a patch over a node, keeping whatever else it carries — its name at the
 * root, its placement when it is a part.
 *
 * Every operation in core goes through this, which is what lets one function serve
 * both. The cast is TypeScript's inability to see that a spread of `T` is a `T`;
 * it lives here once rather than at each call.
 */
export const patch = <T extends SpriteBody>(node: T, next: Partial<SpriteBody>): T =>
  ({ ...node, ...next }) as T;
