import { describe, expect, test } from 'vitest';
import type { ClassInfo } from '../engine/builder.ts';
import {
  addClass,
  classFieldText,
  meetsPrereqs,
  nextLevelXp,
  removeClass,
  setClass,
  parseLevel,
  setLevel,
  setSubclass,
  totalLevel,
} from './classes.ts';

const info = (key: string, name: string, subs: [string, string][] = []): ClassInfo => ({
  key,
  name,
  die: 8,
  source: "SRD'24",
  prereqs: '',
  firstFeatures: [],
  subclasses: subs.map(([k, n]) => ({ key: k, name: n, source: "SRD'24" })),
});
const CATALOG = [
  info('paladin', 'Paladin', [['paladin-devotion', 'Oath of Devotion']]),
  info('warlock', 'Warlock', [['warlock-fiend', 'Fiend Patron']]),
  info('wizard', 'Wizard'),
];
const PALADIN_WARLOCK = [
  { key: 'paladin', subclass: 'paladin-devotion', level: 8 },
  { key: 'warlock', subclass: 'warlock-fiend', level: 2 },
];

describe('the class field text', () => {
  test('is what MPMB’s Class Selection dialog writes', () => {
    expect(classFieldText(PALADIN_WARLOCK, CATALOG)).toBe('Paladin (Oath of Devotion) 8, Warlock (Fiend Patron) 2');
  });

  test('leaves out a missing subclass and rows without a level', () => {
    expect(
      classFieldText(
        [
          { key: 'wizard', subclass: '', level: 3 },
          { key: 'paladin', subclass: '', level: 0 },
        ],
        CATALOG,
      ),
    ).toBe('Wizard 3');
  });
});

describe('changing the rows', () => {
  test('levels stay between 1 and what a total of 20 leaves', () => {
    expect(setLevel(PALADIN_WARLOCK, 0, 9)[0]?.level).toBe(9);
    expect(setLevel(PALADIN_WARLOCK, 0, 25)[0]?.level).toBe(18);
  });

  test('reads a typed level, and nothing that is not a whole number from 1', () => {
    expect(parseLevel(' 8 ')).toBe(8);
    expect(parseLevel('20')).toBe(20);
    expect(parseLevel('')).toBeNull();
    expect(parseLevel('0')).toBeNull();
    expect(parseLevel('8.5')).toBeNull();
    expect(parseLevel('acht')).toBeNull();
    expect(setLevel(PALADIN_WARLOCK, 1, 0)[1]?.level).toBe(1);
  });

  test('a new class starts at level 1, once, and not past level 20', () => {
    expect(addClass(PALADIN_WARLOCK, 'wizard')).toEqual([
      ...PALADIN_WARLOCK,
      { key: 'wizard', subclass: '', level: 1 },
    ]);
    expect(addClass(PALADIN_WARLOCK, 'warlock')).toBe(PALADIN_WARLOCK);
    expect(addClass([{ key: 'paladin', subclass: '', level: 20 }], 'wizard')).toHaveLength(1);
  });

  test('another class drops the subclass; a subclass and a removal change one row', () => {
    expect(setClass(PALADIN_WARLOCK, 1, 'wizard')[1]).toEqual({ key: 'wizard', subclass: '', level: 2 });
    expect(setSubclass(PALADIN_WARLOCK, 0, '')[0]?.subclass).toBe('');
    expect(removeClass(PALADIN_WARLOCK, 0)).toEqual([PALADIN_WARLOCK[1]]);
    expect(totalLevel(PALADIN_WARLOCK)).toBe(10);
  });

  test('the next level’s experience comes from MPMB’s table', () => {
    const table = [0, 300, 900, 2700];
    expect(nextLevelXp(1, table)).toBe(300);
    expect(nextLevelXp(3, table)).toBe(2700);
    expect(nextLevelXp(20, table)).toBeNull();
  });
});

describe('multiclass prerequisites', () => {
  const scores = { Str: 14, Dex: 9, Con: 16, Int: 19, Wis: 10, Cha: 18 };
  test('"and" needs every score, "or" one of them', () => {
    expect(meetsPrereqs('Strength 13 and Charisma 13', scores)).toBe(true);
    expect(meetsPrereqs('Dexterity 13 and Wisdom 13', scores)).toBe(false);
    expect(meetsPrereqs('Strength 13 or Dexterity 13', scores)).toBe(true);
    expect(meetsPrereqs('Dexterity 13 or Wisdom 13', scores)).toBe(false);
  });

  test('text without a score says nothing', () => {
    expect(meetsPrereqs('', scores)).toBeNull();
    expect(meetsPrereqs('Must be a member of the guild', scores)).toBeNull();
  });
});
