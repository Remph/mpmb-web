import { describe, expect, it } from 'vitest';
import {
  bonusOf,
  critical,
  formulaText,
  modeOf,
  natural,
  parseFormula,
  randomInt,
  rollD20,
  rollFormula,
} from './dice.ts';
import type { RandomSource, RollMode } from './dice.ts';

/** A random source that hands out the given numbers in order. */
const fixed = (values: readonly number[]): RandomSource => {
  const queue = [...values];
  return () => queue.shift() ?? 1;
};

const D6 = 6;
const DRAWS = 2000;
const ALL_SIX = [1, 2, 3, 4, 5, 6];
const NOT_AN_INTEGER = 1.5;

/** Mode, the dice thrown, which one counts and its value. */
const D20_CASES: readonly { mode: RollMode; dice: number[]; kept: number; result: number }[] = [
  { mode: 'normal', dice: [12], kept: 0, result: 12 },
  { mode: 'advantage', dice: [7, 15], kept: 1, result: 15 },
  { mode: 'disadvantage', dice: [7, 15], kept: 0, result: 7 },
  { mode: 'doubleAdvantage', dice: [4, 18, 11], kept: 1, result: 18 },
  { mode: 'doubleDisadvantage', dice: [4, 18, 2], kept: 2, result: 2 },
  // A tie keeps the first die.
  { mode: 'advantage', dice: [9, 9], kept: 0, result: 9 },
];

const NATURAL_CASES: readonly { mode: RollMode; dice: number[]; natural: 'nat20' | 'nat1' | null }[] = [
  { mode: 'normal', dice: [20], natural: 'nat20' },
  { mode: 'advantage', dice: [1, 12], natural: null },
  { mode: 'disadvantage', dice: [1, 12], natural: 'nat1' },
  { mode: 'disadvantage', dice: [20, 20], natural: 'nat20' },
];

const BONUS_CASES: readonly [string, number | null][] = [
  ['+8', 8],
  ['0', 0],
  ['-1', -1],
  ['−2', -2],
  [' +13 ', 13],
  ['DC 14', null],
  ['', null],
  ['+', null],
  ['1d4', null],
];

/** What MPMB writes, and how the app writes it back after reading it. */
const FORMULA_CASES: readonly [string, string][] = [
  ['1d10+4', '1d10+4'],
  ['2d8 + 4', '2d8+4'],
  ['2d10', '2d10'],
  ['1d4-1', '1d4-1'],
  ['d8+1d6+3', '1d8+1d6+3'],
  ['1D6+2', '1d6+2'],
  ['1d8-1d4-1', '1d8-1d4-1'],
];
const NOT_FORMULAS = ['', 'Special', '4', '1d', '1d6d6', '1000d6', '1d6 fire'];

const CRITICAL = { formula: '1d10+4', doubled: '2d10+4' };
/** Dice in throwing order and the total they make. */
const ROLL_CASES: readonly { formula: string; dice: number[]; groups: number[][]; total: number }[] = [
  { formula: '1d10+4', dice: [9], groups: [[9]], total: 13 },
  { formula: '2d6-1d4+1', dice: [3, 5, 2], groups: [[3, 5], [2]], total: 7 },
];

describe('randomInt', () => {
  it('stays within 1 and max and reaches both ends', () => {
    const seen = new Set(Array.from({ length: DRAWS }, () => randomInt(D6)));
    expect([...seen].sort()).toEqual(ALL_SIX);
  });

  it('refuses a die without sides', () => {
    expect(() => randomInt(0)).toThrow(RangeError);
    expect(() => randomInt(NOT_AN_INTEGER)).toThrow(RangeError);
  });
});

describe('rollD20', () => {
  it.each(D20_CASES)('$mode with $dice keeps die $kept', ({ mode, dice, kept, result }) => {
    expect(rollD20(mode, fixed(dice))).toEqual({ mode, rolls: dice, keptIndex: kept, result });
  });

  it.each(NATURAL_CASES)('$mode with $dice is $natural', ({ mode, dice, natural: expected }) => {
    expect(natural(rollD20(mode, fixed(dice)))).toBe(expected);
  });
});

describe('modeOf', () => {
  it('reads the mark on the sheet', () => {
    expect(modeOf('')).toBe('normal');
    expect(modeOf('', true)).toBe('normal');
    expect(modeOf('adv')).toBe('advantage');
    expect(modeOf('dis', true)).toBe('doubleDisadvantage');
  });
});

describe('bonusOf', () => {
  it.each(BONUS_CASES)('reads %j as %j', (text, bonus) => {
    expect(bonusOf(text)).toBe(bonus);
  });
});

describe('parseFormula', () => {
  it.each(FORMULA_CASES)('reads %j and writes it as %j', (text, written) => {
    const formula = parseFormula(text);
    expect(formula && formulaText(formula)).toBe(written);
  });

  it.each(NOT_FORMULAS)('is null for %j', (text) => {
    expect(parseFormula(text)).toBeNull();
  });

  it('doubles the dice and not the bonus for a critical hit', () => {
    const formula = parseFormula(CRITICAL.formula);
    expect(formula && formulaText(critical(formula))).toBe(CRITICAL.doubled);
  });
});

describe('rollFormula', () => {
  it.each(ROLL_CASES)('$formula with $dice is $total', ({ formula, dice, groups, total }) => {
    const parsed = parseFormula(formula);
    const rolled = parsed && rollFormula(parsed, fixed(dice));
    expect(rolled?.rolls.map((r) => r.dice)).toEqual(groups);
    expect(rolled?.total).toBe(total);
  });
});
