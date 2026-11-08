// The sheet's Wild Shape pages: MPMB's template "WSfront", four forms a page. The player picks a beast in a
// form's name box ("Wildshape.Race.1") or from the page's "Wild Shape Options" menu, and MPMB fills the form's
// numbers from its creature list and the druid's own scores (ApplyWildshape). Like companion pages, every page's
// fields carry a prefix ("P6.WSfront."), MPMB lists the prefixes in "Template.extras.WSfront" (first entry
// empty), and the number in a prefix is where the page was first made, so the list counts, never the number.
import { ABILITIES, choicesOf, isOn, shown, SKILLS, valueOf } from './read.ts';
import type { SkillKey } from './read.ts';
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
  abilities: { key: (typeof ABILITIES)[number]; score: string; modifier: string; save: string; saveProficient: boolean }[];
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

/** The feature's rules from the first page; null without a page. */
export function readWildShapeRules(fields: FieldViews): WildShapeRules | null {
  const [prefix] = wildShapePrefixes(fields);
  if (prefix === undefined) return null;
  const info = (name: string): string => valueOf(fields, `${prefix}Wildshapes.Info.${name}`);
  return {
    knownForms: info('KnownForms'),
    limitations: info('Limitations'),
    duration: info('Duration'),
    tempHp: info('TempHP'),
  };
}

/** A form's key in the app: its page and place, stable while the form stays where it is. */
export const formKey = (form: Pick<WildShapeForm, 'prefix' | 'slot'>): string => `${form.prefix}${form.slot}`;
