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

/** The PDF's two equipment lists: page 2 ("Adventuring Gear …") and page 3 ("Extra.Gear …"). */
export type GearList = 'gear' | 'extra';
const GEAR_PREFIX: Record<GearList, string> = { gear: 'Adventuring Gear', extra: 'Extra.Gear' };

export interface GearItem {
  list: GearList;
  row: number;
  /** The fields of the row: name, amount (the steppers), weight, where it is carried, MPMB's row menu. */
  nameField: string;
  amountField: string;
  locationField: string;
  button: string;
  name: string;
  amount: number | null;
  /** The weight of one, with the sheet's unit ("0.25 kg"), '' when none. */
  weight: string;
  location: string;
}

export interface Inventory {
  magicItems: MagicItem[];
  /** The filled rows of both lists, in the sheet's order. */
  gear: GearItem[];
  /** Each list's first empty row, where a new item goes (null when the list is full or not there). */
  freeRow: Record<GearList, number | null>;
  /** Platinum, gold, electrum, silver, copper. */
  coins: { field: string; key: 'pp' | 'gp' | 'ep' | 'sp' | 'cp'; amount: string }[];
  carried: string;
  capacity: string;
  /** MPMB's lifestyle ("comfortable") and its daily cost ("2 gp"), both as typed on the sheet. */
  lifestyle: string;
  lifestyleCost: string;
}

const COINS = [
  ['Platinum Pieces', 'pp'],
  ['Gold Pieces', 'gp'],
  ['Electrum Pieces', 'ep'],
  ['Silver Pieces', 'sp'],
  ['Copper Pieces', 'cp'],
] as const;

/** What a coin is worth in gold pieces (the 2024 rules: 1 pp = 10 gp, 1 ep = 5 sp). */
const GOLD_VALUE: Record<Inventory['coins'][number]['key'], number> = { pp: 10, gp: 1, ep: 0.5, sp: 0.1, cp: 0.01 };

/** The coins' worth in gold pieces, or null when nothing is a number. Fields that aren't count as 0. */
export function goldTotal(coins: Inventory['coins']): number | null {
  const counted = coins
    .map((coin) => ({ key: coin.key, n: Number(coin.amount.replace(',', '.')) }))
    .filter((coin) => coin.n !== 0 && Number.isFinite(coin.n));
  if (!counted.length) return null;
  // Rounded to copper, so 0.1 + 0.2 doesn't show as 0.30000000000000004.
  const COPPER = 100;
  return Math.round(counted.reduce((sum, coin) => sum + coin.n * GOLD_VALUE[coin.key], 0) * COPPER) / COPPER;
}

