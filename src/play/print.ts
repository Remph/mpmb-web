// The print layout's choices (M10): which parts a character has something to print for, and how the
// pencil marks are drawn. Kept out of the components so they can be tested on the reference characters.
import { readNotesPages } from './notes.ts';
import { readSpells } from './spells.ts';
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
