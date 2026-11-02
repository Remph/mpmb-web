// The "Armour & weapons" Build step (M6.5): what the page-1 armour, shield and attack fields hold, and
// how the step's lists describe MPMB's armour and weapons. Every change goes into MPMB's own fields
// ("AC Armor Description", "AC Shield Bonus Description", "Attack.N.Weapon Selection"); MPMB's scripts
// (ApplyArmor, ApplyShield, ApplyWeapon) then work out AC, to hit and damage as in Acrobat.
import type { ArmourEntry, GearInfo, WeaponEntry } from '../engine/gear.ts';
import { valueOf } from '../play/read.ts';
import type { FieldViews } from '../worker/views.ts';
import type { Proficiencies } from './proficiencies.ts';

export const ARMOUR_FIELD = 'AC Armor Description';
export const SHIELD_FIELD = 'AC Shield Bonus Description';
export const weaponField = (row: number): string => `Attack.${row}.Weapon Selection`;

/** An entry in the step's armour or weapon list. */
export interface GearOption {
  name: string;
  /** What it does: "AC 16 · Str 13 · 27.5 kg · Stealth disadvantage". */
  line: string;
  /** Marked "not trained" (worked out from the training boxes). */
  untrained: boolean;
  /** Takes a magic bonus: real weapons do, spells, unarmed strikes and entries from items don't. */
  magic: boolean;
}

/** Only simple and martial weapons from MPMB's lists get the step's magic bonus. */
export const takesMagic = (entry: ArmourEntry | WeaponEntry): boolean =>
  !('ac' in entry) && ['simple', 'martial'].includes(entry.type.toLowerCase()) && entry.group !== 'own';

/** The highest magic bonus the step offers (+3 is the rarest magic weapon, armour or shield). */
export const MAX_MAGIC = 3;

/**
 * The page-1 attack rows, in order (six on the 2024 sheet), from the fields themselves.
 * "Attack.3.Weapon Selection" passes; "Attack.3.Weapon" and companion pages' "P4.AScomp.…" don't. Try it:
 * https://regex101.com/?regex=%5EAttack%5C.(%5Cd%2B)%5C.Weapon%20Selection%24&testString=Attack.3.Weapon%20Selection
 */
const ATTACK_ROW = /^Attack\.(\d+)\.Weapon Selection$/;

export function weaponRows(fields: FieldViews): number[] {
  return Object.keys(fields)
    .map((key) => ATTACK_ROW.exec(key)?.[1])
    .filter((row): row is string => row !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
}

/** The shield as MPMB's text field holds it: "Shield", "Shield +1", empty, or a magic item's own name. */
export interface ShieldState {
  on: boolean;
  bonus: number;
  /** A name the step doesn't write itself (a magic item's "Spellguard Shield"): shown, not switched. */
  other: string;
}

/**
 * "Shield" and "Shield +2" are what the step writes; anything else came from a magic item or Acrobat.
 * "Shield", "shield +1" pass; "Spellguard Shield" and "Shield of Faith" don't. Try it:
 * https://regex101.com/?regex=%5Eshield(%3F%3A%5Cs*%5C%2B(%5Cd%2B))%3F%24&flags=i&testString=Shield%20%2B1
 */
const PLAIN_SHIELD = /^shield(?:\s*\+(\d+))?$/i;

export function readShield(fields: FieldViews): ShieldState {
  const text = valueOf(fields, SHIELD_FIELD).trim();
  if (!text) return { on: false, bonus: 0, other: '' };
  const plain = PLAIN_SHIELD.exec(text);
  if (!plain) return { on: true, bonus: 0, other: text };
  return { on: true, bonus: Number(plain[1] ?? 0), other: '' };
}

/** What the shield field gets for a shield with a magic bonus, or none. */
export function shieldText(on: boolean, bonus: number): string {
  if (!on) return '';
  return bonus > 0 ? `Shield +${bonus}` : 'Shield';
}

/** A weapon's name with its magic bonus in front, as MPMB reads it ("+1 Longsword"). */
export const withMagic = (name: string, bonus: number): string => (bonus > 0 ? `+${bonus} ${name}` : name);

/**
 * A magic bonus in front of a name, as `withMagic` writes it and MPMB reads it: "+2 Halberd" gives 2.
 * Try it: https://regex101.com/?regex=%5E%5C%2B(%5Cd%2B)%5Cs%2B(.%2B)%24&testString=%2B2%20Halberd
 */
const MAGIC_PREFIX = /^\+(\d+)\s+(.+)$/;

/** The step's list entry for what a field holds: by name, else without the magic bonus ("+1 Longsword"). */
function entryNamed<T extends { name: string }>(entries: T[], name: string): T | null {
  const find = (wanted: string): T | null =>
    entries.filter((e) => e.name.toLowerCase() === wanted.trim().toLowerCase())[0] ?? null;
  const plain = MAGIC_PREFIX.exec(name.trim());
  return find(name) ?? (plain?.[2] ? find(plain[2]) : null);
}

export const armourNamed = (gear: GearInfo, name: string): ArmourEntry | null => entryNamed(gear.armour, name);
export const weaponNamed = (gear: GearInfo, name: string): WeaponEntry | null => entryNamed(gear.weapons, name);

/** A cantrip's damage dice grow with the character's level ("C"); the list shows level 1's. */
const CANTRIP = 'C';
/** True Strike's extra radiant damage ("+B"), on top of the weapon's. */
const BONUS_DICE = '+B';

/**
 * A weapon's damage as a short text: "1d8 slashing", "1d10 force" (a cantrip), "Dex save · Restrained",
 * "1 bludgeoning" (an unarmed strike). Empty where MPMB gives none ("Spell Attack").
 */
export function damageText(damage: (string | number)[]): string {
  const [count = '', size = '', type = ''] = damage.map(String);
  const isDigits = (s: string): boolean => s !== '' && !Number.isNaN(Number(s));
  let dice = count;
  if (count.startsWith(CANTRIP)) dice = size ? `1d${size}` : '';
  else if (count === BONUS_DICE) dice = size ? `+1d${size}` : '';
  else if (isDigits(count) && size) dice = `${count}d${size}`;
  if (!dice) return type.trim();
  if (!isDigits(count) && !count.startsWith(CANTRIP) && count !== BONUS_DICE) return `${dice} · ${type}`.trim();
  return `${dice} ${type}`.trim();
}

/** Weights show at most two decimals: a dart weighs 0.13 kg. */
const WEIGHT_DECIMALS = 2;

/**
 * A weight with its unit in the page's language, without trailing zeros ("4.5 kg", "4,5 kg"); empty for
 * none or next to none.
 */
export function weightText(weight: number | null, unit: string, locale = 'en'): string {
  if (weight === null || weight <= 0) return '';
  return `${weight.toLocaleString(locale, { maximumFractionDigits: WEIGHT_DECIMALS })} ${unit}`;
}

/** Whether the character is trained with an armour or weapon from the step's lists (null: no training needed). */
export function trainedWith(entry: ArmourEntry | WeaponEntry, prof: Proficiencies): boolean | null {
  if ('ac' in entry) {
    if (entry.type !== 'light' && entry.type !== 'medium' && entry.type !== 'heavy') return null;
    return prof.armour.includes(entry.type);
  }
  const kind = entry.type.toLowerCase();
  if (kind !== 'simple' && kind !== 'martial') return null;
  if (prof.weapons.includes(kind)) return true;
  // MPMB's "other weapons" line lists single weapons by name ("Longswords, Rapiers").
  return prof.otherWeapons.toLowerCase().includes(entry.name.toLowerCase());
}
