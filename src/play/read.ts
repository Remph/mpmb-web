// What the play view shows, read from the sheet's fields (the views the worker sends). The play view
// draws its own layout but keeps every value in MPMB's fields, so the rules stay MPMB's and a
// character still saves, backs up and opens like before. Field names are those of the Colorful A4 sheet.
import { DISPLAY, displayFromFlags } from '../engine/types.ts';
import type { FieldViews } from '../worker/views.ts';

/** The text a field shows: its Format text ("+4", "d10") or its value. */
export function shown(fields: FieldViews, name: string): string {
  const view = fields[name];
  if (!view) return '';
  const text = view.text ?? view.value;
  return Array.isArray(text) ? text.join(', ') : text;
}

/** The stored value as text (Format texts aside), trimmed: MPMB clears some fields to a space. */
export function valueOf(fields: FieldViews, name: string): string {
  const value = fields[name]?.value ?? '';
  return (Array.isArray(value) ? value.join(', ') : value).trim();
}

/** A number in a field, or null when it is empty or not a number. */
export function numberOf(fields: FieldViews, name: string): number | null {
  const text = valueOf(fields, name);
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** Whether a check box is ticked: off is "Off" (or empty before anything was stored). */
export function isOn(fields: FieldViews, name: string): boolean {
  const value = valueOf(fields, name);
  return value !== '' && value !== 'Off';
}

/** Whether the sheet shows the field (MPMB hides optional rows, such as a second spell save DC). */
export function isShown(fields: FieldViews, name: string): boolean {
  const widget = fields[name]?.widgets[0];
  if (!widget) return false;
  const display = displayFromFlags(widget.flags);
  return display === DISPLAY.visible || display === DISPLAY.noPrint;
}

/**
 * The row numbers of a numbered field, in order: rows(fields, 'Attack.', '.Weapon Selection') finds
 * "Attack.1.Weapon Selection", "Attack.2.Weapon Selection" and so on.
 */
function rows(fields: FieldViews, before: string, after = ''): number[] {
  return (
    Object.keys(fields)
      .filter((key) => key.startsWith(before) && key.endsWith(after))
      .map((key) => key.slice(before.length, key.length - after.length))
      // Only a plain row number: "12" passes, "Used 1" (from "Limited Feature Used 1") does not.
      // Try it: https://regex101.com/?regex=%5E%5Cd%2B%24&testString=12
      .filter((middle) => /^\d+$/.test(middle))
      .map(Number)
      .sort((a, b) => a - b)
  );
}

/** The sheet's rows for hit dice (HD1 to HD3) and its three death save boxes of each kind. */
const HIT_DICE_ROWS = [1, 2, 3];
const DEATH_SAVE_BOXES = [1, 2, 3];
/** Spell levels 1 to 9. */
const SPELL_LEVELS = Array.from({ length: 9 }, (_, i) => i + 1);

export interface HitDice {
  /** The field row: HD1, HD2, HD3. */
  row: number;
  /** "d10" */
  die: string;
  total: number;
  used: number;
}

export interface HitPoints {
  /** Empty on the sheet means not hurt yet: the view shows the maximum then. */
  current: number | null;
  max: number | null;
  temp: number | null;
  hitDice: HitDice[];
  deathSaves: { successes: number; failures: number };
}

export function readHitPoints(fields: FieldViews): HitPoints {
  const hitDice = HIT_DICE_ROWS.map((row) => ({
    row,
    die: shown(fields, `HD${row} Die`),
    total: numberOf(fields, `HD${row} Level`) ?? 0,
    used: numberOf(fields, `HD${row} Used`) ?? 0,
  })).filter((hd) => hd.total > 0);
  const ticked = (kind: string): number =>
    DEATH_SAVE_BOXES.filter((n) => isOn(fields, `Death Save ${kind}${n}`)).length;
  return {
    current: numberOf(fields, 'HP Current'),
    max: numberOf(fields, 'HP Max'),
    temp: numberOf(fields, 'HP Temp'),
    hitDice,
    deathSaves: { successes: ticked('Success'), failures: ticked('Fail') },
  };
}

/** The small numbers next to the hit points, as the sheet shows them. Empty ones are left out. */
export interface Numbers {
  armorClass: string;
  initiative: string;
  speed: string;
  proficiency: string;
  /** One per spellcasting ability the sheet shows (MPMB has room for two). */
  spellSaveDcs: string[];
  passivePerception: string;
}

export function readNumbers(fields: FieldViews): Numbers {
  return {
    armorClass: shown(fields, 'AC'),
    initiative: shown(fields, 'Initiative bonus'),
    speed: shown(fields, 'Speed'),
    proficiency: shown(fields, 'Proficiency Bonus'),
    spellSaveDcs: ['Spell save DC 1', 'Spell save DC 2']
      .filter((name) => isShown(fields, name) && valueOf(fields, name) !== '')
      .map((name) => shown(fields, name)),
    passivePerception: shown(fields, 'Passive Perception'),
  };
}

export const ABILITIES = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'] as const;
/** MPMB's optional seventh score (Honor or Sanity); it counts only while the sheet shows it. */
export const OPTIONAL_ABILITY = 'HoS';
export type AbilityKey = (typeof ABILITIES)[number] | typeof OPTIONAL_ABILITY;

export interface Advantage {
  advantage: boolean;
  disadvantage: boolean;
}

export interface Ability extends Advantage {
  key: AbilityKey;
  score: string;
  modifier: string;
  save: string;
  saveProficient: boolean;
}

export function readAbilities(fields: FieldViews): Ability[] {
  const keys: AbilityKey[] = [...ABILITIES];
  if (isShown(fields, OPTIONAL_ABILITY)) keys.push(OPTIONAL_ABILITY);
  return keys.map((key) => ({
    key,
    score: shown(fields, key),
    modifier: shown(fields, `${key} Mod`),
    save: shown(fields, `${key} ST Mod`),
    saveProficient: isOn(fields, `${key} ST Prof`),
    advantage: isOn(fields, `${key} ST Adv`),
    disadvantage: isOn(fields, `${key} ST Dis`),
  }));
}

/** The 18 skills by MPMB's field key, alphabetical by English name, with their SRD ability. */
export const SKILLS = [
  ['Acr', 'Dex'],
  ['Ani', 'Wis'],
  ['Arc', 'Int'],
  ['Ath', 'Str'],
  ['Dec', 'Cha'],
  ['His', 'Int'],
  ['Ins', 'Wis'],
  ['Inti', 'Cha'],
  ['Inv', 'Int'],
  ['Med', 'Wis'],
  ['Nat', 'Int'],
  ['Perc', 'Wis'],
  ['Perf', 'Cha'],
  ['Pers', 'Cha'],
  ['Rel', 'Int'],
  ['Sle', 'Dex'],
  ['Ste', 'Dex'],
  ['Sur', 'Wis'],
] as const;
export type SkillKey = (typeof SKILLS)[number][0];

export interface Skill extends Advantage {
  key: SkillKey;
  ability: (typeof ABILITIES)[number];
  bonus: string;
  proficient: boolean;
  expertise: boolean;
}

export function readSkills(fields: FieldViews): Skill[] {
  return SKILLS.map(([key, ability]) => ({
    key,
    ability,
    bonus: shown(fields, key),
    proficient: isOn(fields, `${key} Prof`),
    expertise: isOn(fields, `${key} Exp`),
    advantage: isOn(fields, `${key} Adv`),
    disadvantage: isOn(fields, `${key} Dis`),
  }));
}

/** The tool line under the skills ("Calligrapher's Supplies"), if the player filled it in. */
export function readTool(fields: FieldViews): { name: string; bonus: string } | null {
  const name = valueOf(fields, 'Too Text');
  return name ? { name, bonus: shown(fields, 'Too') } : null;
}

export interface Attack {
  row: number;
  name: string;
  /** "+8", or a save DC that MPMB writes in the same box. */
  toHit: string;
  damage: string;
  damageType: string;
  range: string;
  description: string;
}

export function readAttacks(fields: FieldViews): Attack[] {
  return rows(fields, 'Attack.', '.Weapon Selection')
    .map((row) => ({
      row,
      name: valueOf(fields, `Attack.${row}.Weapon Selection`),
      toHit: shown(fields, `Attack.${row}.To Hit`).trim(),
      damage: shown(fields, `Attack.${row}.Damage`).trim(),
      damageType: valueOf(fields, `Attack.${row}.Damage Type`),
      range: valueOf(fields, `Attack.${row}.Range`),
      description: valueOf(fields, `Attack.${row}.Description`),
    }))
    .filter((attack) => attack.name !== '');
}

/** Attacks per Attack action ("2"), empty when the sheet has none. */
export const attacksPerAction = (fields: FieldViews): string => valueOf(fields, 'Attacks per Action');

export interface Actions {
  action: string[];
  bonusAction: string[];
  reaction: string[];
}

export function readActions(fields: FieldViews): Actions {
  const list = (label: string): string[] =>
    rows(fields, `${label} `)
      .map((n) => valueOf(fields, `${label} ${n}`))
      .filter(Boolean);
  return { action: list('Action'), bonusAction: list('Bonus Action'), reaction: list('Reaction') };
}

export interface LimitedFeature {
  row: number;
  name: string;
  /** As MPMB wrote it: "2", or "40 HP" for a pool. */
  maxText: string;
  /** The number in it, or null when there is none ("Wis mod" before MPMB worked it out). */
  max: number | null;
  /** True for a pool (Lay on Hands' 40 HP): the view counts points, not dots. */
  pool: boolean;
  recovery: string;
  used: number;
}

/** Above this many uses a feature is counted, not drawn as dots (a row of 50 dots helps nobody). */
export const MAX_DOTS = 8;

export function readLimitedFeatures(fields: FieldViews): LimitedFeature[] {
  return rows(fields, 'Limited Feature ')
    .map((row) => {
      const maxText = valueOf(fields, `Limited Feature Max Usages ${row}`);
      // The first whole number: "40 HP" gives 40, "2" gives 2, "Wis mod" gives none.
      // Try it: https://regex101.com/?regex=%5Cd%2B&testString=40%20HP
      const match = /\d+/.exec(maxText);
      const max = match ? Number(match[0]) : null;
      return {
        row,
        name: valueOf(fields, `Limited Feature ${row}`),
        maxText,
        max,
        // A pool has a unit or is too big for dots: "40 HP" or "50" is a pool, "2" is not.
        // Try it: https://regex101.com/?regex=%5CD&testString=40%20HP
        pool: max !== null && (max > MAX_DOTS || /\D/.test(maxText)),
        recovery: valueOf(fields, `Limited Feature Recovery ${row}`),
        used: numberOf(fields, `Limited Feature Used ${row}`) ?? 0,
      };
    })
    .filter((feature) => feature.name !== '');
}

export interface SpellSlotLevel {
  level: number;
  total: number;
}

/** Spell slots per level as MPMB counted them (multiclass and Pact Magic included). */
export function readSpellSlots(fields: FieldViews): SpellSlotLevel[] {
  return SPELL_LEVELS.map((level) => ({
    level,
    total: numberOf(fields, `SpellSlots.CheckboxesSet.lvl${level}`) ?? 0,
  })).filter((slots) => slots.total > 0);
}

/** The 2024 conditions the sheet has a box for, by field name after "Condition.". */
export const CONDITIONS = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Surprised',
  'Unconscious',
] as const;
export type Condition = (typeof CONDITIONS)[number];

export interface Conditions {
  active: Condition[];
  exhaustion: number;
}

export function readConditions(fields: FieldViews): Conditions {
  return {
    active: CONDITIONS.filter((c) => isOn(fields, `Condition.${c}`)),
    exhaustion: numberOf(fields, 'Condition.Exhaustion') ?? 0,
  };
}
