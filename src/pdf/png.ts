/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/no-loop-statements -- a byte format: the numbers are the PNG specification's, and the loops walk pixel rows byte by byte, where array methods would copy megabytes */
// Just enough PNG for the pictures a sheet carries (icons.ts): write raw 8-bit pixels as a PNG, and undo
// the PNG row filters that a PDF image may use (/Predictor 10 to 15). Spec: https://www.w3.org/TR/png-3/

/** Raw 8-bit pixels, row after row. */
export interface Pixels {
  width: number;
  height: number;
  /** 1 gray, 2 gray and alpha, 3 RGB, 4 RGBA. */
  channels: number;
  data: Uint8Array;
}

/** The value each filter type adds back to a byte, from its left, upper and upper-left neighbours. */
const PREDICT: ((left: number, up: number, upLeft: number) => number)[] = [
  () => 0, // None
  (left) => left, // Sub
  (_, up) => up, // Up
  (left, up) => Math.floor((left + up) / 2), // Average
  paeth, // Paeth
];

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Undoes PNG row filters: each row starts with its filter type. `bpp`: bytes per pixel. */
export function unfilterRows(data: Uint8Array, rowBytes: number, bpp: number, height: number): Uint8Array {
  const out = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const start = y * (rowBytes + 1);
    const predict = PREDICT[data[start] ?? 0] ?? PREDICT[0];
    const at = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const left = x >= bpp ? (out[at + x - bpp] ?? 0) : 0;
      const up = y > 0 ? (out[at - rowBytes + x] ?? 0) : 0;
      const upLeft = y > 0 && x >= bpp ? (out[at - rowBytes + x - bpp] ?? 0) : 0;
      out[at + x] = ((data[start + 1 + x] ?? 0) + (predict?.(left, up, upLeft) ?? 0)) & 0xff;
    }
  }
  return out;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** PNG colour types by channel count: gray, gray and alpha, RGB, RGBA. */
const COLOUR_TYPE: Record<number, number> = { 1: 0, 2: 4, 3: 2, 4: 6 };

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A chunk: length, type, body, and the CRC of type and body. */
function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** zlib-compressed bytes (what IDAT holds), with the browser's (and Node's) own compressor. */
async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A PNG of raw pixels. Every row is left unfiltered (type 0): simple, and the app scales it down later. */
export async function encodePng({ width, height, channels, data }: Pixels): Promise<Uint8Array> {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bits per channel
  header[9] = COLOUR_TYPE[channels] ?? 0;
  const rowBytes = width * channels;
  const rows = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) rows.set(data.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1);
  const parts = [
    new Uint8Array(SIGNATURE),
    chunk('IHDR', header),
    chunk('IDAT', await deflate(rows)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => {
    out.set(p, at);
    return at + p.length;
  }, 0);
  return out;
}

/** Gray or RGB pixels with an alpha channel added after each pixel. */
export function withAlpha(pixels: Pixels, alpha: Uint8Array): Pixels {
  const { width, height, channels, data } = pixels;
  const out = new Uint8Array(width * height * (channels + 1));
  for (let i = 0; i < width * height; i++) {
    out.set(data.subarray(i * channels, (i + 1) * channels), i * (channels + 1));
    out[i * (channels + 1) + channels] = alpha[i] ?? 0;
  }
  return { width, height, channels: channels + 1, data: out };
}
