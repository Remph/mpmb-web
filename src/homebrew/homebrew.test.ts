import { describe, expect, test } from 'vitest';
import { parseSwitches } from './switches.svelte.ts';
import { DEFAULT_ULT, MAX_CHARGES, readUlt, withCharges, withMax } from './ult.ts';

describe('ult charges', () => {
  const ult = { name: 'Oathbound Judgement', max: 30, charges: 18 };

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
    expect(readUlt({ name: 'Rage', max: 25, charges: 99 })).toEqual({ name: 'Rage', max: 25, charges: 25 });
    expect(readUlt(ult)).toEqual(ult);
  });
});

describe('homebrew switches', () => {
  test('everything is off until turned on; unknown or broken storage is ignored', () => {
    const off = { ultCharges: false, noAmmo: false };
    expect(parseSwitches(null)).toEqual(off);
    expect(parseSwitches('not json')).toEqual(off);
    expect(parseSwitches('{"ultCharges":"yes","other":true}')).toEqual(off);
    // A browser that stored only the first switch (before "no ammunition counting" came) keeps it.
    expect(parseSwitches('{"ultCharges":true}')).toEqual({ ...off, ultCharges: true });
    expect(parseSwitches('{"noAmmo":true}')).toEqual({ ...off, noAmmo: true });
  });
});
