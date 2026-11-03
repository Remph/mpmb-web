/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/no-loop-statements -- pixel values and PNG header offsets are the test data; the chunk walk steps by each chunk's length */
import { describe, expect, it } from 'vitest';
import { encodePng, unfilterRows, withAlpha } from './png.ts';

/** The bytes a zlib stream inflates to. */
async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A PNG's chunks by type. */
function chunks(png: Uint8Array): Record<string, Uint8Array> {
  const view = new DataView(png.buffer, png.byteOffset);
  const out: Record<string, Uint8Array> = {};
  let at = 8;
  while (at < png.length) {
    const length = view.getUint32(at);
    const type = new TextDecoder().decode(png.subarray(at + 4, at + 8));
    out[type] = png.subarray(at + 8, at + 8 + length);
    at += length + 12;
  }
  return out;
}

describe('PNG', () => {
  it('writes the pixels with the right header, rows unfiltered', async () => {
    // 2 × 2 RGB: red, green / blue, white.
    const data = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
    const png = await encodePng({ width: 2, height: 2, channels: 3, data });
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const { IHDR, IDAT, IEND } = chunks(png);
    const header = new DataView(IHDR!.buffer, IHDR!.byteOffset);
    expect([header.getUint32(0), header.getUint32(4), IHDR![8], IHDR![9]]).toEqual([2, 2, 8, 2]);
    expect([...(await inflate(new Uint8Array(IDAT!)))]).toEqual([0, ...data.subarray(0, 6), 0, ...data.subarray(6)]);
    expect(IEND?.length).toBe(0);
    // The CRC of an empty IEND chunk is the same in every PNG.
    expect([...png.subarray(png.length - 4)]).toEqual([0xae, 0x42, 0x60, 0x82]);
  });

  it('adds an alpha channel after each pixel', () => {
    const rgba = withAlpha(
      { width: 2, height: 1, channels: 1, data: Uint8Array.from([10, 20]) },
      Uint8Array.from([255, 0]),
    );
    expect(rgba).toEqual({ width: 2, height: 1, channels: 2, data: Uint8Array.from([10, 255, 20, 0]) });
  });

  it('undoes the PNG row filters', () => {
    // Gray, 3 pixels per row: row 1 "Sub" (each byte adds the one on its left), row 2 "Up" (adds the
    // byte above), row 3 "Average", row 4 "Paeth".
    const filtered = Uint8Array.from([1, 10, 5, 5, 2, 1, 1, 1, 3, 2, 2, 2, 4, 0, 0, 0]);
    expect([...unfilterRows(filtered, 3, 1, 4)]).toEqual([10, 15, 20, 11, 16, 21, 7, 13, 19, 7, 13, 19]);
  });
});
