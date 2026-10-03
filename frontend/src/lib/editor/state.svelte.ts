import { blankSprite, type SpriteFile, TRANSPARENT } from "dab-core";

// The editor's state: the sprite being drawn and what the tools are set to.

export type Tool =
  "pencil" | "eraser" | "fill" | "picker" | "line" | "rect" | "ellipse" | "select" | "move";

/** The rail, in order. `key` is the single-press shortcut, as in nib. */
export const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: "pencil", label: "Pencil", key: "b", hint: "Draw with the selected colour" },
  { id: "eraser", label: "Eraser", key: "e", hint: "Paint transparent" },
  { id: "fill", label: "Fill", key: "g", hint: "Flood the connected run" },
  {
    id: "picker",
    label: "Picker",
    key: "i",
    hint: "Take the colour under the cursor — or hold ⌥ over any other tool",
  },
  { id: "line", label: "Line", key: "l", hint: "Drag a straight run" },
  { id: "rect", label: "Rect", key: "r", hint: "Drag a box — hold Shift to fill" },
  { id: "ellipse", label: "Ellipse", key: "o", hint: "Drag a box — hold Shift to fill" },
  {
    id: "select",
    label: "Select",
    key: "m",
    hint: "Click a shape or drag a box (⌥ takes only painted cells), then drag it — arrows nudge, ⌘C/X/V, ⌫ clears",
  },
  {
    id: "move",
    label: "Move",
    key: "v",
    hint: "Drag a part into place — the whole part, not its pixels",
  },
];

export const editor = $state({
  sprite: blankSprite("untitled", 16, 16) as SpriteFile,
  /** The file this came from, so Save knows whether it is a new sprite. */
  file: null as string | null,
  dirty: false,
  frame: 0,
  /**
   * Which node the tools write to: part names from the root down, `[]` for the
   * sprite itself. One document, a selected node — so a part edit is an ordinary
   * edit to the sprite and the undo stack keeps holding whole sprites.
   */
  path: [] as string[],
  /**
   * Which frame every other node shows, and which are hidden while drawing.
   * Both are editor state and neither is written to the file: a part's frame is
   * the consumer's to choose, and a door that is gone is the consumer not
   * drawing it. `"follow"` tracks the active node, which is what makes drawing a
   * raise across two parts legible.
   */
  shown: {} as Record<string, number | "follow">,
  hidden: {} as Record<string, boolean>,
  tool: "pencil" as Tool,
  /** Palette character the pencil paints; `.` means transparent. */
  ink: TRANSPARENT,
  grid: true,
  onion: true,
  playing: false,
  fps: 6,
  /** The play head, driven by the preview and read by the frame strip, so both
   *  show the same frame instead of each running its own clock. */
  playhead: 0,
  /** Which palette variant the canvas and previews are showing, or null for the
   *  palette itself. A recoloured sprite has to be viewable in each of its
   *  colourways, since that is what a consumer will draw. */
  variant: null as string | null,
  /** Which named run the play head is walking, or null for the whole strip. */
  animation: null as string | null,
  status: "" as string,
  /** Whether the status is a refusal or a failure — drawn in the error colour,
   *  where an outcome ("saved car.json") stays quiet. */
  statusBad: false,
});
