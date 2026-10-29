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

// MPMB's usual recovery texts, which the view translates; anything else ("7 days") shows as written.
// Try it: https://regex101.com/?regex=%5E%28long%20rest%7Clr%29%24%7C%5E%28short%20rest%7Csr%29%24%7C%5E%28dawn%29%24&flags=i&testString=long%20rest
const RECOVERY_KINDS = { long: /^(long rest|lr)$/i, short: /^(short rest|sr)$/i, dawn: /^dawn$/i } as const;
export type RecoveryKind = keyof typeof RECOVERY_KINDS;

/** "long rest", "LR" and "Long Rest" are all a long rest; null when the text is something else. */
export function recoveryKind(recovery: string): RecoveryKind | null {
  const kinds = Object.keys(RECOVERY_KINDS) as RecoveryKind[];
  return kinds.find((kind) => RECOVERY_KINDS[kind].test(recovery.trim())) ?? null;
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

/**
 * MPMB's seven slot boxes per spell level. It shows one to four of them on page 1, in this order of
 * the list (BoxesFld in SetSpellSlotsCheckboxes): 1 slot uses box 0, 2 use 1 and 4, and so on. The play
 * view ticks the shown ones first, so a character with up to four slots looks the same in Acrobat,
 * then the hidden ones, so up to seven used slots can be kept.
 */
const SLOT_BOXES = ['mid', 'top1', 'top2.1', 'top2.2', 'bottom1', 'bottom2.1', 'bottom2.2'];
const SHOWN_SLOT_BOXES: Record<number, number[]> = { 1: [0], 2: [1, 4], 3: [2, 3, 4], 4: [2, 3, 5, 6] };

/** The slot boxes of a spell level, in the order the play view ticks them. */
export function slotBoxes(level: number, total: number): string[] {
  const shown = SHOWN_SLOT_BOXES[total] ?? SHOWN_SLOT_BOXES[4] ?? [];
  const order = [...shown, ...SLOT_BOXES.map((_, i) => i).filter((i) => !shown.includes(i))];
  return order.map((i) => `SpellSlots.Checkboxes.lvl${level}.${SLOT_BOXES[i]}`);
}

export interface SpellSlotUse extends SpellSlotLevel {
  used: number;
  /** How many the boxes can hold: slots beyond seven can't be marked used. */
  boxes: string[];
}

export function readSpellSlotUse(fields: FieldViews): SpellSlotUse[] {
  return readSpellSlots(fields).map((slots) => {
    const boxes = slotBoxes(slots.level, slots.total);
    return { ...slots, boxes, used: boxes.filter((box) => isOn(fields, box)).length };
  });
}

/** MPMB ends some item names with an invisible mark (U+180C) to tell its own entries apart. */
// Try it: https://regex101.com/?regex=%5B%5Cu180B-%5Cu180F%5Cs%5D%2B%24&testString=Adamantine%20Plate%20Armor%20%E1%A0%8C
const INVISIBLE_END = /[᠋-᠏\s]+$/;
const clean = (text: string): string => text.replace(INVISIBLE_END, '');

export interface MagicItem {
  row: number;
  name: string;
  attuned: boolean;
  description: string;
}

export interface GearItem {
  /** The field the amount lives in, for the steppers. */
  amountField: string;
  name: string;
  amount: number | null;
}

export interface Inventory {
  magicItems: MagicItem[];
  gear: GearItem[];
  /** Platinum, gold, electrum, silver, copper. */
  coins: { field: string; key: 'pp' | 'gp' | 'ep' | 'sp' | 'cp'; amount: string }[];
  carried: string;
  capacity: string;
}

const COINS = [
  ['Platinum Pieces', 'pp'],
  ['Gold Pieces', 'gp'],
  ['Electrum Pieces', 'ep'],
  ['Silver Pieces', 'sp'],
  ['Copper Pieces', 'cp'],
] as const;

export function readInventory(fields: FieldViews): Inventory {
  const gear = (prefix: string): GearItem[] =>
    rows(fields, `${prefix} Row `)
      .map((row) => ({
        amountField: `${prefix} Amount ${row}`,
        name: clean(valueOf(fields, `${prefix} Row ${row}`)),
        amount: numberOf(fields, `${prefix} Amount ${row}`),
      }))
      .filter((item) => item.name !== '');
  return {
    magicItems: rows(fields, 'Extra.Magic Item ')
      .map((row) => ({
        row,
        name: clean(valueOf(fields, `Extra.Magic Item ${row}`)),
        attuned: isOn(fields, `Extra.Magic Item Attuned ${row}`),
        description: valueOf(fields, `Extra.Magic Item Description ${row}`),
      }))
      .filter((item) => item.name !== ''),
    gear: [...gear('Adventuring Gear'), ...gear('Extra.Gear')],
    coins: COINS.map(([field, key]) => ({ field, key, amount: valueOf(fields, field) })),
    carried: shown(fields, 'Weight Carried'),
    capacity: shown(fields, 'Weight Carrying Capacity.Field'),
  };
}

/** A block of MPMB's feature text: the class features, species traits, a feat, the background. */
export interface FeatureText {
  title: string;
  text: string;
}

export function readFeatures(fields: FieldViews): FeatureText[] {
  const feats = rows(fields, 'Feat Name ').map((row) => ({
    title: valueOf(fields, `Feat Name ${row}`),
    text: valueOf(fields, `Feat Description ${row}`),
  }));
  const background = valueOf(fields, 'Background Feature');
  return [
    { title: '', text: valueOf(fields, 'Class Features') },
    { title: '', text: valueOf(fields, 'Racial Traits') },
    ...feats,
    { title: background, text: valueOf(fields, 'Background Feature Description') },
  ].filter((block) => block.text !== '');
}

/** A run of text with MPMB's emphasis: **bold**, #bold#, ##bold## and *italic*. */
export interface TextRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

// MPMB's marks: "**Silver Dragonborn**", "#◆ Lay on Hands#", "##◆ Breath Weapon##" and "*Divine Smite*"
// are runs; "40 HP" in between is plain. Try it:
// https://regex101.com/?regex=%5C*%5C*(.%2B%3F)%5C*%5C*%7C%23%23(.%2B%3F)%23%23%7C%23(.%2B%3F)%23%7C%5C*(.%2B%3F)%5C*&testString=%23%E2%97%86%20Lay%20on%20Hands%23%20(Paladin%201)%20*Divine%20Smite*
const MARKS = /\*\*(.+?)\*\*|##(.+?)##|#(.+?)#|\*(.+?)\*/g;

/** One line of MPMB's feature text as runs. Lines are separated by "\r" in the field. */
export function textRuns(line: string): TextRun[] {
  const runs: TextRun[] = [];
  const plain = (text: string): void => {
    if (text) runs.push({ text, bold: false, italic: false });
  };
  let at = 0;
  [...line.matchAll(MARKS)].forEach((m) => {
    plain(line.slice(at, m.index));
    const [, b1, b2, b3, italic] = m;
    runs.push({ text: b1 ?? b2 ?? b3 ?? italic ?? '', bold: italic === undefined, italic: italic !== undefined });
    at = m.index + m[0].length;
  });
  plain(line.slice(at));
  return runs;
}

/** Lines of a multi-line field ("\r" in Acrobat, "\n" when typed in the browser). */
export const linesOf = (text: string): string[] => text.split(/\r\n?|\n/);

/** The check boxes next to the hit points. */
export function readToggles(fields: FieldViews): { inspiration: boolean; reactionUsed: boolean } {
  return { inspiration: isOn(fields, 'Inspiration'), reactionUsed: isOn(fields, 'Reaction Used This Round') };
}
