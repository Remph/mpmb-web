// Own spells: spells a player types into the app because MPMB's lists don't have them (a DM's gift, a
// homebrew feat). The app writes them as one small add-on script on the character, so MPMB treats them like
// any spell from an add-on: they survive backups, go into the PDF export and work in Acrobat too.
// The form's own values ride along in a comment line of that script, so the form can open them again.
import type { ScriptChanges, ScriptFile } from '../engine/add-ons.ts';
import { OWN_PREFIX } from '../engine/spells.ts';
import type { SpellInfo } from '../engine/spells.ts';
import { scriptName } from './add-ons.ts';

/** MPMB's short school names (Base_spellSchoolList); "" leaves the school out, as MPMB's talents do. */
export const SCHOOLS = ['', 'Abjur', 'Conj', 'Div', 'Ench', 'Evoc', 'Illus', 'Necro', 'Trans'] as const;
export type School = (typeof SCHOOLS)[number];

/** Casting times the form offers as chips, in MPMB's own words ("Act", "Bns", ...); anything else is typed. */
export const TIMES = ['Act', 'Bns', 'React', '1 min'] as const;

export const SAVES = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'] as const;
export type Save = (typeof SAVES)[number];
/** How a target resists: nothing, a spell attack, or a saving throw. */
export type Roll = '' | 'attack' | Save;

/** MPMB's damage type names, as its spell lines write them. */
export const DAMAGE_TYPES = [
  'Acid',
  'Bludgeoning',
  'Cold',
  'Fire',
  'Force',
  'Lightning',
  'Necrotic',
  'Piercing',
  'Poison',
  'Psychic',
  'Radiant',
  'Slashing',
  'Thunder',
] as const;

export interface OwnSpell {
  name: string;
  /** 0 for a cantrip. */
  level: number;
  school: School;
  /** MPMB's casting time text: "Act", "Bns", "React", "1 min" or what the player typed. */
  time: string;
  range: string;
  verbal: boolean;
  somatic: boolean;
  material: string | null;
  /** The duration without MPMB's "Conc, " in front; concentration is its own switch. */
  duration: string;
  concentration: boolean;
  ritual: boolean;
  roll: Roll;
  /** "1d10" or "" for none. */
  damage: string;
  damageType: string;
  /** A cantrip's damage dice grow at levels 5, 11 and 17, as MPMB's cantrips do. */
  grows: boolean;
  /** The line on the spell sheet (MPMB's `description`). */
  line: string;
  /** The full text, shown when the spell is tapped (MPMB's `descriptionFull`). */
  text: string;
}

export const BLANK_SPELL: OwnSpell = {
  name: '',
  level: 0,
  school: '',
  time: 'Act',
  range: '',
  verbal: true,
  somatic: true,
  material: null,
  duration: 'Instantaneous',
  concentration: false,
  ritual: false,
  roll: '',
  damage: '',
  damageType: 'Force',
  grows: true,
  line: '',
  text: '',
};

/**
 * The script's name for MPMB (`iFileName`): MPMB keeps one file per name, so writing the script again
 * replaces the old one instead of adding a second.
 */
export const OWN_SPELLS_FILE = 'MPMB Web own spells.js';
/** The comment line that carries the form's values; never run, only read back by `parseOwnSpells`. */
const DATA_MARK = '// mpmb-web own spells: ';

/**
 * MPMB's key for the spell. The "own " in front keeps it apart from MPMB's own spell of the same name
 * (a player's own "Fireball" mustn't replace the real one for every other source).
 */
export const ownSpellKey = (name: string): string => OWN_PREFIX + name.trim().toLowerCase();

/** Whether a key is one of the app's own spells. */
export const isOwnSpellKey = (key: string): boolean => key.startsWith(OWN_PREFIX);

/**
 * Dice in a spell line: "1d10", "2d6". Matches the "1d10" of "1d10 Psychic dmg"; not "d10" alone.
 * Try it: https://regex101.com/?regex=%5Cb(%5Cd%2B)d(%5Cd%2B)%5Cb&testString=INT%20save%20or%201d10%20Psychic%20dmg
 */
const DICE = /\b(\d+)d(\d+)\b/;

/** The damage dice the form takes: "1d10", "2d6". Not "d10", "1d", "1d10+3". */
export const validDice = (dice: string): boolean => /^\d+d\d+$/.test(dice.trim());

/** The line on the spell sheet, written from the form's fields: "INT save or 1d10 Psychic dmg; +1d10 at CL 5, 11, and 17". */
export function suggestLine(spell: OwnSpell): string {
  const dice = spell.damage.trim();
  const damage = validDice(dice) ? `${dice} ${spell.damageType} dmg` : '';
  let line = '';
  if (spell.roll === 'attack') line = damage ? `Spell attack for ${damage}` : 'Spell attack';
  else if (spell.roll) line = damage ? `${spell.roll} save or ${damage}` : `${spell.roll} save`;
  else line = damage;
  const die = DICE.exec(dice);
  if (line && damage && spell.level === 0 && spell.grows && die) line += `; +1d${die[2]} at CL 5, 11, and 17`;
  return line;
}

/**
 * The line with MPMB's cantrip die (`CD`d10) in place of the dice the damage starts with, without the "+1d10
 * at CL ..." note: MPMB writes the dice for the character's level itself. Null when it shouldn't grow.
 */
