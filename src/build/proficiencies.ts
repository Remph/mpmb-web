// The Build screen's "Skills & languages" step and the play view's proficiencies (M6.5), read from MPMB's
// own fields. MPMB says in a tooltip what each class, species or background gives ("Paladin: Choose 2:
// Athletics, Insight, …"), keeps languages and tools in eight rows each with the source in their tooltip,
// and the armour and weapon training in check boxes. The player's changes go into the same fields.
import { ui } from '../i18n.ts';
import { SKILLS, isOn, valueOf } from '../play/read.ts';
import type { SkillKey } from '../play/read.ts';
import type { FieldViews } from '../worker/views.ts';

/** The skills by their English name, as MPMB writes them in its texts. */
const SKILL_NAMES: [SkillKey, string][] = SKILLS.map(([key]) => [key, ui.en[`skill${key}`]]);

/** MPMB writes some names in mathematical bold letters ("𝐏𝐚𝐥𝐚𝐝𝐢𝐧"); NFKC makes them plain letters. */
const plain = (text: string): string => text.normalize('NFKC');

/** How MPMB spells small counts out ("Choose two"): a word's place in the list plus one is its number. */
const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six'];
const countOf = (word: string | undefined): number => {
  const spelled = NUMBER_WORDS.indexOf(word?.toLowerCase() ?? '');
  return spelled >= 0 ? spelled + 1 : Number(word) || 1;
};

/** What one class, species, background or feat gives, as MPMB describes it. */
export interface SkillSource {
  /** "Paladin", "Acolyte (background)". */
  source: string;
  /** MPMB's text: "Choose 2: Athletics, Insight, …" or "Insight and Religion." */
  text: string;
  /** How many the player picks; 0 for skills that come as they are. */
  choose: number;
  /** The skills it names (for a choice: those to pick from; every skill when it says "any"). */
  skills: SkillKey[];
}

// A choice: "Choose 2: …", "choose any 3 skills", "Choose one of …". Try it:
// https://regex101.com/?regex=%5Cbchoose%5Cs%2B(%3Fany%5Cs%2B)%3F(%5Cd%2B%7Cone%7Ctwo%7Cthree%7Cfour%7Cfive%7Csix)%3F&flags=i&testString=Choose%202%3A%20Athletics
const CHOOSE = /\bchoose\s+(?:any\s+)?(\d+|one|two|three|four|five|six)?/i;
// One entry of MPMB's tooltip list: " • Paladin: Choose 2: Athletics, …". Try it:
// https://regex101.com/?regex=%5E%5Cs*%E2%80%A2%5Cs*(%5B%5E%3A%5D%2B)%3A%5Cs*(.*)%24&testString=%20%E2%80%A2%20Paladin%3A%20Choose%202%3A%20Athletics
const ENTRY = /^\s*•\s*([^:]+):\s*(.*)$/;

/** The skills a text names, in the sheet's order. */
function skillsIn(text: string): SkillKey[] {
  // The whole name as a word: "Insight" is in "Insight and Religion", not in "Insightful". Try it:
  // https://regex101.com/?regex=%5CbInsight%5Cb&flags=i&testString=Insight%20and%20Religion%2C%20Insightful
  return SKILL_NAMES.filter(([, name]) => new RegExp(`\\b${name}\\b`, 'i').test(text)).map(([key]) => key);
}

/**
 * MPMB's note on where skills come from, which it puts in every skill box's tooltip (setSkillTooltips):
 * "Skill proficiencies gained from:\n • Acolyte (background): Insight and Religion.\n • Paladin: Choose 2: …".
 */
export function readSkillSources(fields: FieldViews): SkillSource[] {
  const tooltip = plain(fields['Acr Prof']?.userName ?? '');
  return (
    tooltip
      // One entry per line: Acrobat's "\r", or "\n" from a script. Try it:
      // https://regex101.com/?regex=%5Cr%5Cn%3F%7C%5Cn&testString=a%0Ab
      .split(/\r\n?|\n/)
      .map((line) => ENTRY.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => {
        const text = (m[2] ?? '').trim();
        const choice = CHOOSE.exec(text);
        const named = skillsIn(text);
        return {
          source: (m[1] ?? '').trim(),
          text,
          choose: choice ? countOf(choice[1]) : 0,
          // "Choose any 3 skills" names none: then every skill may be picked.
          skills: choice && named.length === 0 ? SKILLS.map(([key]) => key) : named,
        };
      })
  );
}

/** A choice of skills (from a class, say) and how many of them the player has ticked. */
export interface SkillChoice extends SkillSource {
  chosen: number;
}

/**
 * How many skills of each choice are ticked. A skill that another source gives as it is ("Acolyte:
 * Insight and Religion") doesn't count for the choice, so the paladin above has 0 of 2 with only the
 * background's two ticked, as the 2024 rules have the player pick a different skill then.
 */
export function skillChoices(fields: FieldViews, sources: SkillSource[]): SkillChoice[] {
  const given = new Set(sources.filter((s) => s.choose === 0).flatMap((s) => s.skills));
  const ticked = (key: SkillKey): boolean => isOn(fields, `${key} Prof`);
  return sources
    .filter((s) => s.choose > 0)
    .map((s) => ({
      ...s,
      chosen: Math.min(s.choose, s.skills.filter((key) => ticked(key) && !given.has(key)).length),
    }));
}

