// Dice for M14 (tap a number to roll it). Pure functions, no DOM. The fair die and the d20 modes come from the
// hub's dice roller (Remph's own code, remphs-playground site/src/lib/dice.ts), so a roll here follows the same
// rules as one on remph.de: crypto random numbers, no modulo bias, the group's double advantage house rule.
//
// The random source is a parameter, so tests hand in known numbers.

/** A function that returns a random integer from 1 to `max` (inclusive). */
export type RandomSource = (max: number) => number;

/** How many values a Uint32 holds (2 to the 32nd). */
const UINT32_RANGE = 4_294_967_296;

/**
 * A fair random integer from 1 to `max`: crypto.getRandomValues, and values from the top of the range that
 * would make some results likelier (modulo bias) are thrown away and drawn again.
 */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max < 1) throw new RangeError('max must be an integer >= 1');
  const limit = UINT32_RANGE - (UINT32_RANGE % max);
  const draw = (): number => {
    const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    return value >= limit ? draw() : (value % max) + 1;
  };
  return draw();
}

/** `count` dice with `sides` sides each, in throwing order. */
export const rollDice = (sides: number, count: number, random: RandomSource = randomInt): number[] =>
  Array.from({ length: count }, () => random(sides));

// ---- d20 with advantage / disadvantage ----------------------------------------------

export type RollMode = 'normal' | 'advantage' | 'doubleAdvantage' | 'disadvantage' | 'doubleDisadvantage';

const D20 = 20;
const PAIR = 2;
/** The group's house rule: three dice, the highest (or lowest) counts. */
const TRIPLE = 3;
const DICE_PER_MODE: Record<RollMode, number> = {
  normal: 1,
  advantage: PAIR,
  doubleAdvantage: TRIPLE,
  disadvantage: PAIR,
  doubleDisadvantage: TRIPLE,
};

/** The mode a mark on the sheet asks for: "adv" with the double house rule is three dice. */
export function modeOf(edge: '' | 'adv' | 'dis', double = false): RollMode {
  if (edge === 'adv') return double ? 'doubleAdvantage' : 'advantage';
  if (edge === 'dis') return double ? 'doubleDisadvantage' : 'disadvantage';
  return 'normal';
}

export interface D20Roll {
  mode: RollMode;
  /** Every die thrown, in throwing order. */
  rolls: number[];
  /** Index (in `rolls`) of the die that counts. */
  keptIndex: number;
  /** The die that counts. */
  result: number;
}

export function rollD20(mode: RollMode, random: RandomSource = randomInt): D20Roll {
  const rolls = rollDice(D20, DICE_PER_MODE[mode], random);
  const highest = mode === 'advantage' || mode === 'doubleAdvantage';
  const lowest = mode === 'disadvantage' || mode === 'doubleDisadvantage';
  // On a tie the first die wins: the same result, and a stable die to show as kept.
  const keptIndex = rolls.reduce((kept, roll, i) => {
    const better = (highest && roll > (rolls[kept] ?? 0)) || (lowest && roll < (rolls[kept] ?? 0));
    return better ? i : kept;
  }, 0);
  return { mode, rolls, keptIndex, result: rolls[keptIndex] ?? 0 };
}

/** A natural 20 or 1 on the die that counts: the card says so (a 20 on an attack is a critical hit). */
export function natural(roll: D20Roll): 'nat20' | 'nat1' | null {
  if (roll.result === D20) return 'nat20';
  if (roll.result === 1) return 'nat1';
  return null;
}

// ---- the sheet's numbers and damage ----------------------------------------------------

/**
 * The bonus a sheet number adds to a d20: "+8" is 8, "-1" (or MPMB's "−1") is -1, "0" is 0. Anything else
 * ("DC 14", "", "—") is not a bonus: null.
 */
export function bonusOf(text: string): number | null {
  const plain = text.trim().replaceAll('−', '-');
  const sign = plain.startsWith('-') ? -1 : 1;
  const digits = plain.startsWith('+') || plain.startsWith('-') ? plain.slice(1) : plain;
  return isDigits(digits) ? sign * Number(digits) : null;
}

/** "8", "120": only the digits 0 to 9, at least one. */
const isDigits = (text: string): boolean => text !== '' && [...text].every((c) => c >= '0' && c <= '9');

/** One group of dice in a formula: 2d6 is { count: 2, sides: 6, sign: 1 }; "-1d4" has sign -1. */
export interface DiceGroup {
  count: number;
  sides: number;
  sign: 1 | -1;
}

/** What MPMB writes in an attack's Damage field, read: "1d10+4", "2d8 + 4", "1d8+1d6+3", "1d4-1". */
export interface Formula {
  groups: DiceGroup[];
  bonus: number;
}

