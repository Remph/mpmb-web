// Texts the play view, the print sheet and the Build screen show for values MPMB keeps in English or as
// numbers. One place, so the same value reads the same on every screen.
import { fill } from '../i18n.ts';
import type { Texts } from '../i18n.ts';
import { recoveryKind } from './read.ts';

/** MPMB's usual recovery texts in the page's language, any other as MPMB wrote it ("7 days"). */
export function recoveryText(recovery: string, t: Texts): string {
  const kind = recoveryKind(recovery);
  if (kind === 'long') return t.recoveryLong;
  if (kind === 'short') return t.recoveryShort;
  if (kind === 'dawn') return t.recoveryDawn;
  return recovery;
}

/** A spell level's heading: "Cantrips" for 0, "Level 3" (or "3. Grad") for the others. */
export const spellLevelName = (level: number, t: Texts): string =>
  level === 0 ? t.cantrips : fill(t.slotLevel, { count: level });
