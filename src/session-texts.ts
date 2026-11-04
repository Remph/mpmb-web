// What the session tells the player when work on characters fails, and the questions it asks before it
// replaces characters: plain functions of the error or plan and the page's texts, so they can be tested
// without a worker or storage (session.svelte.ts runs the work).
import { fill } from './i18n.ts';
import type { Texts } from './i18n.ts';
import { SHEET_ID } from './engine/sheet-id.ts';
import { BackupError } from './store/backup.ts';
import type { StoredCharacter } from './store/characters.ts';
import { EngineError } from './worker/client.ts';

export const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Why an update failed although every command worked: MPMB's import stopped after its own pop-up. */
export class UpdateStopped extends Error {}

/** An update stopped because the player left the character (or opened another) while it ran. */
export class UpdateLeft extends Error {}

/** A failed import, opening or sheet action, in the player's words. */
export function failureText(err: unknown, t: Texts): string {
  if (err instanceof UpdateStopped) return err.message;
  if (err instanceof EngineError && err.code === 'unreadable-pdf') return t.unreadablePdf;
  if (err instanceof EngineError && err.code === 'wrong-sheet') {
    const found = err.detail ? fill(t.wrongSheetFound, { what: err.detail }) : '';
    return fill(t.wrongSheet, { version: SHEET_ID.version, found });
  }
  if (err instanceof EngineError) return fill(t.engineFailed, { reason: err.message });
  return fill(t.storageFailed, { reason: errorText(err) });
}

/** A backup file that can't be restored, in the player's words. */
export function backupFailureText(err: unknown, t: Texts): string {
  if (!(err instanceof BackupError)) return fill(t.storageFailed, { reason: errorText(err) });
  if (err.problem === 'newer-backup') return t.newerBackup;
  if (err.problem === 'wrong-sheet')
    return fill(t.wrongSheetBackup, { what: err.detail, version: `${SHEET_ID.type} v${SHEET_ID.version}` });
  return t.notABackup;
}

/** One line per character of a restore: new, replacing the one here, or replacing a newer one (a warning). */
export const restoreLines = (
  plan: { character: StoredCharacter; replaces: boolean; older: boolean }[],
  t: Texts,
): string[] =>
  plan.map(({ character, replaces, older }) => {
    const name = character.meta.name || t.unnamed;
    if (older) return fill(t.restoreOlder, { name });
    return fill(replaces ? t.restoreReplaces : t.restoreNew, { name });
  });

/**
 * The saved character an imported one probably is: the first with the same (non-empty) name. A newer PDF
 * of a character already here usually has the same name and changed classes.
 */
export const sameNamed = <T extends { name: string }>(characters: T[], name: string): T | null =>
  (name === '' ? undefined : characters.find((c) => c.name === name)) ?? null;
