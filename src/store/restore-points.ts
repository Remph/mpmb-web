// Restore points: copies of a character from earlier, kept in this browser so that the player can roll back
// (Remph, 2026-11-08). Every change saves the whole character at once, so "the last few saves" would be the
// last few taps; a point is taken at the big moments instead (Remph's pick): when the character is opened,
// and before the Build screen, "Start over", restoring a backup over it, or rolling back. Backup files don't
// carry them. M15's sync can add the copy that lost a clash as one more point.
import type { CharacterData } from '../engine/sheet-data.ts';
import { textOf } from './field-text.ts';
import type { CharacterMeta, StoredCharacter } from './characters.ts';

/** How many points each character keeps (Remph's number); the oldest goes when a new one comes. */
export const KEEP_POINTS = 3;

/** Why a point was taken; the window says it in the player's language. */
export type PointReason = 'opened' | 'build' | 'reset' | 'restore' | 'rollback';

export interface RestorePoint extends StoredCharacter {
  /** ISO date when the point was taken. */
  at: string;
  reason: PointReason;
}

/**
 * Whether a point is worth taking: not when the character hasn't changed since the newest point (opening it
 * five times in a row would push the older points out with five copies of the same sheet).
 */
export function pointNeeded(meta: Pick<CharacterMeta, 'updated'>, newest: RestorePoint | undefined): boolean {
  return newest?.meta.updated !== meta.updated;
}

/** The points beyond the newest KEEP_POINTS, which go; `points` in any order. */
export function surplus<T extends Pick<RestorePoint, 'at'>>(points: T[], keep = KEEP_POINTS): T[] {
  return [...points].sort((a, b) => b.at.localeCompare(a.at)).slice(keep);
}

/**
 * The hit points a point had, to tell points apart at a glance: current and maximum; null without a maximum.
 * An empty current means full, as on MPMB's sheet.
 */
export function pointHp(data: CharacterData): { now: string; max: string } | null {
  const max = textOf(data, 'HP Max');
  if (!max) return null;
  return { now: textOf(data, 'HP Current') || max, max };
}

/**
 * When a point was taken, for the list: "Today, 19:42" for today, otherwise the weekday and date
 * ("Thu 5 Nov, 21:10"); the year only when it isn't this year's.
 */
export function pointWhen(at: string, now: Date, locale: string, today: string): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return `${today}, ${time}`;
  const day = date.toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
  return `${day}, ${time}`;
}
