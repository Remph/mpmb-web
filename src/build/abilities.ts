// The Build screen's ability scores (M6): the ways of making the base scores (the 2024 rules' standard
// array and point buy, or typed in), the background's +2/+1, the feats & level-ups column, and the
// totals as MPMB adds them up. Pure, so the page can show a change at once; MPMB gets the columns
// through its own Ability Scores dialog (src/engine/scores.ts) and works the real totals out itself.
import type { ScoreChange, ScoreColumn, ScoresInfo } from '../engine/scores.ts';

/** Strength … Charisma. */
export const ABILITY_COUNT = 6;
/** The 2024 rules' standard array, highest first. */
export const STANDARD_ARRAY: readonly number[] = '15 14 13 12 10 8'.split(' ').map(Number);
export const POINT_BUDGET = 27;
export const POINT_MIN = 8;
export const POINT_MAX = 15;
/** From this score on, each point buy step costs two points. */
const POINT_DOUBLE_FROM = 13;
/** What a typed-in score may be (MPMB's own fields take anything; the rules know 1 to 30). */
export const TYPED_MIN = 1;
export const TYPED_MAX = 30;

export type Method = 'array' | 'points' | 'typed';

const sameNumbers = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((n, i) => n === b[i]);

/** The 2024 rules' point cost of a score (8 is free, 15 costs 9), worked out as MPMB's ASCalcPointBuy does. */
export const pointCost = (score: number): number | null =>
  Number.isInteger(score) && score >= POINT_MIN && score <= POINT_MAX
    ? score - POINT_MIN + Math.max(0, score - POINT_DOUBLE_FROM)
    : null;

/** The points the base scores cost; null when one of them can't be bought. */
export function pointsUsed(base: number[]): number | null {
  const costs = base.map(pointCost);
  return costs.some((c) => c === null) ? null : costs.reduce<number>((sum, c) => sum + (c ?? 0), 0);
}

/** How the base scores look made: the standard array, point buy, or typed in. */
export function methodOf(base: number[]): Method {
  if (
    sameNumbers(
      [...base].sort((a, b) => b - a),
      STANDARD_ARRAY,
    )
  )
    return 'array';
  const used = pointsUsed(base);
  return used !== null && used <= POINT_BUDGET ? 'points' : 'typed';
}

/** Order of the abilities by score, highest first; equal scores keep their order (Strength first). */
const byScore = (base: number[]): number[] =>
  base
    .map((score, i) => ({ score, i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ i }) => i);

/** The standard array laid onto the scores as they rank now: the highest gets 15, and so on. */
export function toArray(base: number[]): number[] {
  if (methodOf(base) === 'array') return [...base];
  const next = [...base];
  byScore(base).forEach((ability, rank) => {
    next[ability] = STANDARD_ARRAY[rank] ?? POINT_MIN;
  });
  return next;
}

/** One ability takes a value of the array; the ability that had it gets the old value (a swap). */
export function pickArray(base: number[], ability: number, value: number): number[] {
  const next = [...base];
  const holder = base.indexOf(value);
  if (holder !== -1 && holder !== ability) next[holder] = base[ability] ?? POINT_MIN;
  next[ability] = value;
  return next;
}

/** The scores within what point buy can make (8 to 15); the budget is checked separately. */
export const toPoints = (base: number[]): number[] =>
  base.map((score) => Math.max(POINT_MIN, Math.min(POINT_MAX, score)));

/** Whether point buy lets this ability go one up (within 15 and the 27 points). */
export function canRaise(base: number[], ability: number): boolean {
  const score = base[ability] ?? POINT_MIN;
  if (score >= POINT_MAX) return false;
  const used = pointsUsed(base);
  const step = (pointCost(score + 1) ?? 0) - (pointCost(score) ?? 0);
  return used !== null && used + step <= POINT_BUDGET;
}

export const withScore = (scores: number[], ability: number, value: number): number[] =>
  scores.map((score, i) => (i === ability ? value : score));

export const clampTyped = (value: number): number => Math.max(TYPED_MIN, Math.min(TYPED_MAX, Math.round(value)));

/**
 * The background's increase as the 2024 rules give it: +2 to one ability and +1 to another, or +1 to
 * all three, always among the three abilities the background names.
 */
export interface BackgroundBonus {
  plus2: number | null;
  plus1: number | null;
  allThree: boolean;
}

const PLUS_TWO = 2;
/** A background names three abilities; "+1 to all three" goes to each. */
const BACKGROUND_ABILITIES = 3;

/** The choice that the background column holds. */
export function backgroundBonusOf(column: number[], allowed: number[]): BackgroundBonus {
  const ones = column.map((n, i) => (n === 1 ? i : -1)).filter((i) => i !== -1);
  const allThree =
    allowed.length === BACKGROUND_ABILITIES &&
    allowed.every((i) => column[i] === 1) &&
    ones.length === BACKGROUND_ABILITIES &&
    !column.includes(PLUS_TWO);
  if (allThree) return { plus2: null, plus1: null, allThree };
  const plus2 = column.indexOf(PLUS_TWO);
  return { plus2: plus2 === -1 ? null : plus2, plus1: ones[0] ?? null, allThree: false };
}

