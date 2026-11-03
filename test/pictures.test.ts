/* eslint-disable ts-patterns/no-magic-numbers -- picture sizes are the test data */
// M8: the portrait and symbol travel with the character: through the engine (a save keeps them), the
// stored character and its list entry, and a backup.
import { describe, expect, it } from 'vitest';
import { applyCharacter, diffCharacter } from '../src/engine/sheet-data.ts';
import { blankSheet } from '../src/engine/sheet.ts';
import { PICTURE_SIZE, SAFE_PICTURE, blobOfDataUrl, fitSize, seeThroughPixels } from '../src/play/pictures.ts';
import { describeCharacter } from '../src/store/characters.ts';
import { openSheet, referenceSheet } from './characters.ts';

const PORTRAIT = { src: 'data:image/jpeg;base64,AAAA', thumb: 'data:image/jpeg;base64,BBBB' };
const SYMBOL = { src: 'data:image/png;base64,CCCC', thumb: 'data:image/png;base64,DDDD' };
const NO_ADD_ONS = { files: [], manual: false };

describe('pictures on the sheet', () => {
  it('are kept by a save and come back when the character opens', () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    engine.setImage('portrait', PORTRAIT);
    engine.setImage('symbol', SYMBOL);
    const saved = diffCharacter(blankSheet(), engine.snapshot());
    expect(saved.images).toEqual({ portrait: PORTRAIT, symbol: SYMBOL });

    const again = openSheet(applyCharacter(blankSheet(), saved));
    expect(again.snapshot().images).toEqual({ portrait: PORTRAIT, symbol: SYMBOL });
    again.setImage('symbol', null);
    expect(diffCharacter(blankSheet(), again.snapshot()).images).toEqual({ portrait: PORTRAIT });
  });

  it('a character without pictures stores none', () => {
    const engine = openSheet(referenceSheet('wizard10-evoker'));
    expect(diffCharacter(blankSheet(), engine.snapshot()).images).toBeUndefined();
  });

  it("the list entry carries the portrait's small picture, and only that", () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    engine.setImage('portrait', PORTRAIT);
    const meta = describeCharacter(diffCharacter(blankSheet(), engine.snapshot()), NO_ADD_ONS, null);
    expect(meta.portrait).toBe(PORTRAIT.thumb);
    const without = describeCharacter(diffCharacter(blankSheet(), openSheet().snapshot()), NO_ADD_ONS, null);
    expect('portrait' in without).toBe(false);
  });
});

describe('fitting a picture', () => {
  it('scales the long side down to the size, never up', () => {
    expect(fitSize(1308, 1273, PICTURE_SIZE)).toEqual({ width: 640, height: 623 });
    expect(fitSize(750, 889, 160)).toEqual({ width: 135, height: 160 });
    expect(fitSize(100, 50, PICTURE_SIZE)).toEqual({ width: 100, height: 50 });
  });

  it('reads a data URL back into its bytes', async () => {
    const blob = blobOfDataUrl('data:image/png;base64,AQID');
    expect(blob.type).toBe('image/png');
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it('keeps a PNG only for real see-through parts, not for the edges of a scaled photo', () => {
    // RGBA pixels: opaque, then WebKit's 254 at a scaled photo's edge, then half see-through.
    expect(seeThroughPixels(Uint8ClampedArray.from([9, 9, 9, 255, 9, 9, 9, 254]))).toBe(false);
    expect(seeThroughPixels(Uint8ClampedArray.from([9, 9, 9, 255, 9, 9, 9, 128]))).toBe(true);
    expect(seeThroughPixels(Uint8ClampedArray.from([9, 9, 9, 0]))).toBe(true);
  });

  it('shows only JPEG and PNG pictures the app made', () => {
    expect(SAFE_PICTURE.test(PORTRAIT.src)).toBe(true);
    expect(SAFE_PICTURE.test(SYMBOL.src)).toBe(true);
    expect(SAFE_PICTURE.test('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(SAFE_PICTURE.test('https://example.com/a.png')).toBe(false);
  });
});
