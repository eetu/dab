import { type SpriteFile } from "../src";

export const sprite = (
  rows: string[],
  palette: Record<string, string> = { A: "#ff0000" },
): SpriteFile => ({
  name: "test",
  w: rows[0].length,
  h: rows.length,
  palette,
  frames: [rows],
});

/** A car-shaped fixture: a body, a door of its own, and a wheel it borrows. */
export const car = (): SpriteFile => ({
  name: "car",
  w: 6,
  h: 4,
  palette: { B: "#c81e3c" },
  animations: { clean: [0], dented: [1] },
  frames: [
    ["BBBBBB", "B....B", "B....B", "BBBBBB"],
    ["BBBBB.", "B....B", "B....B", "BBBBBB"],
  ],
  parts: [
    {
      name: "doorL",
      x: 2,
      y: 1,
      w: 2,
      h: 2,
      palette: { D: "#101014" },
      animations: { shut: [0], swing: [0, 1, 2], open: [2] },
      frames: [
        ["DD", "DD"],
        ["D.", "D."],
        ["..", ".."],
      ],
    },
    { name: "wheel", x: 1, y: 3, use: "spoke" },
    { name: "wheelR", x: 4, y: 3, flip: "h", use: "spoke" },
  ],
});

export const spoke: SpriteFile = {
  name: "spoke",
  w: 2,
  h: 2,
  palette: { K: "#222222" },
  frames: [["K.", ".K"]],
};