/** The background column for a choice. */
export function backgroundColumn(bonus: BackgroundBonus, allowed: number[]): number[] {
  return Array.from({ length: ABILITY_COUNT }, (_, i) => {
    if (bonus.allThree) return allowed.includes(i) ? 1 : 0;
    if (i === bonus.plus2) return PLUS_TWO;
    return i === bonus.plus1 ? 1 : 0;
  });
}

/** A tap on an ability's +2 or +1: it takes that bonus (or gives it back when it had it). */
export function tapBackground(bonus: BackgroundBonus, ability: number, amount: 1 | 2): BackgroundBonus {
  if (amount === PLUS_TWO) {
    const plus2 = bonus.plus2 === ability ? null : ability;
    return { plus2, plus1: bonus.allThree || bonus.plus1 === ability ? null : bonus.plus1, allThree: false };
  }
  const plus1 = bonus.plus1 === ability && !bonus.allThree ? null : ability;
  return { plus2: bonus.allThree || bonus.plus2 === ability ? null : bonus.plus2, plus1, allThree: false };
}

export const backgroundDone = (bonus: BackgroundBonus): boolean =>
  bonus.allThree || (bonus.plus2 !== null && bonus.plus1 !== null);

/** Columns that are not added like the others: their own column in the table, or magic. */
const OWN_COLUMNS = ['base', 'background', 'items', 'ongoing', 'override', 'maximum'];
/** Where the page's − and + in "Feats & level-ups" write: MPMB's "Feat Bonus" (an ASI is a feat in 2024). */
const BONUS_COLUMN = 'feats';
/** The other column the Feats & level-ups figure takes from when it goes down. */
const LEVELS_COLUMN = 'levels';

const columnOf = (columns: ScoreColumn[], type: string): number[] =>
  columns.filter((c) => c.type === type)[0]?.scores ?? Array.from({ length: ABILITY_COUNT }, () => 0);

/** The Feats & level-ups figure per ability: feats, class levels, species and any extra columns. */
export const bonusOf = (columns: ScoreColumn[]): number[] =>
  Array.from({ length: ABILITY_COUNT }, (_, i) =>
    columns.filter((c) => !OWN_COLUMNS.includes(c.type)).reduce((sum, c) => sum + (c.scores[i] ?? 0), 0),
  );

/** The columns with one ability's Feats & level-ups figure one up or down. */
export function stepBonus(columns: ScoreColumn[], ability: number, delta: 1 | -1): ScoreColumn[] {
  const feats = columnOf(columns, BONUS_COLUMN)[ability] ?? 0;
  const levels = columnOf(columns, LEVELS_COLUMN)[ability] ?? 0;
  // Going down takes from the feats column first, then from the class levels column, never below 0.
  const type = delta > 0 || feats > 0 || levels <= 0 ? BONUS_COLUMN : LEVELS_COLUMN;
  if (delta < 0 && feats <= 0 && levels <= 0) return columns;
  return columns.map((c) =>
    c.type === type ? { ...c, scores: withScore(c.scores, ability, (c.scores[ability] ?? 0) + delta) } : c,
  );
}

/** The columns with one column's numbers replaced (by type). */
export const withColumn = (columns: ScoreColumn[], type: string, scores: number[]): ScoreColumn[] =>
  columns.map((c) => (c.type === type ? { ...c, scores: [...scores] } : c));

/**
 * The totals as MPMB adds them up (getAbilityScoreTotals): base plus bonuses, up to the maximum, then
 * the ongoing item bonuses, and an override (a Headband of Intellect's 19) when that is higher.
 */
const DEFAULT_BASE = 8;
const DEFAULT_MAXIMUM = 20;
// MPMB counts any column whose caption says override as one ("Magical Override²" matches, "Feat Bonus"
// doesn't). Try it: https://regex101.com/?regex=override&flags=i&testString=Magical%20Override%C2%B2
const OVERRIDE_CAPTION = /override/i;

export function totalsOf(columns: ScoreColumn[], ongoing: number[]): number[] {
  return Array.from({ length: ABILITY_COUNT }, (_, i) => {
    let base = DEFAULT_BASE;
    let bonus = 0;
    let maximum = DEFAULT_MAXIMUM;
    let override = 0;
    columns.forEach((c) => {
      const n = c.scores[i] ?? 0;
      if (c.type === 'base') base = n;
      else if (c.type === 'maximum') maximum = n;
      else if (c.type === 'override' || OVERRIDE_CAPTION.test(c.name)) override = Math.max(override, n);
      else if (c.type !== 'ongoing') bonus += n;
    });
    return Math.max(Math.min(base + bonus, maximum) + (ongoing[i] ?? 0), override);
  });
}

/** The modifier of a score: 14 gives +2, 9 gives −1. */
const MODIFIER_ZERO = 10;
const POINTS_PER_MODIFIER = 2;
export const modifierOf = (score: number): number => Math.floor((score - MODIFIER_ZERO) / POINTS_PER_MODIFIER);

/** What to send MPMB: the columns whose numbers changed, by their place. */
export function changesOf(before: ScoresInfo['columns'], after: ScoreColumn[]): ScoreChange[] {
  return after.flatMap((c, column) =>
    sameNumbers(c.scores, before[column]?.scores ?? []) ? [] : [{ column, scores: c.scores }],
  );
}
