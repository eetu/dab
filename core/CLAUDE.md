# core — working here

The root `CLAUDE.md` has the format's conventions and why; FORMAT.md is the
format for a consumer. This is what you need to change core without breaking
either.

## Adding an operation

- Pure, string-in/string-out, generic over `<T extends SpriteBody>` so it works
  on a sprite, a part and a level alike, and written through `patch` — never a
  spread that drops `name`, a placement or `levels`.
- A frame operation remaps animations (`remapAnimations`) AND carries every
  level (`inStep` in `frames.ts`). Miss either and the file fails to load.
- An operation that drops or renames a palette character carries it through
  every variant (`mapVariants` in `palette.ts`), and the editor re-derives
  cycles after it (`refreshCycles`, from the cycles taken BEFORE the edit when
  a character goes).
- A transform that resamples is a back-map into `resample` (`sample.ts`), not a
  new loop. Anything that invents colours goes through `paletteMapper`.

## Changing the format

A new key or rule touches four places together: `validate.ts`, the schema
(`schema/sprite.schema.json`), FORMAT.md, and the lists in
`__tests__/schema.test.ts` — structural rules in one, rules only the validator
can say (one field against another) in the other. The test fails until they
agree. `json.ts` writes the key in a fixed place, one frame row per line.

## Layout

One module per concern, re-exported by `index.ts`. `patch.ts`, `mapper.ts` and
`sample.ts` are shared between modules and stay off the surface. A test file
per module, with shared sprites in `__tests__/fixtures.ts`; node only — the
`DOM` lib in `tsconfig.json` is for types (`CompressionStream`, `Blob`), not for
a browser.
