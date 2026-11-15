// Slows down guessing: after a few wrong codes (or admin passwords) from one address, that address waits.
// Kept in the database, not in memory, so a restart of the service doesn't wipe the count.
import type { Db } from './db.ts';
import { Refusal, TOO_MANY } from './http.ts';

/** Wrong tries an address gets before it has to wait. */
export const MAX_FAILURES = 10;
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const WINDOW_MINUTES = 15;
/** How long the count lasts, and so the longest wait. */
export const WINDOW_MS = WINDOW_MINUTES * MS_PER_MINUTE;

interface Row {
  failures: number;
  since: number;
}

/** Refuses with 429 while `key` ("login:1.2.3.4") has used up its tries in the current window. */
export async function checkTries(db: Db, key: string, now: number): Promise<void> {
  const [row] = await db.rows<Row>('SELECT failures, since FROM attempts WHERE address = ?', [key]);
  if (!row || row.failures < MAX_FAILURES || now - row.since >= WINDOW_MS) return;
  const retryAfter = Math.ceil((row.since + WINDOW_MS - now) / MS_PER_SECOND);
  throw new Refusal(TOO_MANY, 'too many tries', { retryAfter });
}

/** Counts one wrong try; a count older than the window starts again at one. */
export async function countFailure(db: Db, key: string, now: number): Promise<void> {
  const expired = now - WINDOW_MS;
  // MySQL applies the assignments left to right: `failures` is set while `since` still holds the old time, and
  // `since` is only replaced after it, so both IFs look at the old time.
  await db.change(
    `INSERT INTO attempts (address, failures, since) VALUES (?, 1, ?)
     ON DUPLICATE KEY UPDATE
       failures = IF(since <= ?, 1, failures + 1),
       since = IF(since <= ?, ?, since)`,
    [key, now, expired, expired, now],
  );
}

/** Forgets the wrong tries of `key` after a right one. */
export async function clearFailures(db: Db, key: string): Promise<void> {
  await db.change('DELETE FROM attempts WHERE address = ?', [key]);
}
