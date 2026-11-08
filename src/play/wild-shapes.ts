// The sheet's Wild Shape pages: MPMB's template "WSfront", four forms a page. The player picks a beast in a
// form's name box ("Wildshape.Race.1") or from the page's "Wild Shape Options" menu, and MPMB fills the form's
// numbers from its creature list and the druid's own scores (ApplyWildshape). Like companion pages, every page's
// fields carry a prefix ("P6.WSfront."), MPMB lists the prefixes in "Template.extras.WSfront" (first entry
// empty), and the number in a prefix is where the page was first made, so the list counts, never the number.
import type { Companion } from './companions.ts';
import { ABILITIES, choicesOf, isOn, shown, SKILLS, valueOf } from './read.ts';
import type { LimitedFeature, SkillKey } from './read.ts';
import type { FieldViews } from '../worker/views.ts';

const WILD_SHAPE_PAGES_FIELD = 'Template.extras.WSfront';
/** A page holds four forms, numbered from 1. */
export const FORMS_PER_PAGE = 4;
/** A form has two attack rows. */
const ATTACK_ROWS = [1, 2] as const;
/** What an empty name box says: MPMB's drop-down starts with it. */
const NO_FORM = 'make a selection';

/** The page's menu button ("Wild Shape Options"): MPMB's menu answers like "add#Wolf#wolf". */
export const WILD_SHAPE_MENU = 'Wildshapes.Settings';

/** How MPMB marks a form's skill ("Text.Wildshape.1.Skills.Arc.Prof"). */
export type SkillMark = 'nothing' | 'proficient' | 'expertise';

export interface FormAttack {
  row: number;
  name: string;
  toHit: string;
  damage: string;
  damageType: string;
  range: string;
  description: string;
}

export interface WildShapeForm {
  /** The page's prefix and the form's place on it (1 to 4): together they name the form's fields. */
  prefix: string;
  slot: number;
  /** The beast, as typed or picked ("Wolf"). */
  name: string;
  challenge: string;
  creatureType: string;
  /** The size's name ("Medium"); MPMB stores a number for it. */
  size: string;
  armorClass: string;
  initiative: string;
  speed: string;
  proficiency: string;
  passivePerception: string;
  abilities: {
    key: (typeof ABILITIES)[number];
    score: string;
    modifier: string;
    save: string;
    saveProficient: boolean;
  }[];
  skills: { key: SkillKey; bonus: string; mark: SkillMark }[];
  attacks: FormAttack[];
  /** MPMB's text: one trait a line, each name between "##" marks ("##Pack Tactics##. Advantage on…"). */
  traits: string;
}

/** What the Wild Shape feature allows, as MPMB writes it at the top of every page. */
export interface WildShapeRules {
  knownForms: string;
  limitations: string;
  duration: string;
  tempHp: string;
}

/** A form's field names, by its page's prefix and its place on the page. */
export const formFields = (prefix: string, slot: number) => ({
  name: `${prefix}Wildshape.Race.${slot}`,
  field: (name: string) => `${prefix}Wildshape.${slot}.${name}`,
  skillMark: (key: SkillKey) => `${prefix}Text.Wildshape.${slot}.Skills.${key}.Prof`,
});

/** The prefixes of the Wild Shape pages that exist, in MPMB's order. */
export function wildShapePrefixes(fields: FieldViews): string[] {
  return valueOf(fields, WILD_SHAPE_PAGES_FIELD)
    .split(',')
    .filter((prefix) => prefix !== '' && formFields(prefix, 1).name in fields);
}

const hasForm = (name: string): boolean => name.trim() !== '' && name.trim().toLowerCase() !== NO_FORM;

function readForm(fields: FieldViews, prefix: string, slot: number): WildShapeForm {
  const { name, field, skillMark } = formFields(prefix, slot);
  const sizeValue = valueOf(fields, field('Size'));
  // "Medium" and "Small" share the value 1 in MPMB's list, so the first name with that value is the one to show.
  const size = choicesOf(fields, field('Size')).find(([value]) => value === sizeValue)?.[1] ?? '';
  return {
    prefix,
    slot,
    name: valueOf(fields, name).trim(),
    challenge: valueOf(fields, field('CR')),
    creatureType: valueOf(fields, field('MonsterType')),
    size,
    armorClass: shown(fields, field('AC')).trim(),
    initiative: shown(fields, field('Initiative Bonus')).trim(),
    speed: valueOf(fields, field('Speed')),
    proficiency: shown(fields, field('Proficiency Bonus')).trim(),
    passivePerception: shown(fields, field('Skills.PassPerc')).trim(),
    abilities: ABILITIES.map((key) => ({
      key,
      score: shown(fields, field(`Ability.${key}.Score`)).trim(),
      modifier: shown(fields, field(`Ability.${key}.Mod`)).trim(),
      save: shown(fields, field(`Ability.${key}.ST.Mod`)).trim(),
      saveProficient: isOn(fields, field(`Ability.${key}.ST.Prof`)),
    })),
    skills: SKILLS.map(([key]) => {
      const mark = valueOf(fields, skillMark(key));
      return {
        key,
        bonus: shown(fields, field(`Skills.${key}`)).trim(),
        mark: mark === 'proficient' || mark === 'expertise' ? mark : 'nothing',
      };
    }),
    attacks: ATTACK_ROWS.map((row) => ({
      row,
      name: valueOf(fields, field(`Attack.${row}.Weapon`)),
      toHit: shown(fields, field(`Attack.${row}.To Hit`)).trim(),
      damage: shown(fields, field(`Attack.${row}.Damage`)).trim(),
      // An empty damage type is a single space in MPMB's list.
      damageType: valueOf(fields, field(`Attack.${row}.Damage Type`)).trim(),
      range: valueOf(fields, field(`Attack.${row}.Range`)),
      description: valueOf(fields, field(`Attack.${row}.Description`)),
    })).filter((attack) => attack.name !== ''),
    traits: valueOf(fields, field('Traits')),
  };
}

