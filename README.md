# dab

A pixel editor for **character-grid sprites**: a sprite is rows of characters
plus the palette those characters mean.

```json
{
  "name": "car",
  "w": 8,
  "h": 3,
  "palette": { "R": "#e0344a", "K": "#0d0810" },
  "frames": [["..RRRR..", ".RRRRRR.", ".K.KK.K."]]
}
```

Text, not an image, on purpose: art in that shape **diffs as art** — a tweak to a
roofline shows up in review as a changed line you can point at, not as
`Bin 4kB -> 4kB` — and it needs no decoder to draw, which is the same reason the
machines this kind of art came from stored it that way.

## What it does

Draw (pencil, eraser, fill, picker, line, rect, ellipse), select and move a shape
or a box of pixels, cut and paste it — within a sprite, or into one of its parts
— move whole parts with the Move tool, manage the palette, step frames with
onion-skinning, and press play to watch it run on the canvas itself. A paste floats: it sits over
what it landed on until you deselect, select something else or draw, so you can
shove it into place and the art it passed over comes back.

**Rotation is a mode**, because nobody knows the angle they want until they see
it. Right-click a selection (or the sprite) and pick Rotate: the canvas turns
live where it stands, and you keep it or you don't. Quarter turns are exact.
Anything else has to invent the colours between the ones you have — indexed art
cannot interpolate, so smoothing either adds palette entries or does not smooth
— and the bar shows how many it would add before you pay for them. Blends land
in OKLab distance of what is already there, so a second rotation mostly reuses
what the first one paid for; turning one source to 15°, 30°, 45°, 60° and 75°
costs 9, 3, 2, 0 and 0 entries and then stops. Edges against nothing come out as
partial alpha rather than blended toward a guessed backdrop, which is what makes
a rotated sprite look right in the game and not just in the editor.

**It turns three ways, and only one of them is a rotation.** _Spin_ is the one
above: the art turning in the picture plane, a wheel. _Swing_ and _Tilt_ are
hinges — the art turning out of the picture, which an orthographic view shows as
foreshortening: the same art `cos θ` as wide about a hinge line you drag onto it.
That is a car door opening toward you, or a bonnet lifting. It drops pixel
columns and invents nothing (smoothing is there if you want it, off by default),
so what you get is the geometry right and the art yours to draw over.

**And it can write the frames.** Set the angle you want at the end, set _frames_
to how many you want between, and Apply writes them — the art where it stands,
then one frame per step — with an animation naming the run. Every step is sampled
from the original rather than from the step before it, so the last frame is as
clean as the first and the palette settles instead of climbing. A door goes
closed-to-open in four frames and a wheel a quarter turn in three, and then the
drawing starts.

It edits files **in place**: point it at a folder and, in a browser with the File
System Access API (Chrome/Edge), Save writes back to the file it opened.
Elsewhere it falls back to a download.

**Try it without installing anything: <https://eetu.github.io/dab/>** — the whole
tool is client-side, so the Pages build is the editor entire. Your files never
leave your machine. `?` opens the built-in guide; the gear picks a theme
(auto/dark/light).

**A colour is `#rrggbb`, or `#rrggbbaa`** for something you can see through —
glass, a windscreen, a shadow. Eight digits rather than a separate alpha map,
because a canvas and a stylesheet both take that string as it stands, so the
rule a consumer needs does not grow a second lookup. It is also how an indexed
PNG says it: one alpha per palette entry, in `tRNS`. `.` is still the only way
to say _nothing is here_; a colour ending `00` is a colour that happens to be
invisible, which is a different statement.

**Palette variants** are for drawings that get recoloured: a variant names
alternate colours for some of the characters and inherits the rest, so one sign
can be magenta in one place and cyan in another without being redrawn. Nothing
about the characters is reserved — a variant is data, not a rule.

