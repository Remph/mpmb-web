// Healing potions from the inventory (M17, playtest 3 note 7, Nick 2026-11-14). The group's house rule: drinking as
// an Action heals the potion's full value without a roll; as a Bonus Action the dice are rolled. (The 2024 rules and
// MPMB's item text make drinking a Bonus Action with a roll, so the bonus action is the rules' way and the action
// the table's addition.)
//
// Players type potions into the gear rows by name, 2014 names included ("Greater Potion of Healing"), or pick one
// from MPMB's magic item list ("Potion of Superior Healing"). The rules' table (SRD 5.2.1, Potion of Healing) gives
// each kind its dice.
import { parseFormula } from '../dice/dice.ts';
import type { Formula } from '../dice/dice.ts';
import { applyHealing, maxNow, tickedDeathSaves } from './rules.ts';
import { isOn, numberOf, readHitPoints, valueOf } from './read.ts';
import type { FieldViews } from '../worker/views.ts';

export interface Potion {
  /** The dice it heals: 2d4+2 for a Potion of Healing. */
  formula: Formula;
}

/** The kinds of the rules' table, strongest first, so "Superior" isn't read as the plain potion. */
const KINDS: readonly { words: readonly string[]; formula: string }[] = [
  { words: ['supreme', 'höchst', 'vorzüglich'], formula: '10d4+20' },
  { words: ['superior', 'überlegen'], formula: '8d4+8' },
  { words: ['greater', 'groß', 'gross'], formula: '4d4+4' },
  { words: [], formula: '2d4+2' },
];

/** A healing potion by its name, in English or German ("Heiltrank", "Trank der Heilung"). */
const isHealingPotion = (name: string): boolean =>
  (name.includes('potion') && name.includes('healing')) ||
  name.includes('heiltrank') ||
  (name.includes('trank') && name.includes('heilung'));

/**
 * Dice written into the name win over the table: "Potion of Healing (2d4+2)", MPMB's own "Healing (Common; 2d4+2)",
 * or a homebrew potion with its own dice in brackets.
 */
function diceInBrackets(name: string): Formula | null {
  const inside = name
    .split('(')
    .slice(1)
    .map((part) => part.split(')')[0] ?? '');
  const words = inside.flatMap((part) => part.split(';').map((w) => w.trim()));
  return words.map(parseFormula).find((f) => f !== null) ?? null;
}

/** The potion a gear row or magic item names, or null when it is no healing potion. */
export function potionOf(name: string): Potion | null {
  const plain = name.toLowerCase();
  if (!isHealingPotion(plain)) return null;
  const written = diceInBrackets(plain);
  if (written) return { formula: written };
  const kind = KINDS.find((k) => k.words.length === 0 || k.words.some((w) => plain.includes(w)));
  const formula = parseFormula(kind?.formula ?? '');
  return formula ? { formula } : null;
}

/**
 * The most the dice can give: what drinking as an Action heals. Never below 0: a homebrew "(1d4-5)" written into the
 * name must not take hit points away.
 */
export const fullValue = (formula: Formula): number =>
  Math.max(
    0,
    formula.groups.reduce((sum, g) => sum + g.sign * g.count * g.sides, formula.bonus),
  );

/** The least the dice can give: the low end of "4 to 10". */
export const leastValue = (formula: Formula): number =>
  Math.max(
    0,
    formula.groups.reduce((sum, g) => sum + g.sign * g.count, formula.bonus),
  );

/** A field written back as it was, for Undo. */
export interface HealEdit {
  edit: string;
  text: string;
}

export interface Healing {
  /** Hit points after drinking. */
  current: number;
  /** The fields to write, and to click: death saves start over above 0 hit points. */
  edits: HealEdit[];
  clicks: string[];
  /** What Undo writes and clicks to put it all back (a death save box ticks again on a second click). */
  undo: { edits: HealEdit[]; clicks: string[] };
  /** The "HP Current" field as drinking leaves it: a number, or null for the empty field of full health. */
  after: number | null;
}

/**
 * What healing `amount` hit points writes into the character's fields, the same arithmetic as the Heal window:
 * never above the (lowered) maximum, temporary hit points left alone, an empty field for full health.
 */
export function healing(fields: FieldViews, amount: number): Healing {
  const hp = readHitPoints(fields);
  const top = maxNow(hp);
  const before = hp.current ?? top ?? 0;
  const next = applyHealing(hp, amount);
  const text = next.current === hp.max ? '' : String(next.current);
  const old = valueOf(fields, 'HP Current');
  const changed = text !== old && !(text === '' && hp.current === null);
  const edits = changed ? [{ edit: 'HP Current', text }] : [];
  const clicks = before === 0 && next.current > 0 ? tickedDeathSaves(fields) : [];
  return {
    current: next.current,
    edits,
    clicks,
    undo: { edits: changed ? [{ edit: 'HP Current', text: old }] : [], clicks },
    after: changed ? (text === '' ? null : next.current) : hp.current,
  };
}

/** What a drink left on the sheet: the hit points, the row's count, and the death save boxes it unticked. */
export interface AfterDrink {
  hp: number | null;
  count: { field: string; left: number } | null;
  unticked: string[];
}

/**
 * Whether the sheet is still as the drink left it. Undo writes the old values back, so after anything else
 * changed them (damage, a second potion, a rest, the count stepped by hand) it would wipe that change out too.
 */
export const unchangedSince = (fields: FieldViews, after: AfterDrink): boolean =>
  numberOf(fields, 'HP Current') === after.hp &&
  (after.count === null || numberOf(fields, after.count.field) === after.count.left) &&
  after.unticked.every((box) => !isOn(fields, box));