/** Every form on the Wild Shape pages, page by page, skipping empty places. */
export function readWildShapes(fields: FieldViews): WildShapeForm[] {
  return wildShapePrefixes(fields).flatMap((prefix) =>
    Array.from({ length: FORMS_PER_PAGE }, (_, i) => i + 1)
      .filter((slot) => hasForm(valueOf(fields, formFields(prefix, slot).name)))
      .map((slot) => readForm(fields, prefix, slot)),
  );
}

/**
 * The feature's rules (Temp HP, duration, known forms, limits). MPMB writes them into the template's own
 * "Wildshapes.Info.*" boxes when the class feature comes in, and every page only shows those, so they are there
 * before the first page is: the "+ Form" window can keep to the limits from the first beast on. null when all
 * are empty (no Wild Shape feature).
 */
export function readWildShapeRules(fields: FieldViews): WildShapeRules | null {
  const info = (name: string): string => valueOf(fields, `Wildshapes.Info.${name}`).trim();
  const rules = {
    knownForms: info('KnownForms'),
    limitations: info('Limitations'),
    duration: info('Duration'),
    tempHp: info('TempHP'),
  };
  return Object.values(rules).some(Boolean) ? rules : null;
}

/** A form's key in the app: its page and place, stable while the form stays where it is. */
export const formKey = (form: Pick<WildShapeForm, 'prefix' | 'slot'>): string => `${form.prefix}${form.slot}`;

// ---- The play view's side: forms in the companion bar (Remph picked A, 2026-11-08) ----

/**
 * MPMB's menu on the page's button: "add#<name>#<key>" adds a beast to the first free place (and a new page
 * when every place is taken). With no page yet, the first one comes from MPMB's "Set Pages Layout" menu, like
 * the first companion page.
 */
export const addFormAnswer = (beast: Pick<Beast, 'name' | 'key'>): string => `add#${beast.name}#${beast.key}`;

/**
 * Removing a form empties its name box, as a player does on the PDF: MPMB's ApplyWildshape then resets the
 * form's numbers. (The menu's "Remove Wild Shape" also re-sorts every page, which would move the form the
 * character is in to another place.)
 */
export const removeFormStep = (form: Pick<WildShapeForm, 'prefix' | 'slot'>): { edit: string; text: string } => ({
  edit: formFields(form.prefix, form.slot).name,
  text: '',
});
export const formMenu = (prefix: string): string => `${prefix}${WILD_SHAPE_MENU}`;
export const ADD_FIRST_WILD_SHAPE_PAGE = 'template#WSfront#add';

/** A beast MPMB's "Add Wild Shape" menu offers (read in the worker, see WILD_SHAPE_OPTIONS_SCRIPT). */
export interface Beast {
  /** MPMB's key in CreatureList ("wolf"). */
  key: string;
  /** The name the entry offers; a creature with alternative names has an entry for each. */
  name: string;
  /** "1/4" as MPMB writes it, and as a number to sort and compare. */
  challenge: string;
  challengeValue: number;
  speed: string;
  /** Not a beast but offered all the same (an add-on's forceWildshapeOption): the menu's group name. */
  group: string;
}

/** The druid's limits, read from MPMB's line ("max CR 1/4, no Fly Speed", "CR 1 or lower"). */
export interface FormLimits {
  /** The highest challenge rating, or null when the line names none. */
  maxChallenge: number | null;
  noFly: boolean;
  /** How many forms the druid knows ("8 Beast"), or null. */
  known: number | null;
}

/** "1/4" -> 0.25, "2" -> 2; NaN for anything else. */
export function challengeValue(cr: string): number {
  // Try it: https://regex101.com/?regex=%5E%5Cs*(%5Cd%2B)(%3F%3A%5Cs*%2F%5Cs*(%5Cd%2B))%3F%5Cs*%24&testString=1%2F4
  const match = /^\s*(\d+)(?:\s*\/\s*(\d+))?\s*$/.exec(cr);
  if (!match) return NaN;
  return match[2] ? Number(match[1]) / Number(match[2]) : Number(match[1]);
}

