/* eslint-disable ts-patterns/no-magic-numbers -- list numbers are the test data */
import { describe, expect, test } from 'vitest';
import { listEntries, selectEntry } from './lists.ts';

describe('dialog lists', () => {
  test('a positive number marks the selected entry', () => {
    expect(listEntries({ Metric: 1, Imperial: -2 })).toEqual([
      { label: 'Metric', selected: true },
      { label: 'Imperial', selected: false },
    ]);
  });

  test('selecting keeps the numbers’ size and flips their sign', () => {
    expect(selectEntry({ Metric: 1, Imperial: -2, Other: 0 }, ['Imperial'])).toEqual({
      Metric: -1,
      Imperial: 2,
      Other: -1,
    });
  });

  test('hierarchical lists: groups hold entries, one entry in the whole tree is selected', () => {
    const value = { 'Core rules': { SRD: 1, Homebrew: -1 }, 'Add-ons': { Ours: -1 } };
    expect(listEntries(value)).toEqual([
      {
        label: 'Core rules',
        selected: false,
        children: [
          { label: 'SRD', selected: true },
          { label: 'Homebrew', selected: false },
        ],
      },
      { label: 'Add-ons', selected: false, children: [{ label: 'Ours', selected: false }] },
    ]);
    expect(selectEntry(value, ['Add-ons', 'Ours'])).toEqual({
      'Core rules': { SRD: -1, Homebrew: -1 },
      'Add-ons': { Ours: 1 },
    });
  });

  test('anything that is not a list gives no entries', () => {
    expect(listEntries('')).toEqual([]);
    expect(listEntries(null)).toEqual([]);
    expect(selectEntry(undefined, ['x'])).toEqual({});
  });
});
