// The sprite format, and every operation that edits one.
//
// A sprite is rows of characters plus the palette those characters mean. That is
// the whole format: it diffs as art (a changed pixel is a changed character on a
// line you can point at), it needs no decoder, and it is what a sprite was on the
// machines this kind of art comes from — an X PixMap in JSON, essentially.
// `.` is transparent everywhere and is never a palette key.
//
// A sprite may also carry named PALETTE VARIANTS: alternate colours for some of
// its characters, so one drawing can be recoloured without being redrawn. A
// variant overrides the entries it names and inherits the rest, which is why a
// two-tone sign only has to name its two colours. Nothing about the characters is
// reserved or special-cased — a variant is data, not a rule.
//
// A sprite may carry PARTS: an ordered list of child grids placed at offsets in
// its own coordinates, each with its own frames and its own state. That is how a
// subject that is not one grid — a car with doors, lamps and wheels — is said
// without multiplying its frame strip by every combination of them. A part is
// itself a sprite, which is why every operation here works on one unchanged.
// This is not layers: nothing composites into the grid being edited, and each
// part is still one grid per frame.
//
// And a sprite may carry ANIMATIONS: named runs of frame indices, so a strip
// that is a movement in one place and a set of states in another can say which
// is which. The word a consumer uses — Godot and Unity both ask for one by
// name — rather than "clip", which in a video app means a piece of footage.
//
// Everything here is pure and string-in/string-out, so the editor's undo stack is
// a list of sprites rather than a list of inverse operations, and every tool is
// testable without a canvas.
//
// patch.ts, mapper.ts and sample.ts are shared between these modules and kept out of the
// package's surface.

export * from "./blocks.ts";
export * from "./carry.ts";
export * from "./colour.ts";
export * from "./cycles.ts";
export * from "./flatten.ts";
export * from "./format.ts";
export * from "./frames.ts";
export * from "./geometry.ts";
export * from "./image.ts";
export * from "./json.ts";
export * from "./levels.ts";
export * from "./palette.ts";
export * from "./parts.ts";
export * from "./perspective.ts";
export * from "./read.ts";
export * from "./rotation.ts";
export * from "./shapes.ts";
export * from "./tree.ts";
export * from "./validate.ts";
