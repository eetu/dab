import { alphaOf, cellColour, type SpriteBody, TRANSPARENT } from "./format.ts";

// Images for things that are not dab: an indexed PNG of a frame, a GIF of a
// run. The JSON stays the working format — art that diffs as art — and these
// are what it is handed on as.
//
// Both are INDEXED, which is what a sprite already is: a palette and a grid of
// entries. So nothing is quantised and nothing drifts; the file holds exactly
// the colours drawn. Index 0 is nothing, the way `.` is.

/** A sprite's frames as indices into one shared colour table. */
export type Picture = {
  w: number;
  h: number;
  /** Index 0 is transparent; the rest are `#rrggbb` or `#rrggbbaa`. */
  colours: string[];
  /** One `w × h` array of indices per frame. */
  frames: Uint8Array[];
};

/** One frame of a picture: a frame of a body, in a colourway. */
export type Pose = { body: SpriteBody; frame: number; variant?: string | null };

/**
 * Poses as a picture, in one colour table so a GIF can share it. Each pose is
 * its own body — an assembly flattened as it stood at that step, a cycle in
 * that step's phase — and every body is the size of the first. `scale`
 * repeats each pixel, for a picture someone will look at rather than draw from.
 */
export function picture(poses: readonly Pose[], scale = 1): Picture {
  const k = Math.max(1, Math.round(scale));
  const table = colourTable();
  const w = (poses[0]?.body.w ?? 0) * k;
  const h = (poses[0]?.body.h ?? 0) * k;
  const frames = poses.map((pose) => {
    const px = new Uint8Array(w * h);
    blit(px, w, h, pose, 0, 0, k, table.of);
    return px;
  });
  return { w, h, colours: table.colours, frames };
}

/**
 * Poses laid out on one canvas of `w × h` cells — a strip of frames, a lineup
 * of sprites at one scale — as a picture of one frame. Each pose lands with its
 * top-left at (x, y); what no pose covers is transparent, and a later pose's
 * gaps show an earlier one through.
 */
export function composite(
  placed: readonly { pose: Pose; x: number; y: number }[],
  w: number,
  h: number,
  scale = 1,
): Picture {
  const k = Math.max(1, Math.round(scale));
  const table = colourTable();
  const px = new Uint8Array(w * k * h * k);
  for (const p of placed) blit(px, w * k, h * k, p.pose, p.x, p.y, k, table.of);
  return { w: w * k, h: h * k, colours: table.colours, frames: [px] };
}

/** One colour table for everything drawn into a picture; index 0 is nothing. */
function colourTable() {
  const colours = [""];
  const index = new Map<string, number>();
  const of = (pose: Pose, ch: string): number => {
    const hex = cellColour(pose.body, ch, pose.variant);
    if (!hex) return 0;
    let i = index.get(hex);
    if (i === undefined) {
      i = colours.length;
      colours.push(hex);
      index.set(hex, i);
    }
    return i;
  };
  return { colours, of };
}

/** Draw a pose's frame into `px` (`w × h` pixels) at cell (x, y), each cell
 *  `k × k` pixels. Transparent cells leave what is already there. */
function blit(
  px: Uint8Array,
  w: number,
  h: number,
  pose: Pose,
  x: number,
  y: number,
  k: number,
  of: (pose: Pose, ch: string) => number,
) {
  const rows = pose.body.frames[pose.frame] ?? pose.body.frames[0];
  rows.forEach((row, cy) => {
    for (let cx = 0; cx < row.length; cx++) {
      const ch = row[cx];
      if (ch === TRANSPARENT) continue;
      const i = of(pose, ch);
      for (let dy = 0; dy < k; dy++) {
        const py = (y + cy) * k + dy;
        if (py < 0 || py >= h) continue;
        for (let dx = 0; dx < k; dx++) {
          const pxx = (x + cx) * k + dx;
          if (pxx >= 0 && pxx < w) px[py * w + pxx] = i;
        }
      }
    }
  });
}

const rgb = (hex: string): [number, number, number] =>
  hex
    ? ([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number])
    : [0, 0, 0];

// ---------- PNG ----------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** CRC-32 as PNG uses it (ISO 3309), over a chunk's type and data. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.length);
  body.set([...type].map((c) => c.charCodeAt(0)));
  body.set(data, 4);
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length));
  out.set(body, 4);
  out.set(u32(crc32(body)), 8 + data.length);
  return out;
}

/** zlib, by the platform: `CompressionStream("deflate")` is RFC 1950, which is
 *  what IDAT holds, and saves carrying an encoder for it. */
