// The print layout's choices (M10): which parts a character has something to print for, and how the
// pencil marks are drawn. Kept out of the components so they can be tested on the reference characters.
import { readNotesPages } from './notes.ts';
import { readSpells } from './spells.ts';
import type { SpellMark } from './spells.ts';
import type { FieldViews } from '../worker/views.ts';

/** The parts of the print, in the order they print. */
export const PRINT_PARTS = ['main', 'features', 'spells', 'inventory', 'profile', 'notes'] as const;
export type PrintPart = (typeof PRINT_PARTS)[number];

/** Notes pages with any text: an empty page would print as a heading alone. */
export const filledNotesPages = (fields: FieldViews) =>
  readNotesPages(fields).filter((page) => page.left.trim() !== '' || page.right.trim() !== '');

/** Every part the character has something for: no Spells part without spell sheet pages, no Notes without notes. */
export function printableParts(fields: FieldViews): PrintPart[] {
  return PRINT_PARTS.filter(
    (part) =>
      (part !== 'spells' || readSpells(fields).length > 0) && (part !== 'notes' || filledNotesPages(fields).length > 0),
  );
}

/**
 * Circles or boxes to tick, one per use: the used ones filled, unless the page is printed blank for a
 * pencil. A negative or broken count draws nothing.
 */
export function marks(total: number, used: number, blank: boolean): boolean[] {
  return Array.from({ length: Math.max(0, Math.floor(total) || 0) }, (_, i) => !blank && i < used);
}

/** What is left of a pool ("40" of "40 HP"), empty when printed blank or when MPMB wrote no number. */
export const poolLeft = (max: number | null, used: number, blank: boolean): string =>
  blank || max === null ? '' : String(Math.max(0, max - used));

/** A mark in a spell row's first column on paper. */
export interface PaperMark {
  kind: 'box' | 'star' | 'circle';
  on: boolean;
}

/**
 * A spell's marks on paper, like the Spells tab reads them: ★ for an always prepared spell (MPMB counts it as
 * prepared too, so it has to be asked first), else the box the player ticks, then a circle for a cast
 * without a slot. A species' once-a-day spell is always prepared and has the circle as well. The circle is a
 * pencil mark; the box is not, since prepared spells change only on a long rest.
 */
export function spellMarks(mark: SpellMark, blank: boolean): PaperMark[] {
  const out: PaperMark[] = [];
  if (mark.always) out.push({ kind: 'star', on: false });
  else if (mark.prepared !== null) out.push({ kind: 'box', on: mark.prepared });
  if (mark.free !== null) out.push({ kind: 'circle', on: !blank && mark.freeUsed });
  return out;
}