const MAX_DICE = 100;
const MAX_SIDES = 1000;

/** "1d10+4" -> ["1d10", "+4"]: a new term starts at every plus or minus after the first character. */
const termsOf = (compact: string): string[] =>
  [...compact].reduce<string[]>((terms, c, i) => {
    if (i > 0 && (c === '+' || c === '-')) return [...terms, c];
    const last = terms.length - 1;
    return last < 0 ? [c] : [...terms.slice(0, last), `${terms[last]}${c}`];
  }, []);

type Term = { group: DiceGroup } | { bonus: number } | null;

/** "+2d6" -> 2 six-sided dice; "-1" -> a bonus of -1; "d8" -> one d8; "x" -> null. */
function readTerm(term: string): Term {
  const sign: 1 | -1 = term.startsWith('-') ? -1 : 1;
  const body = term.startsWith('+') || term.startsWith('-') ? term.slice(1) : term;
  if (!body.includes('d')) return isDigits(body) ? { bonus: sign * Number(body) } : null;
  const [countText = '', sidesText = '', ...rest] = body.split('d');
  if (rest.length || !isDigits(sidesText) || (countText !== '' && !isDigits(countText))) return null;
  const count = countText === '' ? 1 : Number(countText);
  const sides = Number(sidesText);
  const fits = count >= 1 && count <= MAX_DICE && sides >= 1 && sides <= MAX_SIDES;
  return fits ? { group: { count, sides, sign } } : null;
}

/**
 * Reads a damage formula, or null when it isn't one (a damage field may say "Special" or "see notes"). Limits
 * keep a typo like "1000d1000" from throwing a million dice.
 */
export function parseFormula(text: string): Formula | null {
  const compact = [...text.toLowerCase().replaceAll('−', '-')].filter((c) => c.trim() !== '').join('');
  if (!compact) return null;
  const read = termsOf(compact).map(readTerm);
  if (read.some((term) => term === null)) return null;
  const groups = read.flatMap((term) => (term && 'group' in term ? [term.group] : []));
  if (!groups.length) return null;
  const bonus = read.reduce((sum, term) => sum + (term && 'bonus' in term ? term.bonus : 0), 0);
  return { groups, bonus };
}

/** A critical hit: every damage die twice, the bonus once (the 2024 rules). */
const CRIT_DICE = 2;
export const critical = (formula: Formula): Formula => ({
  ...formula,
  groups: formula.groups.map((g) => ({ ...g, count: g.count * CRIT_DICE })),
});

/** The formula written out the way the sheet does: "2d10+4", "1d8+1d6-1". */
export function formulaText(formula: Formula): string {
  const signOf = (g: DiceGroup, i: number): string => {
    if (g.sign < 0) return '-';
    return i ? '+' : '';
  };
  const dice = formula.groups.map((g, i) => `${signOf(g, i)}${g.count}d${g.sides}`).join('');
  if (!formula.bonus) return dice;
  return `${dice}${formula.bonus > 0 ? '+' : '-'}${Math.abs(formula.bonus)}`;
}

export interface FormulaRoll {
  formula: Formula;
  /** Each group's dice, in the formula's order. */
  rolls: { group: DiceGroup; dice: number[] }[];
  total: number;
}

export function rollFormula(formula: Formula, random: RandomSource = randomInt): FormulaRoll {
  const rolls = formula.groups.map((group) => ({ group, dice: rollDice(group.sides, group.count, random) }));
  const dice = rolls.reduce((sum, r) => sum + r.group.sign * r.dice.reduce((a, b) => a + b, 0), 0);
  return { formula, rolls, total: dice + formula.bonus };
}

// ---- a spell cast with a higher slot ------------------------------------------------------

/**
 * A formula plus `times` of another, dice of the same size and sign counted together: Fireball's 8d6 with 2 slot
 * levels of 1d6 more is 10d6, not "8d6+1d6+1d6". MPMB writes it "8d6+3+1d6/SL" on the sheet.
 */
export function plus(base: Formula, more: Formula, times: number): Formula {
  if (times <= 0) return base;
  const groups = more.groups.reduce<DiceGroup[]>(
    (all, g) => {
      const same = all.findIndex((a) => a.sides === g.sides && a.sign === g.sign);
      if (same < 0) return [...all, { ...g, count: g.count * times }];
      return all.map((a, i) => (i === same ? { ...a, count: a.count + g.count * times } : a));
    },
    base.groups.map((g) => ({ ...g })),
  );
  return { groups, bonus: base.bonus + more.bonus * times };
}
