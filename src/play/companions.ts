// The sheet's companion pages: MPMB's template "AScomp", one page per familiar, mount or summoned creature.
// The player adds pages with the page's "Companion Options" menu (MakeCompMenu_CompOptions), and MPMB fills
// them from its creature lists when the creature's name goes into "Comp.Race". Each page's fields carry a
// prefix ("P4.AScomp."), and MPMB lists the prefixes in "Template.extras.AScomp" (",P4.AScomp.,P5.AScomp.",
// the first entry empty). The number in a prefix is the page where it was first made, not where it is now:
// after a page before it is removed, "P5.AScomp." and "P5.ASnotes." can both exist. So the list counts,
// never the page number.
import { ABILITIES, choicesOf, isOn, numberOf, shown, SKILLS, valueOf } from './read.ts';
import type { HitPoints, SkillKey } from './read.ts';
import type { FieldViews } from '../worker/views.ts';

const COMPANION_PAGES_FIELD = 'Template.extras.AScomp';
/** A companion page has three attack rows and three death save boxes of each kind, numbered from 1. */
const ROWS_PER_PAGE = 3;
const fromOne = (count: number): number[] => Array.from({ length: count }, (_, i) => i + 1);
const ATTACK_ROWS = fromOne(ROWS_PER_PAGE);
const DEATH_SAVE_BOXES = fromOne(ROWS_PER_PAGE);

/** The page's menu button ("Companion Options"). */
export const companionMenu = (prefix: string): string => `${prefix}Companion.Options`;
/** MPMB's menu answers on that button (its cReturn texts) for adding and removing a page. */
export const ADD_COMPANION_PAGE = 'companion#add_page';
export const REMOVE_COMPANION_PAGE = 'companion#remove_page';
/**
 * With no companion page left, the template's own button fails (MPMB's menu reads the creature of the page
 * it sits on, and the template has none), so the first page comes from MPMB's "Set Pages Layout" menu.
 */
export const PAGES_LAYOUT_BOOKMARK = ['Functions', 'Set Pages Layout'];
export const ADD_FIRST_COMPANION_PAGE = 'template#AScomp#add';

/** How MPMB marks a companion's skill ("Text.Comp.Use.Skills.Arc.Prof"). */
export type SkillMark = 'nothing' | 'proficient' | 'expertise';

export interface CompanionSkill {
  key: SkillKey;
  bonus: string;
  mark: SkillMark;
}

export interface CompanionAbility {
  key: (typeof ABILITIES)[number];
  score: string;
  modifier: string;
  save: string;
  saveProficient: boolean;
}

export interface CompanionAttack {
  row: number;
  name: string;
  toHit: string;
  damage: string;
  damageType: string;
  range: string;
  description: string;
}

export interface Companion {
  prefix: string;
  /** The player's name for it ("Hoot"); may be empty. */
  name: string;
  /** The creature, as typed or picked ("Owl"). */
  creature: string;
  /** The page's heading: MPMB offers Companion, Familiar, Mount and Cohort, any text goes. */
  kind: string;
  /** "Celestial", "Fiend (Devil)" */
  creatureType: string;
  /** The size's name ("Tiny"); MPMB stores a number for it. */
  size: string;
  alignment: string;
  /** Hit points in the shape the character's own use, so the same damage and healing rules apply. */
  hp: Pick<HitPoints, 'current' | 'max' | 'temp' | 'deathSaves'>;
  armorClass: string;
  initiative: string;
  speed: string;
  senses: string;
  proficiency: string;
  passivePerception: string;
  abilities: CompanionAbility[];
  skills: CompanionSkill[];
  attacks: CompanionAttack[];
  /** How many attacks one Attack action makes ("2"). */
  attacksPerAction: string;
  traits: string;
  features: string;
  /** What the feature that gave the companion says (Find Familiar, Pact of the Chain), MPMB's two columns. */
  rules: string[];
  /** The appearance box and the equipment notes. */
  notes: string[];
}

/** A companion page's field names, by its prefix. */
export const companionFields = (prefix: string) => ({
  name: `${prefix}Comp.Desc.Name`,
  creature: `${prefix}Comp.Race`,
  hpCurrent: `${prefix}Comp.Use.HP.Current`,
  hpTemp: `${prefix}Comp.Use.HP.Temp`,
  deathSave: (kind: 'Success' | 'Fail', n: number) => `${prefix}Comp.Use.DeathSave.${kind}.${n}`,
});

/** The prefixes of the companion pages that exist, in MPMB's order. */
export function companionPrefixes(fields: FieldViews): string[] {
  return valueOf(fields, COMPANION_PAGES_FIELD)
    .split(',')
    .filter((prefix) => prefix !== '' && companionFields(prefix).creature in fields);
}

