// The play view's own bits of rules: hit point arithmetic and what a rest gives back. MPMB's sheet has
// boxes for these but no buttons, so the PDF leaves them to the player; the app does the counting and
// writes the results into the same fields.
import type { FieldViews } from '../worker/views.ts';
import {
  isOn,
  numberOf,
  readConditions,
  readHitPoints,
  readLimitedFeatures,
  readSpellSlotUse,
  recoveryKind,
  valueOf,
} from './read.ts';
import type { HitPoints } from './read.ts';
import { checkboxField, readSpells } from './spells.ts';
import type { Spell } from './spells.ts';

export interface HpChange {
  current: number;
  temp: number;
  /** The lowered maximum after the change, or null when the maximum is whole. */
  lowered: number | null;
}

/** What the hit point arithmetic needs; companions have no lowered maximum. */
type HpNow = Pick<HitPoints, 'current' | 'max' | 'temp'> & { lowered?: number | null };

/** The most hit points the character can have right now: the lowered maximum while there is one. */
export const maxNow = (hp: Pick<HpNow, 'max' | 'lowered'>): number | null => hp.lowered ?? hp.max;

/** Hit points now: an empty field means not hurt yet. */
const currentOf = (hp: Pick<HpNow, 'current' | 'max' | 'lowered'>): number => hp.current ?? maxNow(hp) ?? 0;

/**
 * Damage takes temporary hit points first, then hit points, down to 0 (SRD 5.2.1, Temporary Hit Points).
 * With `lowersMax` the maximum drops by the damage too, as a Wight's Life Drain does, until a long rest;
 * hit points above the new maximum go with it.
 */
export function applyDamage(hp: HpNow, amount: number, lowersMax = false): HpChange {
  const temp = hp.temp ?? 0;
  const fromTemp = Math.min(temp, amount);
  const current = Math.max(0, currentOf(hp) - (amount - fromTemp));
  const top = maxNow(hp);
  if (!lowersMax || top === null) return { current, temp: temp - fromTemp, lowered: hp.lowered ?? null };
  const lowered = Math.max(0, top - amount);
  return { current: Math.min(current, lowered), temp: temp - fromTemp, lowered };
}

/** Healing never goes above the maximum (a lowered one included) and leaves temporary hit points alone. */
export function applyHealing(hp: HpNow, amount: number): HpChange {
  const top = maxNow(hp) ?? Infinity;
  return { current: Math.min(top, currentOf(hp) + amount), temp: hp.temp ?? 0, lowered: hp.lowered ?? null };
}

/**
 * What a new maximum (a level up or down, Constitution, a feat) does to MPMB's "current maximum" box: it
 * moves by as much as the maximum did. Acrobat leaves the box alone, but the app reads a number there
 * below the maximum as a lowered maximum (Life Drain): a box that only repeated the old maximum, as
 * players often type it, would otherwise show the new levels' hit points as lost, and a real lowered
 * maximum keeps what the attack took off. Empty when nothing needs to change, or when the change
 * itself wrote the box.
 */
