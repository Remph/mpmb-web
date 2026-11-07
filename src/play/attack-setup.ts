// Proficiency and ability per attack row: the PDF's two boxes in front of each attack ("PROF" and
// "ABILITY"). MPMB fills both when a weapon goes into the row, and the player may change them, as in
// Acrobat (a magic weapon MPMB doesn't know, a feature that lets a character use another ability, a ruling
// at the table). MPMB then works out to hit, DC and damage from them.
//
// MPMB sets the proficiency box again from its own rules each time it recalculates the weapons (a level,
// a feat, new training), and a forced recalculation (a feature whose attack changes with the level) sets
// the ability again too. Acrobat loses a hand-set box the same way; the app remembers what the player set
// and puts it back after such a recalculation, as long as the row still holds the same weapon.
import type { Step } from '../session.svelte.ts';
import type { FieldViews } from '../worker/views.ts';
import { ABILITIES, isOn, valueOf } from './read.ts';

export type AttackAbility = (typeof ABILITIES)[number];

export const profField = (row: number): string => `Attack.${row}.Proficiency`;
export const modField = (row: number): string => `Attack.${row}.Mod`;
const weaponOf = (fields: FieldViews, row: number): string => valueOf(fields, `Attack.${row}.Weapon Selection`);

/** MPMB's "Mod" drop-down: "Int Mod" (shown as "Int"), or "empty" (shown blank) for no ability. */
const NO_ABILITY = 'empty';
const modValue = (ability: AttackAbility | ''): string => (ability ? `${ability} Mod` : NO_ABILITY);

export interface AttackSetup {
  proficient: boolean;
  /** The ability the attack uses; '' for none (a spell's save DC without one, a typed row). */
  ability: AttackAbility | '';
}

export function readSetup(fields: FieldViews, row: number): AttackSetup {
  const value = valueOf(fields, modField(row));
  const mod = value.endsWith(' Mod') ? value.slice(0, -' Mod'.length) : value;
  return {
    proficient: isOn(fields, profField(row)),
    ability: ABILITIES.includes(mod as AttackAbility) ? (mod as AttackAbility) : '',
  };
}

/** What the player set by hand in a row, kept with the character (app only, never in the PDF). */
export interface SetupChoice {
  row: number;
  /** The weapon in the row then: a new weapon gets MPMB's own settings again. */
  weapon: string;
  proficient?: boolean;
  ability?: AttackAbility | '';
}

/** The steps that set a row's boxes; nothing for what already holds the wanted value. */
export function setupSteps(fields: FieldViews, row: number, wanted: Partial<AttackSetup>): Step[] {
  const now = readSetup(fields, row);
  const steps: Step[] = [];
  // A check box: a click switches it (the session knows the value it then holds).
  if (wanted.proficient !== undefined && wanted.proficient !== now.proficient) steps.push({ click: profField(row) });
  if (wanted.ability !== undefined && wanted.ability !== now.ability)
    steps.push({ edit: modField(row), text: modValue(wanted.ability) });
  return steps;
}

/**
 * The player's choices with one more: it replaces an earlier one for the same row and weapon (merged, so
 * setting the ability keeps a proficiency set before), and choices for weapons no longer in their row go.
 */
export function withChoice(
  fields: FieldViews,
  choices: SetupChoice[],
  row: number,
  set: Partial<AttackSetup>,
): SetupChoice[] {
  const weapon = weaponOf(fields, row);
  const current = choices.filter((c) => weaponOf(fields, c.row) === c.weapon);
  const old = current.find((c) => c.row === row);
  const next: SetupChoice = { ...old, row, weapon };
  if (set.proficient !== undefined) next.proficient = set.proficient;
  if (set.ability !== undefined) next.ability = set.ability;
  return [...current.filter((c) => c.row !== row), next].sort((a, b) => a.row - b.row);
}

/**
 * After a change: the boxes MPMB set again by itself (they changed while the weapon stayed) get the
 * player's choice back. Fields in `own` were set by the change itself (the window, an effect switching on
 * or off), so they stay as they are.
 */
export function keepChoices(before: FieldViews, after: FieldViews, choices: SetupChoice[], own: Set<string>): Step[] {
  return choices.flatMap((choice) => {
    const { row, weapon } = choice;
    if (weaponOf(before, row) !== weapon || weaponOf(after, row) !== weapon) return [];
    const was = readSetup(before, row);
    const now = readSetup(after, row);
    const wanted: Partial<AttackSetup> = {};
    if (choice.proficient !== undefined && !own.has(profField(row)) && was.proficient !== now.proficient)
      wanted.proficient = choice.proficient;
    if (choice.ability !== undefined && !own.has(modField(row)) && was.ability !== now.ability)
      wanted.ability = choice.ability;
    return setupSteps(after, row, wanted);
  });
}

/** Whatever a stored or restored entry holds, made into valid choices (old or hand-edited backups). */
export function readChoices(value: unknown): SetupChoice[] {
  if (!Array.isArray(value)) return [];
  const MAX_ROWS = 24;
  const MAX_TEXT = 200;
  const seen = new Set<number>();
  return value.flatMap((v: unknown): SetupChoice[] => {
    if (typeof v !== 'object' || v === null) return [];
    const { row, weapon, proficient, ability } = v as Record<string, unknown>;
    if (typeof row !== 'number' || !Number.isInteger(row) || row < 1 || row > MAX_ROWS || seen.has(row)) return [];
    if (typeof weapon !== 'string' || weapon === '') return [];
    seen.add(row);
    const choice: SetupChoice = { row, weapon: weapon.slice(0, MAX_TEXT) };
    if (typeof proficient === 'boolean') choice.proficient = proficient;
    if (ability === '' || ABILITIES.includes(ability as AttackAbility)) choice.ability = ability as AttackAbility | '';
    return [choice];
  });
}
