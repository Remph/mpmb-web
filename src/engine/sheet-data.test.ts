import { describe, expect, test } from 'vitest';
import { REFERENCE_CHARACTERS, referenceSheet } from '../../test/characters.ts';
import blankData from './data/colorful-a4.json';
import { applyCharacter, baseFieldOf, diffCharacter, packSheet, unpackSheet } from './sheet-data.ts';
import type { PackedSheet } from './sheet-data.ts';
import { blankSheet } from './sheet.ts';

describe('packed blank sheet', () => {
  test('unpacks and packs back to the same data', () => {
    const packed = blankData as unknown as PackedSheet;
    expect(packSheet(unpackSheet(packed))).toEqual(packed);
  });

  test('is the Colorful A4 sheet v24.2.0', () => {
    const blank = blankSheet();
    expect(blank.info.SheetType).toBe('Colorful - A4');
    expect(blank.info.SheetVersion).toBe('24.2.0');
    expect(Object.keys(blank.templates)).toContain('SSfront');
  });
});

describe('characters as differences from the blank sheet', () => {
  test.each(REFERENCE_CHARACTERS)('%s: diff and apply give the same sheet back', (name) => {
    const sheet = referenceSheet(name);
    const blank = blankSheet();
    expect(applyCharacter(blank, diffCharacter(blank, sheet))).toEqual(sheet);
  });

  test('spawned fields start from their template original', () => {
    const blank = blankSheet();
    const [template, fields] = Object.entries(blank.templates)[0] ?? ['', []];
    const original = fields[0] ?? '';
    expect(baseFieldOf(blank, `P5.${template}.${original}`)).toBe(blank.fields[original]);
    expect(baseFieldOf(blank, `P5.${template}.no such field`)).toBeUndefined();
  });

  test('a changed value is stored as a one-key patch', () => {
    const blank = blankSheet();
    const sheet = applyCharacter(blank, diffCharacter(blank, blank));
    const pcName = sheet.fields['PC Name'];
    if (!pcName) throw new Error('no PC Name field');
    pcName.value = 'Ada';
    expect(diffCharacter(blank, sheet).fields).toEqual({ 'PC Name': { value: 'Ada' } });
  });
});
