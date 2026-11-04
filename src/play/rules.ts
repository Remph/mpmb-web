// The play view's own bits of rules: hit point arithmetic and what a rest gives back. MPMB's sheet has
// boxes for these but no buttons, so the PDF leaves them to the player; the app does the counting and
// writes the results into the same fields.
import type { FieldViews } from '../worker/views.ts';
import { isOn, readConditions, readHitPoints, readLimitedFeatures, readSpellSlotUse, recoveryKind } from './read.ts';
import type { HitPoints } from './read.ts';
import { checkboxField, readSpells } from './spells.ts';
import type { Spell } from './spells.ts';

export interface HpChange {
  current: number;
  temp: number;
}

/** Hit points now: an empty field means not hurt yet. */
const currentOf = (hp: Pick<HitPoints, 'current' | 'max'>): number => hp.current ?? hp.max ?? 0;

/** Damage takes temporary hit points first, then hit points, down to 0 (SRD 5.2.1, Temporary Hit Points). */
export function applyDamage(hp: Pick<HitPoints, 'current' | 'max' | 'temp'>, amount: number): HpChange {
  const temp = hp.temp ?? 0;
  const fromTemp = Math.min(temp, amount);
  return { current: Math.max(0, currentOf(hp) - (amount - fromTemp)), temp: temp - fromTemp };
}

/** Healing never goes above the maximum and leaves temporary hit points alone. */
export function applyHealing(hp: Pick<HitPoints, 'current' | 'max' | 'temp'>, amount: number): HpChange {
  const max = hp.max ?? Infinity;
  return { current: Math.min(max, currentOf(hp) + amount), temp: hp.temp ?? 0 };
}

/** Field edits a rest makes: values to store (empty clears) and check boxes to untick. */
export interface RestEdits {
  values: Record<string, string>;
  untick: string[];
}

// MPMB notes a partial short rest recovery in the name: "Channel Divinity (regain 1/SR)" matches with 1,
// "Channel Divinity" does not. Try it: https://regex101.com/?regex=regain%20%28%5Cd%2B%29%2FSR&flags=i&testString=Channel%20Divinity%20%28regain%201%2FSR%29
const REGAIN_ON_SHORT = /regain (\d+)\/SR/i;

const DEATH_SAVES = ['Success1', 'Success2', 'Success3', 'Fail1', 'Fail2', 'Fail3'].map((b) => `Death Save ${b}`);

/** The ticked death save boxes, to untick: regaining any hit points resets them (SRD 5.2.1, Death Saving Throws). */
export const tickedDeathSaves = (fields: FieldViews): string[] => DEATH_SAVES.filter((name) => isOn(fields, name));

/**
 * A long rest (SRD 5.2.1): all hit points and spent hit dice back, temporary hit points gone, one level
 * of exhaustion less, death saves cleared, all spell slots, every feature that recovers on a short or
 * long rest, and the spells cast once for free (MPMB's once-per-rest boxes; "dawn" counts as a long rest).
 */
export function longRest(fields: FieldViews): RestEdits {
  const values: Record<string, string> = { 'HP Current': '', 'HP Temp': '' };
  readHitPoints(fields).hitDice.forEach((hd) => (values[`HD${hd.row} Used`] = ''));
  readLimitedFeatures(fields)
    // "Dawn", "7 days" and the like are not rests: a long rest leaves them to the player.
    .filter((f) => f.used > 0 && ['long', 'short'].includes(recoveryKind(f.recovery) ?? ''))
    .forEach((f) => (values[`Limited Feature Used ${f.row}`] = ''));
  const { exhaustion } = readConditions(fields);
  if (exhaustion > 0) values['Condition.Exhaustion'] = exhaustion > 1 ? String(exhaustion - 1) : '';
  const slotBoxes = readSpellSlotUse(fields).flatMap((slots) => slots.boxes);
  return {
    values,
    untick: [
      ...tickedDeathSaves(fields),
      ...slotBoxes.filter((name) => isOn(fields, name)),
      ...usedFreeCasts(fields, ['long', 'short', 'day']),
    ],
  };
}

/**
 * The spells whose free cast is used and comes back on this rest, as the check boxes to click: MPMB's own
 * click turns "oncelr_used" back into "oncelr". The same spell can be on the sheet twice (two pages).
 */