export function followMaxHp(before: FieldViews, after: FieldViews): Record<string, string> {
  const [oldMax, newMax] = [numberOf(before, 'HP Max'), numberOf(after, 'HP Max')];
  const box = numberOf(before, 'HP Max Current');
  if (oldMax === null || newMax === null || oldMax === newMax || box === null) return {};
  if (numberOf(after, 'HP Max Current') !== box) return {};
  return { 'HP Max Current': String(Math.max(0, box + newMax - oldMax)) };
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
 * A long rest (SRD 5.2.1): all hit points (a lowered maximum whole again) and spent hit dice back,
 * temporary hit points gone, one level of exhaustion less, death saves cleared, all spell slots, every
 * feature that recovers on a short or long rest, and the spells cast once for free (MPMB's once-per-rest
 * boxes; "dawn" counts as a long rest).
 */
export function longRest(fields: FieldViews): RestEdits {
  const values: Record<string, string> = { 'HP Current': '', 'HP Temp': '' };
  const hp = readHitPoints(fields);
  // A lowered maximum lasts until a long rest (SRD 5.2.1, Wight's Life Drain); a box that only repeats
  // the maximum stays as the player typed it.
  if (hp.lowered !== null) values['HP Max Current'] = '';
  hp.hitDice.forEach((hd) => (values[`HD${hd.row} Used`] = ''));
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

/** Pact Magic slots by warlock level (SRD 5.2.1, Warlock Features table): how many, and their level. */
const PACT_MAGIC: readonly (readonly [number, number])[] = [
  [1, 1],
  [2, 1],
  [2, 2],
  [2, 2],
  [2, 3],
  [2, 3],
  [2, 4],
  [2, 4],
  [2, 5],
  [2, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [4, 5],
  [4, 5],
  [4, 5],
  [4, 5],
];

// "Paladin (Oath of Devotion) 8, Warlock (Fiend Patron) 2": the warlock's level is the number after its name.
// Try it: https://regex101.com/?regex=%5Cbwarlock%5Cb%5B%5E%2C%5Cd%5D*%28%5Cd%2B%29&flags=i&testString=Paladin%20%28Oath%20of%20Devotion%29%208%2C%20Warlock%20%28Fiend%20Patron%29%202
const WARLOCK_LEVEL = /\bwarlock\b[^,\d]*(\d+)/i;

/**
 * The character's Pact Magic slots, read from MPMB's class field; null without warlock levels. A single class
 * can stand there without its level ("Warlock (Undead Patron)"): MPMB then takes the character level.
 */
export function pactSlots(fields: FieldViews): { level: number; count: number } | null {
  const classes = valueOf(fields, 'Class and Levels');
  if (!/\bwarlock\b/i.test(classes)) return null;
  const level = WARLOCK_LEVEL.exec(classes)?.[1] ?? (classes.includes(',') ? '' : valueOf(fields, 'Character Level'));
  const slots = PACT_MAGIC[Math.min(20, Number(level) || 0) - 1];
  return slots ? { count: slots[0], level: slots[1] } : null;
}

/**
 * A short rest: features and free spell casts that recover on a short rest come back, and features MPMB
 * marks "regain 1/SR" get that many back. Spending hit dice is the player's choice, so it stays a tap on the dice.
 *
 * Pact Magic slots come back too. MPMB adds them to the other slots of their level (a paladin 8 / warlock 2
 * has 4 + 2 first-level boxes), so the boxes can't say which used ones were the warlock's: up to that many
 * of the used boxes at the pact level come back, as a player spends pact slots first between short rests.
 *
 * `halfHp` is the house rule switch (Remph, 2026-11-04): half the maximum hit points back, rounded down.
 */
export function shortRest(fields: FieldViews, halfHp = false): RestEdits {
  const values: Record<string, string> = {};
  readLimitedFeatures(fields)
    .filter((f) => f.used > 0)
    .forEach((f) => {
      const partial = REGAIN_ON_SHORT.exec(f.name);
      if (recoveryKind(f.recovery) === 'short') values[`Limited Feature Used ${f.row}`] = '';
      else if (partial) values[`Limited Feature Used ${f.row}`] = usedText(f.used - Number(partial[1]));
    });
  const untick = usedFreeCasts(fields, ['short']);
  const pact = pactSlots(fields);
  const slots = pact && readSpellSlotUse(fields).find((s) => s.level === pact.level);
  if (pact && slots && slots.used > 0)
    untick.push(...slotClicks(fields, slots.boxes, slots.used - Math.min(slots.used, pact.count)));
  if (halfHp) {
    const hp = readHitPoints(fields);
    const healed = applyHealing(hp, Math.floor((hp.max ?? 0) / 2));
    if (healed.current !== (hp.current ?? maxNow(hp))) {
      values['HP Current'] = healed.current === hp.max ? '' : String(healed.current);
      // Back above 0 hit points: the death saves start over.
      if ((hp.current ?? 1) === 0) untick.push(...tickedDeathSaves(fields));
    }
  }
  return { values, untick };
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
