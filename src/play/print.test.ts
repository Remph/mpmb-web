// The print layout's parts and pencil marks, on the reference characters and a blank sheet.
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { viewsOf } from '../worker/views.ts';
import { PRINT_PARTS, marks, poolLeft, printableParts } from './print.ts';

describe('print parts', () => {
  it('offers every part for the paladin, who has spells and a notes page with the oath', () => {
    expect(printableParts(viewsOf(openSheet(referenceSheet('paladin8-warlock2')).doc))).toEqual([...PRINT_PARTS]);
  });

  it('leaves spells and notes out of a blank sheet', () => {
    expect(printableParts(viewsOf(openSheet().doc))).toEqual(['main', 'features', 'inventory', 'profile']);
  });
});

describe('pencil marks', () => {
  it('fills the used ones, or none when printed blank', () => {
    expect(marks(3, 2, false)).toEqual([true, true, false]);
    expect(marks(3, 2, true)).toEqual([false, false, false]);
  });

  it('draws nothing for a broken count', () => {
    expect(marks(-1, 0, false)).toEqual([]);
    expect(marks(Number.NaN, 0, false)).toEqual([]);
  });

  it('shows what is left of a pool unless blank', () => {
    expect(poolLeft(40, 15, false)).toBe('25');
    expect(poolLeft(40, 15, true)).toBe('');
    expect(poolLeft(null, 0, false)).toBe('');
    expect(poolLeft(5, 9, false)).toBe('0');
  });
});
