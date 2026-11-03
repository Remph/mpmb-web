// The Spells step's picks that aren't on the spell sheet yet, per character (M7 review): they survive
// leaving the step for another one or for the play view, and the step's rail entry counts them. They
// count only while the sheet is unchanged since (`updated`): after any other save, MPMB may offer
// different spells, so the step starts again from what MPMB has.
import type { SheetDraft, SpellDraft } from './spells.ts';

export interface UnsentSpells {
  /** The character's `updated` when the picks were made. */
  updated: string;
  drafts: Record<string, SpellDraft>;
  sheet: SheetDraft | null;
  /** How many changes they are, for the rail. */
  changes: number;
}

export const unsentSpells = $state<Record<string, UnsentSpells>>({});

/** The character's unsent picks, if the sheet hasn't changed since they were made. */
export function unsentFor(characterId: string, updated: string): UnsentSpells | null {
  const saved = unsentSpells[characterId];
  return saved && saved.updated === updated ? saved : null;
}
