// The PDF's two ammunition counters on page 1 ("AmmoLeft", "AmmoRight"). MPMB fills them itself when a
// class, background or weapon brings ammunition (AddAmmo), and keeps its count in the Display fields:
// Name (a list of MPMB's ammunition), Amount (how many the character has) and SaveAmount (the amount
// at the last refill, typed amount or change of ammunition; ticking a box in Acrobat leaves it alone).
// The play view counts with Amount and uses SaveAmount as "at the start of the fight", so it can say
// how many were used and give some back afterwards, the way the 2024 rules recover ammunition.
import type { Step } from '../session.svelte.ts';
import type { FieldViews } from '../worker/views.ts';
import { choicesOf, numberOf, valueOf } from './read.ts';

export const AMMO_SIDES = ['Left', 'Right'] as const;
export type AmmoSide = (typeof AMMO_SIDES)[number];

export interface Ammo {
  side: AmmoSide;
  name: string;
  amount: number;
  /** How many were used since the last refill (never below 0: a + above it raises the start). */
  used: number;
  /** The amount at the last refill, as MPMB keeps it. */
  start: number;
}

const field = (side: AmmoSide, part: string): string => `Ammo${side}Display.${part}`;

/** The counters that hold ammunition, left first. */
export function readAmmo(fields: FieldViews): Ammo[] {
  return AMMO_SIDES.map((side) => {
    const amount = numberOf(fields, field(side, 'Amount')) ?? 0;
    const start = numberOf(fields, field(side, 'SaveAmount')) ?? amount;
    return { side, name: valueOf(fields, field(side, 'Name')), amount, start, used: Math.max(0, start - amount) };
  }).filter((ammo) => ammo.name !== '');
}

/** The first counter without ammunition, where a new one goes; null when both are in use. */
export function freeAmmoSide(fields: FieldViews): AmmoSide | null {
  return AMMO_SIDES.filter((side) => valueOf(fields, field(side, 'Name')) === '')[0] ?? null;
}

/** MPMB's ammunition list (the Name field's entries), as names. */
export const ammoChoices = (fields: FieldViews): string[] =>
  choicesOf(fields, field('Left', 'Name')).map(([value]) => value);

/**
 * Sets the count. Typing the amount in Acrobat makes MPMB take it as the new start (LoadAmmo); a tap on
 * − or + is like ticking a box, so the start is written back unless the count went above it.
 */
export function countSteps(ammo: Ammo, amount: number, newStart = false): Step[] {
  const next = Math.max(0, Math.round(amount));
  const steps: Step[] = [{ edit: field(ammo.side, 'Amount'), text: String(next) }];
  const start = newStart ? next : Math.max(ammo.start, next);
  if (start !== next) steps.push({ edit: field(ammo.side, 'SaveAmount'), text: String(start) });
  return steps;
}

/** After the fight: `back` of the used ones come back and the count is the new start. */
export const collectSteps = (ammo: Ammo, back: number): Step[] =>
  countSteps(ammo, ammo.amount + Math.min(back, ammo.used), true);

/** Half of the used ammunition, rounded down: what the 2024 rules give back after a fight. */
export const half = (used: number): number => Math.floor(used / 2);

/** Picks the ammunition of a counter from MPMB's list (ApplyAmmo); '' takes it off (ResetAmmo). */
export const pickSteps = (side: AmmoSide, name: string): Step[] => [{ edit: field(side, 'Name'), text: name }];
