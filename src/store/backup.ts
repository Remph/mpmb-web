// Backup files: characters as JSON, to keep them safe and to move them to another device. A backup
// names the sheet (type and version) its characters were saved with, because a character is stored
// as its differences from exactly that blank sheet.
import { CHARACTER_FORMAT, FORMAT_VERSION } from '../engine/sheet-data.ts';
import type { SheetId } from '../engine/sheet-id.ts';
import type { StoredCharacter } from './characters.ts';

export const BACKUP_FORMAT = 'mpmb-web-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  /** ISO date. */
  created: string;
  sheet: SheetId;
  characters: StoredCharacter[];
}

/** Why a file can't be restored, for the page to explain in the player's language. */
export type BackupProblem =
  /** Not JSON, or JSON of something else. */
  | 'not-a-backup'
  /** Made by a newer version of the app. */
  | 'newer-backup'
  /** Characters of another sheet type or version (`detail`: which). */
  | 'wrong-sheet';

export class BackupError extends Error {
  constructor(
    readonly problem: BackupProblem,
    readonly detail = '',
  ) {
    super(`${problem}${detail ? `: ${detail}` : ''}`);
  }
}

export function makeBackup(characters: StoredCharacter[], sheet: SheetId, now = new Date()): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    created: now.toISOString(),
    sheet: { type: sheet.type, version: sheet.version },
    characters,
  };
}

/**
 * Accents left alone after NFKD splits "é" into "e" plus a combining mark: matches the mark in "é",
 * not "e". Try it: https://regex101.com/?regex=%5B%5Cu0300-%5Cu036f%5D&testString=e%CC%81
 */
const COMBINING_MARKS = /[\u0300-\u036f]/g;
/** Each run of anything but ASCII letters and digits: matches " & " in "Anna & Bo", not "Anna". */
const NOT_FILE_SAFE = /[^A-Za-z0-9]+/g;
/** A dash at either end: matches the last character of "anna-", not the dash in "an-na". */
const EDGE_DASHES = /^-|-$/g;

/** Letters, digits and dashes only: the name works as a file name on every system. */
const fileSafe = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(NOT_FILE_SAFE, '-')
    .replace(EDGE_DASHES, '')
    .toLowerCase();

const NAME_LENGTH = 40;
/** "2026-10-29" from an ISO date. */
const DAY_LENGTH = 10;

/** "mpmb-web-anna-2026-10-29.json" for one character, "mpmb-web-backup-2026-10-29.json" for more. */
export function backupFileName(characters: StoredCharacter[], now = new Date()): string {
  const day = now.toISOString().slice(0, DAY_LENGTH);
  const only = characters.length === 1 ? fileSafe(characters[0]?.meta.name ?? '').slice(0, NAME_LENGTH) : '';
  return `mpmb-web-${only || 'backup'}-${day}.json`;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Checks what a character entry must have; the engine checks the sheet data itself when it opens. */
function isCharacter(value: unknown): value is StoredCharacter {
  if (!isObject(value) || !isObject(value.meta) || !isObject(value.data)) return false;
  const { meta, data } = value;
  return (
    typeof meta.id === 'string' &&
    meta.id !== '' &&
    typeof meta.updated === 'string' &&
    data.format === CHARACTER_FORMAT &&
    data.version === FORMAT_VERSION &&
    isObject(data.fields)
  );
}

/** Reads a backup file's text; throws a BackupError when it can't be restored here. */
export function readBackup(text: string, sheet: SheetId): Backup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('not-a-backup');
  }
  if (!isObject(parsed) || parsed.format !== BACKUP_FORMAT || typeof parsed.version !== 'number')
    throw new BackupError('not-a-backup');
  if (parsed.version > BACKUP_VERSION) throw new BackupError('newer-backup');
  const from = isObject(parsed.sheet) ? parsed.sheet : {};
  if (from.type !== sheet.type || from.version !== sheet.version)
    throw new BackupError('wrong-sheet', `${String(from.type)} v${String(from.version)}`);
  const characters = Array.isArray(parsed.characters) ? parsed.characters : [];
  if (!characters.length || !characters.every(isCharacter)) throw new BackupError('not-a-backup');
  return parsed as unknown as Backup;
}

/** What restoring would do with each character: add it, or replace the one with the same id. */
export function planRestore(
  backup: Backup,
  existing: { id: string; updated: string }[],
): { character: StoredCharacter; replaces: boolean; older: boolean }[] {
  const here = new Map(existing.map((m) => [m.id, m.updated]));
  return backup.characters.map((character) => {
    const updated = here.get(character.meta.id);
    return {
      character,
      replaces: updated !== undefined,
      // The backup's copy is older than the one here: restoring it loses the newer changes.
      older: updated !== undefined && character.meta.updated < updated,
    };
  });
}