async function zlib(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(bytes)])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * One frame as an indexed PNG (colour type 3): PLTE for the colours, tRNS for
 * their opacity — one alpha per entry, which is how `#rrggbbaa` and `.` both
 * survive. The web-native palette format, viewable everywhere.
 */
export async function encodePng(pic: Picture, frame = 0): Promise<Uint8Array> {
  const { w, h, colours } = pic;
  const px = pic.frames[frame];
  const ihdr = new Uint8Array([...u32(w), ...u32(h), 8, 3, 0, 0, 0]);
  const plte = new Uint8Array(colours.flatMap((c) => rgb(c)));
  const trns = new Uint8Array(colours.map((c, i) => (i === 0 ? 0 : alphaOf(c))));
  // Each scanline leads with its filter type: 0, none — indexed art barely
  // compresses better filtered, and unfiltered is what a reader expects least.
  const raw = new Uint8Array(h * (w + 1));
  for (let y = 0; y < h; y++) raw.set(px.subarray(y * w, (y + 1) * w), y * (w + 1) + 1);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("PLTE", plte),
    chunk("tRNS", trns),
    chunk("IDAT", await zlib(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ---------- GIF ----------

/**
 * GIF's LZW: variable-width codes from `min + 1` bits up to 12, packed least
 * significant bit first, with a clear code whenever the table fills.
 */
function lzw(indices: Uint8Array, min: number): number[] {
  const clear = 1 << min;
  const end = clear + 1;
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  let size = min + 1;
  const put = (code: number) => {
    buf |= code << bits;
    bits += size;
    while (bits >= 8) {
      out.push(buf & 255);
      buf >>>= 8;
      bits -= 8;
    }
  };
  // A string is its prefix's code and one more index — under 4096 × 256, so
  // one number keys it.
  let dict = new Map<number, number>();
  let next = end + 1;
  put(clear);
  let prefix = indices[0] ?? 0;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const hit = dict.get(key);
    if (hit !== undefined) {
      prefix = hit;
      continue;
    }
    put(prefix);
    if (next < 4096) {
      // Widen BEFORE the entry that needs the extra bit: the decoder grows its
      // table one code behind, and this is the step that keeps the two in time.
      if (next >= 1 << size) size++;
      dict.set(key, next++);
    } else {
      put(clear);
      dict = new Map();
      next = end + 1;
      size = min + 1;
    }
    prefix = k;
  }
  put(prefix);
  put(end);
  if (bits > 0) out.push(buf & 255);
  return out;
}

/**
 * Frames as an animated GIF: one shared colour table, index 0 transparent,
 * looping forever, each frame shown `delay` hundredths of a second.
 *
 * GIF's transparency is on or off, so a see-through colour is resolved here:
 * half opaque or more draws solid, less is nothing. That is the one place an
 * export says less than the file — a PNG keeps every alpha.
 */
export function encodeGif(pic: Picture, delay: number): Uint8Array {
  const { w, h } = pic;
  const solid = pic.colours.map((c, i) => (i === 0 || alphaOf(c) < 128 ? 0 : i));
  // The table's size is a power of two, at least four entries.
  const depth = Math.max(2, Math.ceil(Math.log2(pic.colours.length)));
  const table = new Uint8Array(3 << depth);
  pic.colours.forEach((c, i) => table.set(rgb(c), i * 3));
  const bytes: number[] = [
    ...[..."GIF89a"].map((c) => c.charCodeAt(0)),
    w & 255,
    w >> 8,
    h & 255,
    h >> 8,
    0x80 | ((depth - 1) << 4) | (depth - 1),
    0,
    0,
    ...table,
    // NETSCAPE2.0: loop forever.
    0x21,
    0xff,
    11,
    ...[..."NETSCAPE2.0"].map((c) => c.charCodeAt(0)),
    3,
    1,
    0,
    0,
    0,
  ];
  const cs = Math.max(2, Math.round(delay));
  for (const px of pic.frames) {
    const indices = px.map((i) => solid[i]);
    bytes.push(
      // Graphic control: restore to background between frames (a frame's
      // gaps must not show the last one), the delay, index 0 transparent.
      0x21,
      0xf9,
      4,
      (2 << 2) | 1,
      cs & 255,
      cs >> 8,
      0,
      0,
      // The image: the whole canvas, no local table.
      0x2c,
      0,
      0,
      0,
      0,
      w & 255,
      w >> 8,
      h & 255,
      h >> 8,
      0,
      depth,
    );
    const data = lzw(indices, depth);
    for (let i = 0; i < data.length; i += 255) {
      const block = data.slice(i, i + 255);
      bytes.push(block.length, ...block);
    }
    bytes.push(0);
  }
  bytes.push(0x3b);
  return new Uint8Array(bytes);
}
