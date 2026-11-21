// Slows down guessing: after a few wrong codes (or admin passwords) from one address, that address waits.
// Kept in the database, not in memory, so a restart of the service doesn't wipe the count.
//
// A try is counted before the code is checked, and the count forgotten again when it was right. Counting only
// after a wrong code let a burst through: tries sent at the same moment all passed the check before the first one
// was counted (security audit 2026-11-20, finding 04: 100 at once got 109 checked instead of 10). Now each request
// adds its own try first, so at most `max` of them in a window get as far as the check.
import type { Db } from './db.ts';
import { Refusal, TOO_MANY } from './http.ts';

/** Wrong tries an address gets before it has to wait. */
export const MAX_FAILURES = 10;
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const WINDOW_MINUTES = 15;
/** How long the count lasts, and so the longest wait. */
export const WINDOW_MS = WINDOW_MINUTES * MS_PER_MINUTE;
/** The `attempts.address` column's length (db.ts): a longer key is cut, so an odd address still counts. */
export const KEY_MAX = 80;

/** How many tries a key gets in how long. */
export interface Limit {
  max: number;
  windowMs: number;
}

/** Each address's own limit, for codes and admin passwords alike. */
export const PER_ADDRESS: Limit = { max: MAX_FAILURES, windowMs: WINDOW_MS };

/**
 * One count for the admin page from everyone together, on top of each address's own. The per-address limit rests on
 * the address the webspace's web server reports (http.ts addressOf); if a hosting change ever let callers choose
 * it, each made-up address would get fresh tries at the admin password. This ceiling still holds then. The cost:
 * someone who sends this many wrong passwords locks Nick out of /admin for up to an hour too.
 */
export const ADMIN_OVERALL: Limit = { max: 20, windowMs: 60 * MS_PER_MINUTE };
/** The overall admin count's key: every per-address key has a "kind:" prefix, so this one can't clash with them. */
export const ADMIN_ALL_KEY = 'admin-all';

interface Row {
  failures: number;
  since: number;
}

/** The table's key for an address ("login:1.2.3.4"), at most KEY_MAX characters. */
export function triesKey(kind: 'login' | 'admin', address: string): string {
  return `${kind}:${address}`.slice(0, KEY_MAX);
}

/**
 * Counts one try for `key` and refuses with 429 when that makes more than `limit.max` in the current window. A
 * count older than the window starts again at one.
 */
export async function takeTry(db: Db, key: string, now: number, limit: Limit = PER_ADDRESS): Promise<void> {
  const id = key.slice(0, KEY_MAX);
  const expired = now - limit.windowMs;
  // MySQL applies the assignments left to right: `failures` is set while `since` still holds the old time, and
  // `since` is only replaced after it, so both IFs look at the old time. The upsert locks the row, so requests at
  // the same moment each add one.
  await db.change(
    `INSERT INTO attempts (address, failures, since) VALUES (?, 1, ?)
     ON DUPLICATE KEY UPDATE
       failures = IF(since <= ?, 1, failures + 1),
       since = IF(since <= ?, ?, since)`,
    [id, now, expired, expired, now],
  );
  // Read after the write: another request may have added its try meanwhile, which can only make this one wait
  // when it needn't, never let one more through.
  const [row] = await db.rows<Row>('SELECT failures, since FROM attempts WHERE address = ?', [id]);
  if (!row || row.failures <= limit.max) return;
  const retryAfter = Math.max(1, Math.ceil((row.since + limit.windowMs - now) / MS_PER_SECOND));
  throw new Refusal(TOO_MANY, 'too many tries', { retryAfter });
}

/** Forgets the tries of `key` after a right one. */
export async function clearTries(db: Db, key: string): Promise<void> {
  await db.change('DELETE FROM attempts WHERE address = ?', [key.slice(0, KEY_MAX)]);
}
