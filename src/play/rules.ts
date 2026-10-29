// The play view's own bits of rules: hit point arithmetic and what a rest gives back. MPMB's sheet has
// boxes for these but no buttons, so the PDF leaves them to the player; the app does the counting and
// writes the results into the same fields.
import type { FieldViews } from '../worker/views.ts';
import { isOn, readConditions, readHitPoints, readLimitedFeatures } from './read.ts';
import type { HitPoints } from './read.ts';

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

// Recovery texts MPMB uses for rests: "long rest", "Long Rest", "LR", "short rest", "Short Rest", "SR"
// match; "Dawn", "7 days" and the like are not rests (a long rest leaves them to the player).
// Try it: https://regex101.com/?regex=%5E%28long%20rest%7Cshort%20rest%7Clr%7Csr%29%24&flags=i&testString=Long%20Rest
const LONG_OR_SHORT = /^(long rest|short rest|lr|sr)$/i;
// The short rest ones of those: "short rest" and "SR" match, "long rest" does not.
// Try it: https://regex101.com/?regex=%5E%28short%20rest%7Csr%29%24&flags=i&testString=Short%20Rest
const SHORT = /^(short rest|sr)$/i;
// MPMB notes a partial short rest recovery in the name: "Channel Divinity (regain 1/SR)" matches with 1,
// "Channel Divinity" does not. Try it: https://regex101.com/?regex=regain%20%28%5Cd%2B%29%2FSR&flags=i&testString=Channel%20Divinity%20%28regain%201%2FSR%29
const REGAIN_ON_SHORT = /regain (\d+)\/SR/i;

const DEATH_SAVES = ['Success1', 'Success2', 'Success3', 'Fail1', 'Fail2', 'Fail3'].map((b) => `Death Save ${b}`);

/**
 * A long rest (SRD 5.2.1): all hit points and spent hit dice back, temporary hit points gone, one level
 * of exhaustion less, death saves cleared, and every feature that recovers on a short or long rest.
 */
export function longRest(fields: FieldViews): RestEdits {
  const values: Record<string, string> = { 'HP Current': '', 'HP Temp': '' };
  readHitPoints(fields).hitDice.forEach((hd) => (values[`HD${hd.row} Used`] = ''));
  readLimitedFeatures(fields)
    .filter((f) => f.used > 0 && LONG_OR_SHORT.test(f.recovery))
    .forEach((f) => (values[`Limited Feature Used ${f.row}`] = ''));
  const { exhaustion } = readConditions(fields);
  if (exhaustion > 0) values['Condition.Exhaustion'] = exhaustion > 1 ? String(exhaustion - 1) : '';
  return { values, untick: DEATH_SAVES.filter((name) => isOn(fields, name)) };
}

/**
 * A short rest: features that recover on a short rest come back, and those MPMB marks "regain 1/SR"
 * get that many back. Spending hit dice is the player's choice, so it stays a tap on the dice.
 */
export function shortRest(fields: FieldViews): RestEdits {
  const values: Record<string, string> = {};
  readLimitedFeatures(fields)
    .filter((f) => f.used > 0)
    .forEach((f) => {
      const partial = REGAIN_ON_SHORT.exec(f.name);
      if (SHORT.test(f.recovery)) values[`Limited Feature Used ${f.row}`] = '';
      else if (partial) values[`Limited Feature Used ${f.row}`] = usedText(f.used - Number(partial[1]));
    });
  return { values, untick: [] };
}

/** MPMB leaves "used" empty rather than 0. */
const usedText = (used: number): string => (used > 0 ? String(used) : '');
