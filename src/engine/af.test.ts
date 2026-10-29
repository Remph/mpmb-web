/* eslint-disable ts-patterns/no-magic-numbers -- numbers and format indexes are the test data */
import { describe, expect, test } from 'vitest';
import {
  AFDate_Format,
  AFDate_FormatEx,
  AFDate_KeystrokeEx,
  AFNumber_Format,
  AFNumber_Keystroke,
  AFRange_Validate,
  parseNumber,
} from './af.ts';

describe('numbers', () => {
  test('parseNumber reads a dot or a comma as the decimal point, like Acrobat', () => {
    expect(parseNumber('2.5')).toBe(2.5);
    expect(parseNumber('2,5')).toBe(2.5);
    expect(parseNumber(' -1234.5 ')).toBe(-1234.5);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });

  test('AFNumber_Format in the comma styles reads the stored value with its decimal point', () => {
    // MPMB's format1 formats "2.5" first in sepStyle 1, then in the player's comma style.
    expect(AFNumber_Format({ value: '2.5' }, 2, 2)).toEqual({ value: '2,50' });
    expect(AFNumber_Format({ value: '1234.5' }, 1, 2)).toEqual({ value: '1.234,5' });
    expect(AFNumber_Format({ value: '1234.5' }, 1, 3)).toEqual({ value: '1234,5' });
  });

  test('AFNumber_Format writes the number, empties blank text and leaves other text alone', () => {
    expect(AFNumber_Format({ value: '1234.567' }, 2, 0)).toEqual({ value: '1,234.57' });
    expect(AFNumber_Format({ value: '  ' }, 0, 0)).toEqual({ value: '' });
    expect(AFNumber_Format({ value: 'abc' }, 0, 0)).toEqual({});
  });

  test('AFNumber_Keystroke lets digits through while typing and checks the whole value on commit', () => {
    expect(AFNumber_Keystroke({ value: '12', change: '3', selStart: 2, selEnd: 2 }).rc).toBe(true);
    expect(AFNumber_Keystroke({ value: '12', change: 'a', selStart: 2, selEnd: 2 }).rc).toBe(false);
    expect(AFNumber_Keystroke({ value: '', change: '-', selStart: 0, selEnd: 0 }).rc).toBe(true);
    expect(AFNumber_Keystroke({ value: '1.5', willCommit: true })).toEqual({});
    expect(AFNumber_Keystroke({ value: '1x', willCommit: true })).toMatchObject({ rc: false });
  });

  test('AFRange_Validate rejects values out of range with Acrobat message', () => {
    expect(AFRange_Validate({ value: '5' }, true, 0, true, 10)).toEqual({});
    expect(AFRange_Validate({ value: '' }, true, 0, true, 10)).toEqual({});
    expect(AFRange_Validate({ value: '11' }, true, 0, true, 10)).toEqual({
      rc: false,
      alert: 'The value entered must be greater than or equal to 0 and less than or equal to 10.',
    });
  });
});

describe('dates', () => {
  test('AFDate_FormatEx rewrites a date into the format', () => {
    expect(AFDate_FormatEx({ value: '2026-10-29' }, 'dd mmm yyyy')).toEqual({ value: '29 Oct 2026' });
    expect(AFDate_FormatEx({ value: '' }, 'dd mmm yyyy')).toEqual({});
  });

  test('AFDate_Format uses Acrobat numbered formats', () => {
    expect(AFDate_Format({ value: '26-10-29' }, 7)).toEqual({ value: '26-10-29' });
  });

  test('AFDate_KeystrokeEx rejects dates that do not exist on commit', () => {
    expect(AFDate_KeystrokeEx({ value: '2026-10-29', willCommit: true }, 'yyyy-mm-dd')).toEqual({});
    expect(AFDate_KeystrokeEx({ value: 'not a date', willCommit: true }, 'yyyy-mm-dd')).toMatchObject({ rc: false });
    expect(AFDate_KeystrokeEx({ value: 'typing', willCommit: false }, 'yyyy-mm-dd')).toEqual({});
  });
});