/** Skill picks still open over all choices: the Build screen's badge. */
export const openSkillPicks = (choices: SkillChoice[]): number =>
  choices.reduce((sum, c) => sum + Math.max(0, c.choose - c.chosen), 0);

/** MPMB has eight rows each for languages and tools (FieldNumbers.langstools). */
export const LANG_TOOL_ROWS = 8;
export type LangToolKind = 'Language' | 'Tool';

/** One language or tool row. */
export interface LangTool {
  /** "Language 2" */
  field: string;
  name: string;
  /** Where MPMB says it comes from ("Silver Dragonborn"); empty for one the player typed in. */
  sources: string[];
  /** A pick MPMB asked the player for (a species' "one language of your choice"): it may be changed. */
  choice: boolean;
}

// MPMB's tooltip of a row: "\"Common\" language proficiency was gained from:\n • Silver Dragonborn".
// Try it: https://regex101.com/?regex=%5E%5Cs*%E2%80%A2%5Cs*(.%2B)%24&flags=gm&testString=x%0A%20%E2%80%A2%20Silver%20Dragonborn
const SOURCE_LINE = /^\s*•\s*(.+)$/gm;

/** The filled language or tool rows, in the sheet's order. */
export function readLangTools(fields: FieldViews, kind: LangToolKind): LangTool[] {
  return Array.from({ length: LANG_TOOL_ROWS }, (_, i) => `${kind} ${i + 1}`)
    .map((field) => {
      const tooltip = plain(fields[field]?.userName ?? '');
      return {
        field,
        name: valueOf(fields, field),
        sources: [...tooltip.matchAll(SOURCE_LINE)].map((m) => (m[1] ?? '').trim()),
        // MPMB names a choice "<source>_#_<what>_#_<n>-<i>" in the row's submitName (SetProf).
        choice: tooltip.includes('"from '),
      };
    })
    .filter((row) => row.name !== '');
}

/** The first empty row, where a new language or tool goes; null when all eight are full. */
export function freeLangToolRow(fields: FieldViews, kind: LangToolKind): string | null {
  return (
    Array.from({ length: LANG_TOOL_ROWS }, (_, i) => `${kind} ${i + 1}`).filter(
      (field) => valueOf(fields, field) === '',
    )[0] ?? null
  );
}

/**
 * The 2024 rules' languages (SRD 5.2.1): MPMB writes them in English on the sheet, so they are offered
 * in English in both languages of the app.
 */
export const STANDARD_LANGUAGES = [
  'Common',
  'Common Sign Language',
  'Draconic',
  'Dwarvish',
  'Elvish',
  'Giant',
  'Gnomish',
  'Goblin',
  'Halfling',
  'Orc',
];
export const RARE_LANGUAGES = [
  'Abyssal',
  'Celestial',
  'Deep Speech',
  'Druidic',
  'Infernal',
  'Primordial',
  'Sylvan',
  "Thieves' Cant",
  'Undercommon',
];

/** The armour and weapon training check boxes, as MPMB names them. */
export const TRAINING = {
  armour: [
    ['Proficiency Armor Light', 'light'],
    ['Proficiency Armor Medium', 'medium'],
    ['Proficiency Armor Heavy', 'heavy'],
    ['Proficiency Shields', 'shields'],
  ],
  weapons: [
    ['Proficiency Weapon Simple', 'simple'],
    ['Proficiency Weapon Martial', 'martial'],
  ],
} as const;
export type TrainingKey = (typeof TRAINING.armour)[number][1] | (typeof TRAINING.weapons)[number][1];
export const OTHER_WEAPONS = 'Proficiency Weapon Other Description';
export const OTHER_ARMOUR = 'Proficiency Armor Other Description';

/** Everything the character is trained in, for the play view's Features tab. */
export interface Proficiencies {
  armour: TrainingKey[];
  weapons: TrainingKey[];
  /** The "other" weapons and armour MPMB writes as text ("Hand crossbows, longswords"). */
  otherWeapons: string;
  otherArmour: string;
  tools: string[];
  languages: string[];
  /** What didn't fit the rows: MPMB's "MoreProficiencies" field ("Orc (language); …"). */
  more: string;
}

export function readProficiencies(fields: FieldViews): Proficiencies {
  const ticked = (list: readonly (readonly [string, TrainingKey])[]): TrainingKey[] =>
    list.filter(([field]) => isOn(fields, field)).map(([, key]) => key);
  return {
    armour: ticked(TRAINING.armour),
    weapons: ticked(TRAINING.weapons),
    otherWeapons: valueOf(fields, OTHER_WEAPONS),
    otherArmour: valueOf(fields, OTHER_ARMOUR),
    tools: readLangTools(fields, 'Tool').map((row) => row.name),
    languages: readLangTools(fields, 'Language').map((row) => row.name),
    more: valueOf(fields, 'MoreProficiencies'),
  };
}

/** True when the play view has anything to show. */
export const hasProficiencies = (p: Proficiencies): boolean =>
  [p.armour, p.weapons, p.tools, p.languages].some((list) => list.length > 0) ||
  [p.otherWeapons, p.otherArmour, p.more].some(Boolean);
