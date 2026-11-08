import { describe, expect, test } from 'vitest';
import {
  backgroundBonusOf,
  backgroundColumn,
  backgroundDone,
  bonusOf,
  canLower,
  canRaise,
  changesOf,
  freeCanPick,
  freeColumnFor,
  freeDone,
  freeModeOf,
  methodOf,
  modifierOf,
  pickArray,
  pointCost,
  pointsUsed,
  stepBonus,
  tapBackground,
  tapFreeOne,
  toArray,
  toPoints,
  totalsOf,
} from './abilities.ts';
import type { ScoreColumn } from '../engine/scores.ts';

// The reference paladin/warlock's columns (test/origins.test.ts reads the same from MPMB).
const reference = (): ScoreColumn[] => [
  { type: 'base', name: 'Score Base', scores: [14, 9, 15, 8, 9, 15] },
  { type: 'background', name: 'Backgr-\nound', scores: [0, 0, 0, 0, 1, 2] },
  { type: 'feats', name: 'Feat Bonus', scores: [0, 0, 1, 0, 0, 1] },
  { type: 'levels', name: 'ASIs from Classes', scores: [0, 0, 0, 0, 0, 0] },
  { type: 'items', name: 'Magic Items', scores: [0, 0, 0, 0, 0, 0] },
  { type: 'ongoing', name: 'Items up to Max X¹', scores: [0, 0, 0, 0, 0, 0] },
  { type: 'override', name: 'Magical Override²', scores: [0, 0, 0, 19, 0, 0] },
  { type: 'maximum', name: 'Max Total²', scores: [20, 20, 20, 20, 20, 20] },
];

describe('base scores', () => {
  test('point costs as the 2024 rules have them', () => {
    expect([8, 9, 10, 11, 12, 13, 14, 15].map(pointCost)).toEqual([0, 1, 2, 3, 4, 5, 7, 9]);
    expect(pointCost(16)).toBeNull();
    expect(pointsUsed([14, 9, 15, 8, 9, 15])).toBe(27);
  });

  test('how scores look made', () => {
    expect(methodOf([8, 15, 13, 14, 10, 12])).toBe('array');
    expect(methodOf([14, 9, 15, 8, 9, 15])).toBe('points');
    expect(methodOf([15, 15, 15, 8, 8, 8])).toBe('points'); // 3 × 9 = 27 points
    expect(methodOf([16, 8, 8, 8, 8, 8])).toBe('typed');
  });

  test('the standard array keeps the order the scores had, and picking swaps', () => {
    // Dexterity and Wisdom tie at 9: Dexterity, listed first, gets the 12.
    expect(toArray([14, 9, 15, 8, 9, 15])).toEqual([13, 12, 15, 8, 10, 14]);
    expect(pickArray([15, 14, 13, 12, 10, 8], 5, 15)).toEqual([8, 14, 13, 12, 10, 15]);
  });

  test('point buy stays within 8 to 15 and 27 points', () => {
    expect(toPoints([18, 3, 12, 12, 12, 12])).toEqual([15, 8, 12, 12, 12, 12]);
    expect(canRaise([14, 9, 15, 8, 9, 15], 3)).toBe(false); // all 27 points spent
    expect(canRaise([8, 8, 8, 8, 8, 8], 0)).toBe(true);
    expect(canRaise([15, 8, 8, 8, 8, 8], 0)).toBe(false);
  });
});

