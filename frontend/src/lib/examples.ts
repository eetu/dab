// The example: scene's car, verbatim (frontend/src/examples/), plus the wheel
// its `use` parts borrow.
//
// A first visitor — especially on the Pages build — met a blank 16×16 and nine
// icons, which demonstrates nothing this tool is actually for. The car does:
// five parts (pop-up lights with open/close clips, two doors, one wheel drawn
// once and placed twice), so the first thing seen is the thing the format was
// built to say.
import type { SpriteFile } from "dab-core";
import { cloneSprite } from "dab-core";

import carJson from "../examples/car.json";
import wheelJson from "../examples/wheel.json";

const car = carJson as SpriteFile;
const wheel = wheelJson as SpriteFile;

/** What the example needs in the sheet, so its `use` parts resolve. */
export const EXAMPLE_SHEET: Record<string, SpriteFile> = {
  [car.name]: car,
  [wheel.name]: wheel,
};

/** A fresh copy to draw on. No file behind it: Save writes wherever you point
 *  it, and Revert stays honestly disabled — this was never on your disk. */
export const exampleCar = (): SpriteFile => cloneSprite(car);
