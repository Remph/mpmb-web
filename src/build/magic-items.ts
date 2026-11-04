// Adding, swapping and removing magic items (session feedback, 2026-11-04: "a quick change button like
// Change weapons, but for magic items"). The app writes the item's name into MPMB's magic item field, as
// typing it in Acrobat does; MPMB then fills in the description, attunement, limited features, attacks and
// the rest, and asks which version when an item has several.
import type { MagicItemEntry } from '../engine/gear.ts';
import type { FieldViews } from '../worker/views.ts';
import { rows, valueOf } from '../play/read.ts';

export const magicItemField = (row: number): string => `Extra.Magic Item ${row}`;

/** The first empty magic item row, or null when every row on the sheet is taken. */
export function freeMagicRow(fields: FieldViews): number | null {
  return rows(fields, 'Extra.Magic Item ').find((row) => valueOf(fields, magicItemField(row)) === '') ?? null;
}

/** The picker's groups: MPMB's item types, in the order the PDF's magic item menu uses. */
const TYPE_ORDER = ['armor', 'shield', 'weapon', 'potion', 'ring', 'rod', 'scroll', 'staff', 'wand', 'wondrous item'];

/** "weapon (any sword)" belongs to "weapon"; an unknown or homebrew type goes last, under "other". */
export function typeGroup(entry: Pick<MagicItemEntry, 'type'>): string {
  const type = entry.type.toLowerCase();
  return TYPE_ORDER.find((t) => type.startsWith(t)) ?? 'other';
}

export function groupMagicItems(items: MagicItemEntry[]): { type: string; items: MagicItemEntry[] }[] {
  const order = [...TYPE_ORDER, 'other'];
  return order
    .map((type) => ({ type, items: items.filter((item) => typeGroup(item) === type) }))
    .filter((group) => group.items.length > 0);
}

/** At most this many characters of MPMB's description in the list: enough to tell items apart. */
const SHORT = 90;

/**
 * The picker's line for an item: "Rare · attunement · This wand has 7 charges and regains 1d6+1 …".
 * MPMB's emphasis marks go, its rarity gets a capital ("rare" in some scripts), and an item with versions
 * says so instead of MPMB's "Select one of the choices".
 */
export function itemLine(item: MagicItemEntry, words: { attunement: string; versions: string }): string {
  const text = item.description.replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
  const short = text.length > SHORT ? `${text.slice(0, SHORT).replace(/\s+\S*$/, '')} …` : text;
  const rarity = item.rarity ? item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1) : '';
  return [rarity, item.attunement ? words.attunement : '', item.choices ? words.versions : short]
    .filter(Boolean)
    .join(' · ');
}