export function cantripDieLine(spell: OwnSpell): string | null {
  const die = DICE.exec(spell.damage.trim());
  if (spell.level !== 0 || !spell.grows || !die || die[1] !== '1') return null;
  const own = new RegExp(String.raw`\b1d${die[2]}\b`);
  if (!own.test(spell.line)) return null;
  return spell.line
    .replace(new RegExp(String.raw`;?\s*\+1d${die[2]} at CL 5, 11,? and 17`), '')
    .replace(own, `\`CD\`d${die[2]}`);
}

/** The form's values as MPMB's SpellsList entry. */
export function spellEntry(spell: OwnSpell): Record<string, unknown> {
  const components = [spell.verbal && 'V', spell.somatic && 'S', spell.material !== null && 'M']
    .filter(Boolean)
    .join(',');
  const entry: Record<string, unknown> = {
    name: spell.name.trim(),
    // On no class's list: the app adds it to a source as an extra row. Homebrew is MPMB's catch-all source.
    classes: [],
    source: [['HB', 0]],
    level: spell.level,
    school: spell.school,
    time: spell.time.trim(),
    range: spell.range.trim(),
    components,
    duration: (spell.concentration ? 'Conc, ' : '') + spell.duration.trim(),
    description: spell.line.trim(),
  };
  if (spell.material?.trim()) entry.compMaterial = spell.material.trim();
  if (spell.ritual) entry.ritual = true;
  if (spell.roll && spell.roll !== 'attack') entry.save = spell.roll;
  const die = cantripDieLine(spell);
  if (die) entry.descriptionCantripDie = die;
  const text = spell.text.trim();
  if (text) entry.descriptionFull = text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim());
  return entry;
}

/**
 * JSON with the two line breaks JSON leaves as they are (U+2028, U+2029) escaped: in a `//` comment they
 * would end the line, and older JavaScript (Acrobat's) doesn't allow them in strings either.
 */
const safeJson = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/** The add-on script for all of a character's own spells. JSON is valid JavaScript, so MPMB runs it as it is. */
export function ownSpellsScript(spells: OwnSpell[]): string {
  const lines = [
    '// Own spells, written by MPMB Web from what the player typed in. Changing them in the app writes this file again.',
    `var iFileName = ${safeJson(OWN_SPELLS_FILE)};`,
    DATA_MARK + safeJson(spells),
    ...spells.map((spell) => `SpellsList[${safeJson(ownSpellKey(spell.name))}] = ${safeJson(spellEntry(spell))};`),
  ];
  return lines.join('\n') + '\n';
}

/** Reads the form's values back from the script; [] for any other script or a damaged data line. */
export function parseOwnSpells(script: string): OwnSpell[] {
  const line = script.split('\n').find((l) => l.startsWith(DATA_MARK));
  if (!line) return [];
  try {
    const data: unknown = JSON.parse(line.slice(DATA_MARK.length));
    if (!Array.isArray(data)) return [];
    return data
      .filter((d): d is Partial<OwnSpell> => typeof d === 'object' && d !== null && typeof d.name === 'string')
      .map((d) => ({ ...BLANK_SPELL, ...d }));
  } catch {
    return [];
  }
}

/** What's wrong with the form, by field; empty when it can be saved. */
export function problems(spell: OwnSpell, others: OwnSpell[]): Partial<Record<'name' | 'damage' | 'line', string>> {
  const result: Partial<Record<'name' | 'damage' | 'line', string>> = {};
  const name = spell.name.trim().toLowerCase();
  if (!name) result.name = 'empty';
  else if (others.some((o) => o.name.trim().toLowerCase() === name)) result.name = 'taken';
  if (spell.damage.trim() && !validDice(spell.damage)) result.damage = 'dice';
  if (!spell.line.trim()) result.line = 'empty';
  return result;
}

/** The sheet's own spells file, found by its script name (MPMB's key for it has the date in front). */
export const ownSpellsFile = (files: ScriptFile[]): ScriptFile | null =>
  files.find((file) => scriptName(file.text) === OWN_SPELLS_FILE) ?? null;

/**
 * The files dialog's changes that make the own spells file hold `spells`: the old file out first (MPMB
 * would ask before replacing it otherwise), the new one in; no file at all when there are no spells.
 */
export const ownSpellsChanges = (current: ScriptFile | null, spells: OwnSpell[]): ScriptChanges => ({
  remove: current ? [current.key] : [],
  add: spells.length ? [ownSpellsScript(spells)] : [],
});

/** MPMB's full school names, for the step's line under a spell (SpellInfo has them spelled out). */
const SCHOOL_NAMES: Record<School, string> = {
  '': '',
  Abjur: 'Abjuration',
  Conj: 'Conjuration',
  Div: 'Divination',
  Ench: 'Enchantment',
  Evoc: 'Evocation',
  Illus: 'Illusion',
  Necro: 'Necromancy',
  Trans: 'Transmutation',
};

/**
 * The spell as the Spells step shows one, before MPMB has it on the sheet (a spell just made): the step's
 * info only holds spells a source offers or holds. The range stays as typed, unconverted.
 */
export function ownInfo(spell: OwnSpell): SpellInfo {
  const entry = spellEntry(spell);
  return {
    key: ownSpellKey(spell.name),
    name: spell.name.trim(),
    level: spell.level,
    school: SCHOOL_NAMES[spell.school],
    time: spell.time.trim(),
    range: spell.range.trim(),
    duration: spell.duration.trim(),
    components: String(entry.components),
    ritual: spell.ritual,
    concentration: spell.concentration,
    save: spell.roll && spell.roll !== 'attack' ? spell.roll : '',
    description: spell.line.trim(),
    full: Array.isArray(entry.descriptionFull) ? entry.descriptionFull.join('\n') : '',
    source: 'HB',
  };
}
