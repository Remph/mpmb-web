// When the start page reminds the player to back up (tech review 2026-11-04, finding 1; Nick picked the
// line above the list, 2026-11-04). Characters live only in this browser: clearing the site's data, or
// Safari's rule that deletes a site's storage after 7 days of Safari use without a visit, takes them
// with it. Only a backup file survives that.
import type { CharacterMeta } from './characters.ts';

/** How long a change may go without a backup before the line shows. */
export const BACKUP_AFTER_DAYS = 3;
/** A day in milliseconds. */
const DAY_MS = 86_400_000;

/**
 * Whether a character needs a backup: it changed after its last backup (or never had one), and that
 * backup (or, without one, its creation) is more than BACKUP_AFTER_DAYS old. A character backed up
 * yesterday and played today waits; one imported a week ago and never backed up doesn't.
 */
export function backupDue(meta: Pick<CharacterMeta, 'created' | 'updated' | 'lastBackup'>, now = new Date()): boolean {
  const since = meta.lastBackup ?? meta.created;
  const changedSince = meta.lastBackup === undefined || meta.updated > meta.lastBackup;
  return changedSince && now.getTime() - Date.parse(since) > BACKUP_AFTER_DAYS * DAY_MS;
}

/** The characters the reminder names, in the list's order. */
export function dueForBackup(characters: CharacterMeta[], now = new Date()): CharacterMeta[] {
  return characters.filter((meta) => backupDue(meta, now));
}

/**
 * Safari (on the iPad, or a Mac), where the 7-day rule applies; not Chrome, Edge or Firefox on iOS, which
 * name Safari in their user agent too but say who they are. "… Version/18.0 Mobile/15E148 Safari/604.1"
 * passes, "… CriOS/140.0 Mobile/15E148 Safari/604.1" (Chrome on the iPad) doesn't.
 * Try it: https://regex101.com/?regex=%5E%28%28%3F%21chrome%7Candroid%7Ccrios%7Cfxios%7Cedgios%29.%29%2Asafari&flags=i&testString=Mozilla%2F5.0%20%28iPad%3B%20CPU%20OS%2018_0%20like%20Mac%20OS%20X%29%20AppleWebKit%2F605.1.15%20%28KHTML%2C%20like%20Gecko%29%20Version%2F18.0%20Mobile%2F15E148%20Safari%2F604.1
 */
const SAFARI = /^((?!chrome|android|crios|fxios|edgios).)*safari/i;

export const isSafari = (userAgent: string): boolean => SAFARI.test(userAgent);
