# The dab sprite format

One sprite is one JSON file: rows of characters, and the palette they mean. The
format is the contract — there is no library to depend on. A consumer owns its
reader (the one at the end of this page is enough for most), and can check a
file without running dab's code against
[`schema/sprite.schema.json`](schema/sprite.schema.json). The rules below are
the ones `validateSprite` enforces; the schema says every one of them that JSON
Schema can, and the last section lists the ones it cannot.

The format may change. Every consumer is in-house, and is moved with it.

## A sprite

```json
{
  "name": "sign",
  "w": 4,
  "h": 2,
  "palette": { "A": "#ff2080", "B": "#20e0ff80" },
  "variants": { "cyan": { "A": "#20e0ff" } },
  "animations": { "flicker": [0, 1, 1] },
  "frames": [
    ["AAAA", "B..B"],
    ["AAAA", "...."]
  ]
}
```

| key          | required | what it is                                             |
| ------------ | -------- | ------------------------------------------------------ |
| `name`       | yes      | non-empty; the file is `name.json`, and `use` names it |
| `w`, `h`     | yes      | whole numbers, at least 1                              |
| `palette`    | yes      | character → colour                                     |
| `frames`     | yes      | at least one; each is `h` strings of `w` characters    |
| `variants`   |          | name → { character → colour }: alternate colourways    |
| `animations` |          | name → frame indices, in playing order                 |
| `parts`      |          | child grids placed on this one — see Parts             |
| `levels`     |          | the same subject drawn at other sizes — see Levels     |

Unknown keys are ignored. A key once called `clips` is read as `animations`.

## Colours

- `.` is transparent, everywhere, and is never a palette key.
- A palette key is one printable ASCII character (`!` to `~`), any but `.`.
- A colour is `#rrggbb`, or `#rrggbbaa` for one you can see through.
- Every character in a frame is `.` or a key of that node's palette.

A cell's colour is the whole rule:

```ts
ch === "." ? null : (variant?.[ch] ?? palette[ch]);
```

## Variants

A variant names alternate colours for some of the palette's characters and
inherits the rest; it may only name characters the palette has. A consumer
picks one by name.

**Colour cycles** are variants too: a run of palette entries rotated, written
as one variant per phase — `water 1`, `water 2` … `water n` — each naming only
the characters it turns. Phase 1 is the palette as drawn. A consumer cycles by
drawing `water k` on its own clock, counting phases up to the first missing
number.

## Animations

A list of frame indices, each less than the number of frames, never empty. A
repeated index is a hold; reversing is reading the list backwards. There are no
durations: a consumer's clock is its own.

## Parts

A part is a child grid at an offset in its parent's pixels, drawn after the
parent's own grid (or before it, with `behind`), in list order.

| key      | what it is                                                             |
| -------- | ---------------------------------------------------------------------- |
| `name`   | unique among its siblings; may not start with `@`                      |
| `x`, `y` | whole pixels, in the parent's coordinates; may be negative             |
| `behind` | `true` draws it before the parent's grid                               |
| `flip`   | `"h"`, `"v"` or `"hv"` mirrors it; a flipped part carries no parts     |
| `use`    | the name of another sprite to draw here — a leaf, never its own sprite |

A part has **either** its own body (`w`, `h`, `palette`, `frames`, and
optionally `variants`, `animations` and `parts` — a part is a sprite) **or** a
`use`, never both. Parts nest at most four deep. Which frame a part shows, and
whether it is drawn, is the consumer's state, not the file's.

To draw a node: its `behind` parts, then its own grid, then the rest — each at
its parent's offset plus its own, each showing whichever frame the consumer
says.

## Levels

```json
"levels": [
  { "name": "far", "w": 13, "h": 12, "palette": { "A": "#8a5a2a" }, "frames": [["…"]] }
]
```

The sprite drawn at another size, beside its own grid (which is the nearest).
Only the sprite itself has levels. A level has a non-empty name without `/`,
unique among the levels; its own palette and variants; and **exactly as many
frames as the sprite**, because it plays the sprite's animations — it has no
`animations` of its own, and no parts. Which size to draw at which distance is
the consumer's.

## How dab writes a file

Keys in a fixed order, and one frame row per line, so a changed pixel is a
changed line in the diff. A `use` part is written on one line. Keep formatters
away from these files: packing the rows onto one line turns the art into a wall
of quoted strings.

## Rules only the validator checks

JSON Schema cannot relate one field to another, so these are `validateSprite`'s
alone — a file can satisfy the schema and still break one:

- each frame has `h` rows of exactly `w` characters;
- every character in a frame is `.` or in the palette;
- a variant names only characters the palette has;
- an animation's indices are less than the number of frames;
- part names are unique among siblings, and level names among levels;
- a part does not `use` the sprite it belongs to;
- parts nest at most four deep;
- every level has as many frames as the sprite.

`core/__tests__/schema.test.ts` holds the two to each other: whatever the
validator accepts, the schema accepts; whatever it rejects, the schema rejects
too, except for the rules above.

## A reader

Enough to draw one frame of a grid, in a colourway, on a canvas:

```ts
type Body = {
  w: number;
  h: number;
  palette: Record<string, string>;
  variants?: Record<string, Record<string, string>>;
  frames: string[][];
};

function draw(
  ctx: CanvasRenderingContext2D,
  s: Body,
  frame: number,
  x: number,
  y: number,
  variant?: string,
) {
  s.frames[frame].forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      const colour = ch === "." ? null : (s.variants?.[variant ?? ""]?.[ch] ?? s.palette[ch]);
      if (colour) {
        ctx.fillStyle = colour;
        ctx.fillRect(x + dx, y + dy, 1, 1);
      }
    });
  });
}
```

A level is the same call on `sprite.levels.find((l) => l.name === "far")`; parts
add the loop under Parts. The README has that loop written out, from the
renderer dab draws with.