function readCompanion(fields: FieldViews, prefix: string): Companion {
  const f = (name: string): string => `${prefix}${name}`;
  const sizeValue = valueOf(fields, f('Comp.Desc.Size'));
  // "Medium" and "Small" share the value 1, so the first name with that value is the one to show.
  const size = choicesOf(fields, f('Comp.Desc.Size')).find(([value]) => value === sizeValue)?.[1] ?? '';
  const ticked = (kind: 'Success' | 'Fail'): number =>
    DEATH_SAVE_BOXES.filter((n) => isOn(fields, companionFields(prefix).deathSave(kind, n))).length;
  return {
    prefix,
    name: valueOf(fields, f('Comp.Desc.Name')),
    creature: valueOf(fields, f('Comp.Race')),
    kind: valueOf(fields, f('Comp.Type')),
    creatureType: valueOf(fields, f('Comp.Desc.MonsterType')),
    size,
    alignment: valueOf(fields, f('Comp.Desc.Alignment')),
    hp: {
      current: numberOf(fields, f('Comp.Use.HP.Current')),
      max: numberOf(fields, f('Comp.Use.HP.Max')),
      temp: numberOf(fields, f('Comp.Use.HP.Temp')),
      deathSaves: { successes: ticked('Success'), failures: ticked('Fail') },
    },
    // MPMB keeps a formula ("10+Dex") and shows its result.
    armorClass: shown(fields, f('Comp.Use.AC')).trim(),
    initiative: shown(fields, f('Comp.Use.Combat.Init.Mod')).trim(),
    speed: valueOf(fields, f('Comp.Use.Speed')),
    senses: valueOf(fields, f('Comp.Use.Senses')),
    proficiency: shown(fields, f('Comp.Use.Proficiency Bonus')).trim(),
    passivePerception: shown(fields, f('Comp.Use.Skills.Perc.Pass.Mod')).trim(),
    abilities: ABILITIES.map((key) => ({
      key,
      score: shown(fields, f(`Comp.Use.Ability.${key}.Score`)).trim(),
      modifier: shown(fields, f(`Comp.Use.Ability.${key}.Mod`)).trim(),
      save: shown(fields, f(`Comp.Use.Ability.${key}.ST.Mod`)).trim(),
      saveProficient: isOn(fields, f(`Comp.Use.Ability.${key}.ST.Prof`)),
    })),
    skills: SKILLS.map(([key]) => {
      const mark = valueOf(fields, f(`Text.Comp.Use.Skills.${key}.Prof`));
      return {
        key,
        bonus: shown(fields, f(`Comp.Use.Skills.${key}.Mod`)).trim(),
        mark: mark === 'proficient' || mark === 'expertise' ? mark : 'nothing',
      };
    }),
    attacks: ATTACK_ROWS.map((row) => ({
      row,
      name: valueOf(fields, f(`Comp.Use.Attack.${row}.Weapon`)),
      toHit: shown(fields, f(`Comp.Use.Attack.${row}.To Hit`)).trim(),
      damage: shown(fields, f(`Comp.Use.Attack.${row}.Damage`)).trim(),
      damageType: valueOf(fields, f(`Comp.Use.Attack.${row}.Damage Type`)),
      range: valueOf(fields, f(`Comp.Use.Attack.${row}.Range`)),
      description: valueOf(fields, f(`Comp.Use.Attack.${row}.Description`)),
    })).filter((attack) => attack.name !== ''),
    attacksPerAction: valueOf(fields, f('Comp.Use.Attack.perAction')),
    traits: valueOf(fields, f('Comp.Use.Traits')),
    features: valueOf(fields, f('Comp.Use.Features')),
    rules: [f('Cnote.Left'), f('Cnote.Right')].map((name) => valueOf(fields, name)).filter((text) => text !== ''),
    notes: [f('Comp.img.Notes'), f('Comp.eqp.Notes')]
      .map((name) => valueOf(fields, name))
      .filter((text) => text !== ''),
  };
}

/** The companion pages, in MPMB's order. */
export function readCompanions(fields: FieldViews): Companion[] {
  return companionPrefixes(fields).map((prefix) => readCompanion(fields, prefix));
}

/** A page with no creature and no name: what "Add extra companion page" makes, or a page left empty. */
export const isEmptyCompanion = (c: Companion): boolean => c.creature === '' && c.name === '';

/** What a companion is called in the app's lists: its name, else its creature ("Quasit"). */
export const companionLabel = (c: Companion): string => c.name || c.creature;

/**
 * The page the app should show after the list changed: the one shown before while it still exists, else
 * the character (null).
 */
export const stillShown = (prefixes: string[], shown: string | null): string | null =>
  shown !== null && prefixes.includes(shown) ? shown : null;

/** The page MPMB added: the first prefix that wasn't there before. */
export const addedPage = (before: string[], after: string[]): string | null =>
  after.find((prefix) => !before.includes(prefix)) ?? null;