function usedFreeCasts(fields: FieldViews, kinds: NonNullable<Spell['mark']['free']>[]): string[] {
  const spells = readSpells(fields).flatMap((source) => source.levels.flatMap((level) => level.spells));
  return spells
    .filter((spell) => spell.mark.freeUsed && spell.mark.free !== null && kinds.includes(spell.mark.free))
    .map(checkboxField);
}

/**
 * A short rest: features and free spell casts that recover on a short rest come back, and features MPMB
 * marks "regain 1/SR" get that many back. Spending hit dice is the player's choice, so it stays a tap on the dice.
 */
export function shortRest(fields: FieldViews): RestEdits {
  const values: Record<string, string> = {};
  readLimitedFeatures(fields)
    .filter((f) => f.used > 0)
    .forEach((f) => {
      const partial = REGAIN_ON_SHORT.exec(f.name);
      if (recoveryKind(f.recovery) === 'short') values[`Limited Feature Used ${f.row}`] = '';
      else if (partial) values[`Limited Feature Used ${f.row}`] = usedText(f.used - Number(partial[1]));
    });
  return { values, untick: usedFreeCasts(fields, ['short']) };
}

/** MPMB leaves "used" empty rather than 0. */
export const usedText = (used: number): string => (used > 0 ? String(used) : '');

/**
 * The slot boxes to click so that the first `used` boxes are ticked and the rest unticked: only those that
 * differ, so boxes ticked out of order in Acrobat end up in the sheet's order.
 */
export const slotClicks = (fields: FieldViews, boxes: string[], used: number): string[] =>
  boxes.filter((box, i) => isOn(fields, box) !== i < used);

/** The dice a magic item rolls at dawn for the charges it gets back: "1d6+1" is 1, 6 and 1. */
export interface RegainDice {
  count: number;
  sides: number;
  bonus: number;
}

/** A feature that comes back at dawn and how: all of it, or what a roll of `dice` says. */
export interface DawnFeature {
  row: number;
  name: string;
  max: number;
  used: number;
  /** Null when everything comes back; MPMB names the roll otherwise: "Wand of Magic Missiles (regains 1d6+1)". */
  dice: RegainDice | null;
}

// MPMB adds the item's daily regain to the feature's name. Try it:
// https://regex101.com/?regex=regains%3F%20%28%5Cd%2B%29d%28%5Cd%2B%29%28%3F%3A%5Cs*%5C%2B%5Cs*%28%5Cd%2B%29%29%3F&flags=i&testString=Wand%20of%20Magic%20Missiles%20%28regains%201d6%20%2B%201%29
const REGAIN_DICE = /regains? (\d+)d(\d+)(?:\s*\+\s*(\d+))?/i;

/**
 * The features that come back "at dawn" (magic items mostly). Not part of a long rest: dawn and a rest
 * often fall together, but not always, so the player says when.
 */
export function dawnFeatures(fields: FieldViews): DawnFeature[] {
  return readLimitedFeatures(fields).flatMap((f) => {
    if (recoveryKind(f.recovery) !== 'dawn' || f.max === null) return [];
    const m = REGAIN_DICE.exec(f.name);
    const dice = m ? { count: Number(m[1]), sides: Number(m[2]), bonus: Number(m[3] ?? 0) } : null;
    return [{ row: f.row, name: f.name, max: f.max, used: f.used, dice }];
  });
}

/** One roll of the dice; `random` gives numbers from 0 to under 1, like Math.random (tests pass their own). */
export function rollRegain(dice: RegainDice, random: () => number = Math.random): number {
  let total = dice.bonus;
  for (let i = 0; i < dice.count; i++) total += 1 + Math.floor(random() * dice.sides);
  return total;
}

/**
 * What dawn gives back: everything, or for a feature with regain dice the amount in `regained` (by row),
 * never more than was used.
 */
export function dawn(fields: FieldViews, regained: Record<number, number>): RestEdits {
  const values: Record<string, string> = {};
  for (const f of dawnFeatures(fields)) {
    if (f.used === 0) continue;
    const back = f.dice ? Math.max(0, regained[f.row] ?? 0) : f.used;
    values[`Limited Feature Used ${f.row}`] = usedText(Math.max(0, f.used - back));
  }
  return { values, untick: [] };
}
