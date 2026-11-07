import { describe, expect, test } from 'vitest';
import { parseSwitches } from './switches.svelte.ts';
import { DEFAULT_ULT, MAX_CHARGES, MAX_TEXT, readUlt, ultLines, withCharges, withMax } from './ult.ts';
import type { UltCharges } from './ult.ts';

describe('ult charges', () => {
  const ult: UltCharges = { name: 'Oathbound Judgement', max: 30, charges: 18, kind: 'none', text: '' };

  test('charges stay between 0 and the maximum', () => {
    expect(withCharges(ult, 19).charges).toBe(19);
    expect(withCharges(ult, 31).charges).toBe(30);
    expect(withCharges(ult, -1).charges).toBe(0);
  });

  test('a lower maximum cuts the charges down to it; the maximum is 1 to 99', () => {
    expect(withMax(ult, 10)).toEqual({ ...ult, max: 10, charges: 10 });
    expect(withMax(ult, 40)).toEqual({ ...ult, max: 40 });
    expect(withMax(ult, 0).max).toBe(1);
    expect(withMax(ult, 500).max).toBe(MAX_CHARGES);
  });

  test('a missing or broken entry (old or hand-edited backup) becomes a valid one', () => {
    expect(readUlt(undefined)).toEqual(DEFAULT_ULT);
    expect(readUlt({ name: 7, max: 'x', charges: Infinity })).toEqual(DEFAULT_ULT);
    expect(readUlt({ name: 'Rage', max: 25, charges: 99 })).toEqual({
      ...DEFAULT_ULT,
      name: 'Rage',
      max: 25,
      charges: 25,
    });
    expect(readUlt(ult)).toEqual(ult);
  });

  test('where it shows and its text: entries from before stay off the Actions card', () => {
    expect(readUlt({ name: 'Rage', max: 25, charges: 3 })).toMatchObject({ kind: 'none', text: '' });
    expect(readUlt({ ...ult, kind: 'bonus', text: 'Roar.' })).toMatchObject({ kind: 'bonus', text: 'Roar.' });
    expect(readUlt({ ...ult, kind: 'free', text: 42 })).toMatchObject({ kind: 'none', text: '' });
    expect(readUlt({ ...ult, text: 'x'.repeat(MAX_TEXT + 10) }).text).toHaveLength(MAX_TEXT);
  });

  test('the text becomes one paragraph per typed line, blank lines dropped', () => {
    const text = 'As an action, you shout.\r\n\n  • Each enemy takes 2d6 Thunder damage.  \n\nCharges: +1 per turn.';
    expect(ultLines({ ...ult, text })).toEqual([
      'As an action, you shout.',
      '• Each enemy takes 2d6 Thunder damage.',
      'Charges: +1 per turn.',
    ]);
    expect(ultLines(ult)).toEqual([]);
  });
});

describe('homebrew switches', () => {
  test('everything is off until turned on; unknown or broken storage is ignored', () => {
    const off = { ultCharges: false, noAmmo: false, shortRestHalfHp: false };
    expect(parseSwitches(null)).toEqual(off);
    expect(parseSwitches('not json')).toEqual(off);
    expect(parseSwitches('{"ultCharges":"yes","other":true}')).toEqual(off);
    // A browser that stored only the first switch (before "no ammunition counting" came) keeps it.
    expect(parseSwitches('{"ultCharges":true}')).toEqual({ ...off, ultCharges: true });
    expect(parseSwitches('{"noAmmo":true}')).toEqual({ ...off, noAmmo: true });
  });
});
