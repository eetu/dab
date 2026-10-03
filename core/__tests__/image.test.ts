import { describe, expect, test } from "vitest";

import { crc32, encodeGif, encodePng, picture, type SpriteBody } from "../src";

const SIGN: SpriteBody = {
  w: 3,
  h: 2,
  palette: { A: "#ff0000", B: "#0000ff80", C: "#00ff00" },
  variants: { night: { A: "#110000" } },
  frames: [
    ["AB.", ".CA"],
    ["BA.", ".AC"],
  ],
};

/** PNG chunks as `{ type, data }`, each checked against its CRC. */
function chunks(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset);
  const out: { type: string; data: Uint8Array }[] = [];
  for (let at = 8; at < png.length;) {
    const len = view.getUint32(at);
    const typed = png.subarray(at + 4, at + 8 + len);
    expect(view.getUint32(at + 8 + len), "bad CRC").toBe(crc32(typed));
    out.push({ type: String.fromCharCode(...typed.subarray(0, 4)), data: typed.subarray(4) });
    at += 12 + len;
  }
  return out;
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Enough of a GIF reader to check the LZW: the frames' index streams. */
function gifFrames(gif: Uint8Array): number[][] {
  const depth = (gif[10] & 7) + 1;
  let at = 13 + (3 << depth);
  const frames: number[][] = [];
  while (gif[at] !== 0x3b) {
    if (gif[at] === 0x21) {
      at += 2;
      while (gif[at]) at += gif[at] + 1;
      at++;
      continue;
    }
    // Image descriptor, then the min code size and sub-blocks.
    const w = gif[at + 5] | (gif[at + 6] << 8);
    const h = gif[at + 7] | (gif[at + 8] << 8);
    const min = gif[at + 10];
    at += 11;
    const data: number[] = [];
    while (gif[at]) {
      data.push(...gif.subarray(at + 1, at + 1 + gif[at]));
      at += gif[at] + 1;
    }
    at++;
    const clear = 1 << min;
    let size = min + 1;
    let table: number[][] = [];
    const reset = () => {
      table = Array.from({ length: clear + 2 }, (_, i) => [i]);
      size = min + 1;
    };
    reset();
    const out: number[] = [];
    let bit = 0;
    let prev: number[] | null = null;
    for (;;) {
      let code = 0;
      for (let i = 0; i < size; i++, bit++) code |= ((data[bit >> 3] >> (bit & 7)) & 1) << i;
      if (code === clear) {
        reset();
        prev = null;
        continue;
      }
      if (code === clear + 1) break;
      const entry: number[] = code < table.length ? table[code] : [...prev!, prev![0]];
      out.push(...entry);
      if (prev) table.push([...prev, entry[0]]);
      if (table.length === 1 << size && size < 12) size++;
      prev = entry;
    }
    expect(out).toHaveLength(w * h);
    frames.push(out);
  }
  return frames;
}

describe("images", () => {
  test("a picture is indices into one table, transparent at 0, in the colourway asked for", () => {
    // Two poses in different colourways share the one table.
    const mixed = picture([
      { body: SIGN, frame: 0 },
      { body: SIGN, frame: 0, variant: "night" },
    ]);
    expect(mixed.colours).toEqual(["", "#ff0000", "#0000ff80", "#00ff00", "#110000"]);

    const pic = picture([0, 1].map((frame) => ({ body: SIGN, frame, variant: "night" })));
    expect(pic.colours).toEqual(["", "#110000", "#0000ff80", "#00ff00"]);
    expect([...pic.frames[0]]).toEqual([1, 2, 0, 0, 3, 1]);
    expect([...pic.frames[1]]).toEqual([2, 1, 0, 0, 1, 3]);
    const big = picture([{ body: SIGN, frame: 0 }], 2);
    expect([big.w, big.h]).toEqual([6, 4]);
    expect([...big.frames[0].subarray(0, 6)]).toEqual([1, 1, 2, 2, 0, 0]);
  });

  test("a PNG is indexed, keeps every alpha, and its pixels are the frame", async () => {
    const pic = picture([{ body: SIGN, frame: 0 }]);
    const png = await encodePng(pic);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const parts = chunks(png);
    expect(parts.map((c) => c.type)).toEqual(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);
    const ihdr = new DataView(parts[0].data.buffer, parts[0].data.byteOffset);
    expect([ihdr.getUint32(0), ihdr.getUint32(4), parts[0].data[8], parts[0].data[9]]).toEqual([
      3, 2, 8, 3,
    ]);
    expect([...parts[1].data]).toEqual([0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 255, 0]);
    expect([...parts[2].data]).toEqual([0, 255, 128, 255]);
    const raw = await inflate(parts[3].data);
    // A filter byte (0) leads each row.
    expect([...raw]).toEqual([0, 1, 2, 0, 0, 0, 3, 1]);
  });

  test("a GIF holds every frame, and its LZW reads back to the same indices", () => {
    const pic = picture([0, 1].map((frame) => ({ body: SIGN, frame })));
    const gif = encodeGif(pic, 10);
    expect(String.fromCharCode(...gif.subarray(0, 6))).toBe("GIF89a");
    // B is #0000ff80 — exactly half opaque, so it draws solid; below half it
    // would have been index 0.
    expect(gifFrames(gif)).toEqual([
      [1, 2, 0, 0, 3, 1],
      [2, 1, 0, 0, 1, 3],
    ]);
  });

  test("a GIF stays right past a full code table and widening codes", () => {
    // Enough noise to fill the 4096-entry table more than once.
    const w = 120;
    const h = 90;
    let seed = 7;
    const rows = Array.from({ length: h }, () =>
      Array.from({ length: w }, () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return "ABCD."[seed % 5];
      }).join(""),
    );
    const body: SpriteBody = {
      w,
      h,
      palette: { A: "#ff0000", B: "#00ff00", C: "#0000ff", D: "#ffffff" },
      frames: [rows],
    };
    const pic = picture([{ body, frame: 0 }]);
    expect(gifFrames(encodeGif(pic, 10))[0]).toEqual([...pic.frames[0]]);
  });
});
