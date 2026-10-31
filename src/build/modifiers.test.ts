import { describe, expect, test } from 'vitest';
import { FF } from '../engine/types.ts';
import type { FieldView, FieldViews } from '../worker/views.ts';
import { ALL_SAVES, INITIATIVE, isSet, saveDcs, setCount } from './modifiers.ts';

const view = (value: string, flags = 0): FieldView => ({ type: 'Tx', value, flags, widgets: [], style: {} });

describe('the blue fields', () => {
  test('MPMB empties them to "" or "0"; anything else counts as set', () => {
    const fields: FieldViews = { 'Init Bonus': view('0'), 'All ST Bonus': view('Cha') };
    expect(isSet(fields, INITIATIVE)).toBe(false);
    expect(isSet(fields, ALL_SAVES)).toBe(true);
    expect(setCount(fields)).toBe(1);
  });

  test('the save DCs that have an ability, and the ones linked to the spell sheet', () => {
    const fields: FieldViews = {
      'Spell DC 1 Mod': view('Cha Mod'),
      'Spell DC 1 Bonus': view('0', FF.readonly),
      'Spell DC 2 Mod': view(' '),
      'Spell DC 2 Bonus': view('0'),
    };
    expect(saveDcs(fields)).toEqual([
      {
        modifier: { field: 'Spell DC 1 Bonus', result: 'Spell save DC 1', name: '' },
        ability: 'Cha',
        linked: true,
      },
    ]);
  });
});