export function formLimits(rules: WildShapeRules | null): FormLimits {
  const limitations = rules?.limitations ?? '';
  // The number after "CR": "max CR 1/4, no Fly Speed" gives 1/4, "CR 1 or lower" gives 1.
  // Try it: https://regex101.com/?regex=CR%5Cs*(%5Cd%2B(%3F%3A%5Cs*%2F%5Cs*%5Cd%2B)%3F)&flags=i&testString=max%20CR%201%2F4%2C%20no%20Fly%20Speed
  const cr = /CR\s*(\d+(?:\s*\/\s*\d+)?)/i.exec(limitations)?.[1];
  const known = /\d+/.exec(rules?.knownForms ?? '')?.[0];
  return {
    maxChallenge: cr === undefined ? null : challengeValue(cr),
    noFly: /no fly/i.test(limitations),
    known: known === undefined ? null : Number(known),
  };
}

/** Whether a beast is within the druid's limits; anything the limits don't name is allowed. */
export function withinLimits(beast: Beast, limits: FormLimits): boolean {
  if (limits.maxChallenge !== null && !(beast.challengeValue <= limits.maxChallenge)) return false;
  return !(limits.noFly && /\bfly/i.test(beast.speed));
}

/** The Wild Shape feature's uses: MPMB's limited feature named "Wild Shape" (row, left, total), or null. */
export interface WildShapeUses {
  row: number;
  left: number;
  total: number;
}

export function wildShapeUses(features: readonly LimitedFeature[]): WildShapeUses | null {
  const feature = features.find((f) => /^wild shape\b/i.test(f.name.trim()) && f.max !== null);
  if (!feature || feature.max === null) return null;
  return { row: feature.row, left: Math.max(0, feature.max - feature.used), total: feature.max };
}

/**
 * Changing into a form (2024 rules): one use of Wild Shape is spent, and the druid gains the Temp HP the page
 * names. Temporary hit points don't add up: the higher number stays. The form itself is the app's to remember.
 */
export function changeSteps(
  uses: WildShapeUses | null,
  usedNow: number,
  tempHp: number | null,
  tempNow: number | null,
): { edit: string; text: string }[] {
  const steps: { edit: string; text: string }[] = [];
  if (uses) steps.push({ edit: `Limited Feature Used ${uses.row}`, text: String(usedNow + 1) });
  if (tempHp !== null && tempHp > (tempNow ?? 0)) steps.push({ edit: 'HP Temp', text: String(tempHp) });
  return steps;
}

/** The form the character is in, as the app keeps it next to the character (never in the sheet). */
export interface InForm {
  /** formKey of the form's place, and its name, so a form moved or replaced in that place doesn't count. */
  key: string;
  name: string;
}

const MAX_TEXT = 200;
export function readInForm(value: unknown): InForm | null {
  if (typeof value !== 'object' || value === null) return null;
  const { key, name } = value as Record<string, unknown>;
  if (typeof key !== 'string' || typeof name !== 'string' || !key || !name) return null;
  return { key: key.slice(0, MAX_TEXT), name: name.slice(0, MAX_TEXT) };
}

/** The form still on the sheet that the character is in, or null. */
export const currentForm = (forms: readonly WildShapeForm[], inForm: InForm | null): WildShapeForm | null =>
  (inForm && forms.find((f) => formKey(f) === inForm.key && f.name === inForm.name)) ?? null;

/** MPMB writes the senses as the first trait ("##Senses##. Darkvision 18 m."); the view shows them in a tile. */
const SENSES_LINE = /^##Senses##\.\s*(.*?)\.?\s*$/i;

/**
 * A form in the shape of a companion page, so the companion view's middle and right columns show it as they
 * show a familiar (attacks and traits; abilities, saves and skills). Hit points are the character's own.
 */
export function formAsCompanion(form: WildShapeForm, kind: string): Companion {
  const lines = form.traits.split(/\r\n?|\n/);
  const senses = lines.map((line) => SENSES_LINE.exec(line.trim())?.[1]).find((s) => s !== undefined) ?? '';
  return {
    prefix: formKey(form),
    name: '',
    creature: form.name,
    kind,
    template: '',
    hitDice: null,
    creatureType: form.creatureType,
    size: form.size,
    alignment: '',
    hp: { current: null, max: null, temp: null, deathSaves: { successes: 0, failures: 0 } },
    armorClass: form.armorClass,
    initiative: form.initiative,
    speed: form.speed,
    senses,
    proficiency: form.proficiency,
    passivePerception: form.passivePerception,
    abilities: form.abilities,
    skills: form.skills,
    attacks: form.attacks,
    attacksPerAction: '',
    traits: lines.filter((line) => !SENSES_LINE.test(line.trim())).join('\r'),
    features: '',
    rules: [],
    notes: [],
  };
}
