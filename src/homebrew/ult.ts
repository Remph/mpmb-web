// Ultimate ability charges: a house rule of the owner's group, not part of MPMB's sheet. They live only in
// the app (in the character's list entry, so backups carry them) and never go into a PDF.

/** Where the ult shows in the Combat tab's Actions card, if anywhere. */
export type UltKind = 'none' | 'action' | 'bonus' | 'reaction';
export const ULT_KINDS: readonly UltKind[] = ['none', 'action', 'bonus', 'reaction'];

/**
 * One character's ultimate ability: its name, how many charges it holds, how many it has now, where it
 * shows among the actions, and its rule text as the player typed it.
 */
export interface UltCharges {
  name: string;
  max: number;
  charges: number;
  kind: UltKind;
  text: string;
}

/**
 * A start until the player sets their own. The group's meters fill over a fight: one charge for each turn
 * and each attack, up to 25 or 30 (Remph, 2026-11-04).
 */
export const DEFAULT_ULT: UltCharges = { name: '', max: 30, charges: 0, kind: 'none', text: '' };
/** Two digits: the number stays one line in the left column. */
export const MAX_CHARGES = 99;
/** A long ult fits (a page of rules is about 3000 characters); a pasted book doesn't bloat the list entry. */
export const MAX_TEXT = 6000;

const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, Math.round(n)));

/** The charges set to `charges`, kept between 0 and the maximum. */
export function withCharges(ult: UltCharges, charges: number): UltCharges {
  return { ...ult, charges: clamp(charges, 0, ult.max) };
}

/** A new maximum (1 to MAX_CHARGES); charges above it are cut down to it. */
export function withMax(ult: UltCharges, max: number): UltCharges {
  const next = clamp(max, 1, MAX_CHARGES);
  return { ...ult, max: next, charges: Math.min(ult.charges, next) };
}

/** Whatever a stored or restored entry holds, made into a valid one (old or hand-edited backups). */
export function readUlt(value: unknown): UltCharges {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_ULT };
  const v = value as Partial<Record<keyof UltCharges, unknown>>;
  const name = typeof v.name === 'string' ? v.name.slice(0, 60) : '';
  const max = typeof v.max === 'number' && Number.isFinite(v.max) ? v.max : DEFAULT_ULT.max;
  const charges = typeof v.charges === 'number' && Number.isFinite(v.charges) ? v.charges : 0;
  // Entries from before the Actions card knew the ult have neither: they stay off the card, as before.
  const kind = ULT_KINDS.find((k) => k === v.kind) ?? 'none';
  const text = typeof v.text === 'string' ? v.text.slice(0, MAX_TEXT) : '';
  return withCharges(withMax({ name, max, charges: 0, kind, text }, max), charges);
}

/** The rule text's lines for the Actions card: one paragraph per typed line, blank lines dropped. */
export const ultLines = (ult: UltCharges): string[] =>
  ult.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