**Parts** are for subjects that are not one grid. A car has a body, two wheels,
two doors, pop-up lamps and a trunk; each has its own state, and expressed as
whole-car frames that is the product of every combination of them — three door
states by three lamp states by two trunk by three damage is fifty-four 72×18
frames before the wheels turn. As parts it is four short strips.

```json
"parts": [
  { "name": "wheelBack", "x": 11, "y": 11, "use": "spoke" },
  { "name": "wheelFront", "x": 52, "y": 11, "flip": "h", "use": "spoke" },
  { "name": "doorL", "x": 20, "y": 6, "behind": true, "w": 14, "h": 10, "…": "…" }
]
```

A part is a placement plus **either its own pixels or a `use`** naming another
sprite in the folder. Inline for composition, which is intrinsic — a trunk lid is
not a thing apart from its car, and a file of its own would split one subject
across two documents. `use` for reuse, which is a link — one wheel drawn once and
fixed once for every car in the folder. A part with a body _is_ a sprite: same
keys, same rules, same tools.

Parts draw in list order after their parent, or before it with `behind` (a seat
showing through the windows). `flip` mirrors one — free in this format, and what
makes one door serve both sides. Nesting is allowed to four deep; a `use` is a
leaf. **This is not layers**: each part is still one grid per frame, edited on its
own, composited only at draw time.

**Animations** name a run of frame indices, so a strip that is a movement in one
place and a set of states in another can say which: `{"shut": [0], "swing": [0,
1, 2], "open": [2]}`. The word Godot and Unity both use for the thing you ask for
by name — a video app's "clip" is a piece of footage, which this is not. Indices
rather than a range and a direction: reversing is reading the list backwards and
a repeat is a hold, so neither needs a field. There are no durations — a
consumer's clock is its own. In the editor they are lanes under the frame strip,
each bar covering the frames it names; click a cell to add or drop a frame, drag
to sweep a run.

Which frame each part shows, and whether it is drawn at all, is **runtime state**
and is not in the file. A door that has fallen off is the consumer not drawing
that part.

## Layout

```text
core/       the format and every pure operation on it (private to this repo)
frontend/   the editor: a Vite + Svelte SPA
backend/    a small axum binary that serves the built SPA
```

`core` is not published. The whole rule a consumer needs for colour is one line —
`ch === "." ? null : (variant?.[ch] ?? palette[ch])` — so the **format** is the
contract, not a library. See FORMAT.md when it lands (#8).

Parts add a loop rather than a rule, and it is the loop the editor itself draws with
(`frontend/src/lib/render.ts`): for each node, the parts marked `behind`, then its
own grid, then the rest — each at its parent's offset plus its own, each showing
whichever frame the consumer's state says.

```ts
function draw(node, ox, oy, state, look, path = "") {
  const parts = node.parts ?? [];
  for (const p of parts) if (p.behind) drawPart(p, ox, oy, state, look, path);
  drawGrid(node, node.frames[state[path] ?? 0], ox, oy, look);
  for (const p of parts) if (!p.behind) drawPart(p, ox, oy, state, look, path);
}

function drawPart(p, ox, oy, state, look, path) {
  // A shared part is a leaf: its own parts, if any, are not expanded.
  const node = p.use ? { ...sheet[p.use], parts: undefined } : p;
  if (!node.frames) return; // a name the sheet hasn't got: draw nothing
  draw(node, ox + p.x, oy + p.y, state, look, path ? `${path}/${p.name}` : p.name);
}
```

`flip` mirrors a node's rows on the way out (reverse the rows, reverse each), and
a node carrying `flip` never carries parts, so there are no child offsets to
mirror with it.

## Working on it

```sh
just dev        # backend + frontend together
just check      # lint, format, typecheck, test — the whole gate, and what CI will run (#2)
```

First customer: [scene](https://github.com/eetu/scene)'s neon-drive visualiser,
whose sprites live in `packages/player/src/sprites`. Its reader speaks the whole
format — parts (inline and `use`), palette variants, animations — so a sprite split
into parts here draws assembled there, and the car's wheel contact points are
read off its parts rather than kept as a constant.