export function readInventory(fields: FieldViews): Inventory {
  const carried = shown(fields, 'Weight Carried');
  // The unit the sheet weighs in ("kg" or "lb"), from the carried weight: "5.45 kg". Try it:
  // https://regex101.com/?regex=%5B%5E%5Cd.%2C%5Cs%5D.*%24&testString=5.45%20kg
  const unit = /[^\d.,\s].*$/.exec(carried)?.[0] ?? '';
  const all = (list: GearList): GearItem[] => {
    const prefix = GEAR_PREFIX[list];
    return rows(fields, `${prefix} Row `).map((row) => ({
      list,
      row,
      nameField: `${prefix} Row ${row}`,
      amountField: `${prefix} Amount ${row}`,
      locationField: `${prefix} Location.Row ${row}`,
      button: `${prefix} Button ${row}`,
      name: clean(valueOf(fields, `${prefix} Row ${row}`)),
      amount: numberOf(fields, `${prefix} Amount ${row}`),
      weight:
        valueOf(fields, `${prefix} Weight ${row}`) && `${valueOf(fields, `${prefix} Weight ${row}`)} ${unit}`.trim(),
      location: valueOf(fields, `${prefix} Location.Row ${row}`),
    }));
  };
  const gearRows = all('gear');
  const extraRows = all('extra');
  const free = (list: GearItem[]): number | null => list.filter((item) => item.name === '')[0]?.row ?? null;
  const gear = (list: GearItem[]): GearItem[] => list.filter((item) => item.name !== '');
  return {
    magicItems: rows(fields, 'Extra.Magic Item ')
      .map((row) => ({
        row,
        name: clean(valueOf(fields, `Extra.Magic Item ${row}`)),
        attuned: isOn(fields, `Extra.Magic Item Attuned ${row}`),
        description: valueOf(fields, `Extra.Magic Item Description ${row}`),
      }))
      .filter((item) => item.name !== ''),
    gear: [...gear(gearRows), ...gear(extraRows)],
    freeRow: { gear: free(gearRows), extra: free(extraRows) },
    coins: COINS.map(([field, key]) => ({ field, key, amount: valueOf(fields, field) })),
    carried,
    capacity: shown(fields, 'Weight Carrying Capacity.Field'),
    lifestyle: clean(valueOf(fields, 'Lifestyle')),
    lifestyleCost: valueOf(fields, 'Lifestyle daily cost'),
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

/**
 * A run of feature text with the part it plays, so the play view can colour it like the 2024 sheet:
 * the feature's name ("◆ Lay on Hands"), its uses ("40 HP pool …", MPMB's brackets taken off) and its
 * source ("(Paladin 1, SRD'24 53)") right after the name.
 */
export interface FeatureRun extends TextRun {
  role: 'name' | 'usage' | 'source' | null;
}

/** A line of feature text: a heading ("Paladin (Oath of Devotion), level 8") or runs. */
export type FeatureLine = { heading: string } | { runs: FeatureRun[] };

const FEATURE_MARK = '◆';
// A usage in MPMB's brackets: "[40 HP pool, replenishes after a Long Rest]". Try it:
// https://regex101.com/?regex=%5E%5C%5B(.%2B)%5C%5D%24&testString=%5B40%20HP%20pool%5D
const USAGE = /^\[(.+)\]$/;
// The source after a feature's name: " (Paladin 1, SRD'24 53) " and the rest. Try it:
// https://regex101.com/?regex=%5E(%5Cs*%5C(%5B%5E)%5D*%5C)%5Cs*)(.*)%24&testString=%20(Paladin%201%2C%20SRD%2724%2053)%20
const SOURCE = /^(\s*\([^)]*\)\s*)(.*)$/s;

export function featureLine(line: string): FeatureLine {
  const runs = textRuns(line);
  // A line that is one bold run is a heading: a class ("…, level 8:"), a species, a background.
  const only = runs.length === 1 ? runs[0] : undefined;
  if (only?.bold && !only.text.startsWith(FEATURE_MARK)) return { heading: only.text.replace(/:$/, '') };
  return {
    runs: runs.flatMap((run, i): FeatureRun[] => {
      const usage = run.bold ? USAGE.exec(run.text.trim()) : null;
      if (usage) return [{ ...run, text: usage[1] ?? '', role: 'usage' }];
      if (run.bold && run.text.startsWith(FEATURE_MARK)) return [{ ...run, role: 'name' }];
      const source =
        !run.bold && !run.italic && runs[i - 1]?.text.startsWith(FEATURE_MARK) ? SOURCE.exec(run.text) : null;
      if (!source) return [{ ...run, role: null }];
      const rest = source[2] ?? '';
      // "(level 5). As a Bonus Action": the full stop stays at the source; other text gets its space back.
      const space = /^[.,;:]/.test(rest) ? '' : ' ';
      return [
        { ...run, text: (source[1] ?? '').trim(), role: 'source' },
        ...(rest ? [{ ...run, text: `${space}${rest}`, role: null }] : []),
      ];
    }),
  };
}

/** One card of the senses and defenses: "Senses: Darkvision 18 m", "Immunities: Charmed". */
export interface DefenseCard {
  /** MPMB's label ("Immunities"), or '' for the play view's own (senses, resistances, other). */
  title: string;
  items: string[];
}

// MPMB's lines about saves: "**Immunities**. Charmed, Poisoned" or "Adv. on saves vs. poison". Try it:
// https://regex101.com/?regex=%5E%5C*%5C*(.%2B%3F)%5C*%5C*%5C.%3F%5Cs*(.*)%24&testString=**Immunities**.%20Charmed%2C%20Poisoned
const LABELLED = /^\*\*(.+?)\*\*\.?\s*(.*)$/;
const RESISTANCE_ROWS = 6;

/**
 * The senses (the Vision field), the resistances (six damage type fields) and MPMB's lines about saving
 * throws (immunities and the like), each as a list. A line without MPMB's label goes to `other`.
 */
export function readDefenses(fields: FieldViews): {
  senses: string[];
  resistances: string[];
  labelled: DefenseCard[];
  other: string[];
} {
  const list = (text: string): string[] =>
    text
      .split(/[;,]\s*/)
      .map((item) => item.trim())
      .filter(Boolean);
  const lines = linesOf(valueOf(fields, 'Saving Throw advantages / disadvantages')).filter((line) => line.trim());
  const parsed = lines.map((line) => LABELLED.exec(line.trim()));
  return {
    senses: list(valueOf(fields, 'Vision')),
    resistances: Array.from({ length: RESISTANCE_ROWS }, (_, i) =>
      valueOf(fields, `Resistance Damage Type ${i + 1}`),
    ).filter(Boolean),
    labelled: parsed
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({ title: m[1] ?? '', items: list(m[2] ?? '') })),
    other: lines.filter((_, i) => parsed[i] === null),
  };
}

/** Lines of a multi-line field ("\r" in Acrobat, "\n" when typed in the browser). */
export const linesOf = (text: string): string[] => text.split(/\r\n?|\n/);

/** The check boxes next to the hit points. */
export function readToggles(fields: FieldViews): { inspiration: boolean; reactionUsed: boolean } {
  return { inspiration: isOn(fields, 'Inspiration'), reactionUsed: isOn(fields, 'Reaction Used This Round') };
}