describe('background +2/+1', () => {
  const acolyte = [3, 4, 5];
  test('reads +2 and +1, or +1 to all three', () => {
    expect(backgroundBonusOf([0, 0, 0, 0, 1, 2], acolyte)).toEqual({ plus2: 5, plus1: 4, allThree: false });
    expect(backgroundBonusOf([0, 0, 0, 1, 1, 1], acolyte)).toEqual({ plus2: null, plus1: null, allThree: true });
    expect(backgroundDone(backgroundBonusOf([0, 0, 0, 0, 0, 2], acolyte))).toBe(false);
  });

  test('taps move the bonus, and a second tap gives it back', () => {
    const start = backgroundBonusOf([0, 0, 0, 0, 1, 2], acolyte);
    // +2 to Wisdom, which had the +1: the +1 is free again.
    expect(backgroundColumn(tapBackground(start, 4, 2), acolyte)).toEqual([0, 0, 0, 0, 2, 0]);
    expect(backgroundColumn(tapBackground(start, 5, 2), acolyte)).toEqual([0, 0, 0, 0, 1, 0]);
    expect(backgroundColumn(tapBackground(start, 3, 1), acolyte)).toEqual([0, 0, 0, 1, 0, 2]);
    const all = { plus2: null, plus1: null, allThree: true };
    expect(backgroundColumn(all, acolyte)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(backgroundColumn(tapBackground(all, 3, 2), acolyte)).toEqual([0, 0, 0, 2, 0, 0]);
  });
});

describe('house rule: background boosts anywhere', () => {
  const all = [0, 1, 2, 3, 4, 5];
  test('+2 and +1 go to abilities the background does not name', () => {
    // Acolyte names Int, Wis and Cha; the house rule puts +2 on Strength and +1 on Constitution.
    const start = backgroundBonusOf([0, 0, 0, 0, 0, 0], all);
    const step1 = tapBackground(start, 0, 2);
    expect(backgroundColumn(tapBackground(step1, 2, 1), all)).toEqual([2, 0, 1, 0, 0, 0]);
    expect(freeDone([2, 0, 1, 0, 0, 0])).toBe(true);
    expect(freeDone([2, 0, 0, 0, 0, 0])).toBe(false);
  });

  test('the mode the column shows', () => {
    expect(freeModeOf([2, 0, 1, 0, 0, 0])).toBe('split');
    expect(freeModeOf([1, 0, 1, 0, 0, 1])).toBe('three');
    expect(freeModeOf([1, 1, 0, 0, 0, 0])).toBe('three');
    expect(freeModeOf([0, 0, 1, 0, 0, 0])).toBeNull();
    expect(freeModeOf([0, 0, 0, 0, 0, 0])).toBeNull();
  });

  test('three +1s on any abilities, never a fourth, and a second tap gives one back', () => {
    const column = [0, 2, 5].reduce((col, ability) => tapFreeOne(col, ability), [0, 0, 0, 0, 0, 0]);
    expect(column).toEqual([1, 0, 1, 0, 0, 1]);
    expect(freeDone(column)).toBe(true);
    expect(freeCanPick(column, 1)).toBe(false);
    expect(tapFreeOne(column, 1)).toEqual([1, 0, 1, 0, 0, 1]);
    expect(tapFreeOne(column, 2)).toEqual([1, 0, 0, 0, 0, 1]);
    expect(freeDone([1, 0, 0, 0, 0, 1])).toBe(false);
  });

  test('changing the mode keeps the picked abilities as +1s, or starts the split empty', () => {
    expect(freeColumnFor([2, 0, 1, 0, 0, 0], 'three')).toEqual([1, 0, 1, 0, 0, 0]);
    expect(freeColumnFor([1, 0, 1, 0, 0, 1], 'split')).toEqual([0, 0, 0, 0, 0, 0]);
  });

  test('a column typed in MPMB’s dialog that the rules don’t allow is not done', () => {
    expect(freeDone([3, 0, 0, 0, 0, 0])).toBe(false);
    expect(freeDone([2, 2, 0, 0, 0, 0])).toBe(false);
    expect(freeDone([1, 1, 1, 1, 0, 0])).toBe(false);
  });
});

describe('feats & level-ups and the totals', () => {
  test('the totals as MPMB adds them up, with the headband’s 19', () => {
    expect(totalsOf(reference(), [0, 0, 0, 0, 0, 0])).toEqual([14, 9, 16, 19, 10, 18]);
    expect(bonusOf(reference())).toEqual([0, 0, 1, 0, 0, 1]);
  });

  test('+ writes the feats column, − takes from feats, then class levels, never below 0', () => {
    const up = stepBonus(reference(), 0, 1);
    expect(up.filter((c) => c.type === 'feats')[0]?.scores).toEqual([1, 0, 1, 0, 0, 1]);
    const withLevels = reference().map((c) => (c.type === 'levels' ? { ...c, scores: [0, 2, 0, 0, 0, 0] } : c));
    expect(stepBonus(withLevels, 1, -1).filter((c) => c.type === 'levels')[0]?.scores).toEqual([0, 1, 0, 0, 0, 0]);
    expect(stepBonus(reference(), 0, -1)).toEqual(reference());
  });

  test('− only where the feats or class levels column has something to take', () => {
    // A level 20 barbarian: Primal Champion's +4 Strength sits in MPMB's class features column.
    const barbarian = [...reference(), { type: 'classes', name: 'Class Features', scores: [4, 0, 0, 0, 0, 0] }];
    expect(bonusOf(barbarian)[0]).toBe(4);
    expect(canLower(barbarian, 0)).toBe(false);
    expect(canLower(barbarian, 2)).toBe(true);
    expect(canLower(stepBonus(barbarian, 0, 1), 0)).toBe(true);
  });

  test('only changed columns go to MPMB', () => {
    expect(changesOf(reference(), stepBonus(reference(), 0, 1))).toEqual([{ column: 2, scores: [1, 0, 1, 0, 0, 1] }]);
    expect(modifierOf(9)).toBe(-1);
    expect(modifierOf(18)).toBe(4);
  });
});
