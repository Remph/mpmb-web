import { describe, expect, test } from 'vitest';
import { ui } from './i18n.ts';
import { CHARACTER_FORMAT, FORMAT_VERSION } from './engine/sheet-data.ts';
import type { CharacterData } from './engine/sheet-data.ts';
import { SHEET_ID } from './engine/sheet-id.ts';
import { BackupError } from './store/backup.ts';
import { describeCharacter } from './store/characters.ts';
import type { StoredCharacter } from './store/characters.ts';
import { EngineError } from './worker/client.ts';
import { UpdateStopped, backupFailureText, failureText, restoreLines, sameNamed } from './session-texts.ts';

const { en, de } = ui;

const stored = (name: string): StoredCharacter => {
  const data: CharacterData = {
    format: CHARACTER_FORMAT,
    version: FORMAT_VERSION,
    info: { SheetType: SHEET_ID.type, SheetVersion: SHEET_ID.version },
    numPages: 6,
    fields: { 'PC Name': { value: name } },
  };
  return { meta: describeCharacter(data, { files: [], manual: false }, null), data };
};

describe('failure texts', () => {
  test('name what went wrong with a PDF', () => {
    expect(failureText(new EngineError('bad', 'unreadable-pdf'), en)).toBe(en.unreadablePdf);
    expect(failureText(new EngineError('no', 'wrong-sheet', 'Printer Friendly v24.2.0'), en)).toBe(
      `This is not a Colorful A4 sheet, version ${SHEET_ID.version} (it is Printer Friendly v24.2.0).`,
    );
    expect(failureText(new EngineError('no', 'wrong-sheet'), de)).toBe(
      `Das ist kein Colorful-A4-Bogen in Version ${SHEET_ID.version}.`,
    );
  });

  test("pass on the engine's reason, and MPMB's own when its import stopped", () => {
    expect(failureText(new EngineError('MPMB threw'), en)).toBe('The sheet could not be opened: MPMB threw');
    expect(failureText(new UpdateStopped('MPMB stopped the import'), de)).toBe('MPMB stopped the import');
  });

  test('call anything else a storage problem', () => {
    expect(failureText(new Error('QuotaExceededError'), en)).toBe(
      en.storageFailed.replace('{reason}', 'QuotaExceededError'),
    );
    expect(failureText('odd', de)).toBe(de.storageFailed.replace('{reason}', 'odd'));
  });

  test('explain a backup that can not be restored', () => {
    expect(backupFailureText(new BackupError('not-a-backup'), en)).toBe(en.notABackup);
    expect(backupFailureText(new BackupError('newer-backup'), de)).toBe(de.newerBackup);
    expect(backupFailureText(new BackupError('wrong-sheet', 'Other v1'), en)).toContain('Other v1');
    expect(backupFailureText(new Error('full'), en)).toBe(en.storageFailed.replace('{reason}', 'full'));
  });
});

describe('restore lines', () => {
  test('say per character whether it is new, replaces one here, or replaces a newer one', () => {
    const plan = [
      { character: stored('Anna'), replaces: false, older: false },
      { character: stored('Bert'), replaces: true, older: false },
      { character: stored(''), replaces: true, older: true },
    ];
    expect(restoreLines(plan, en)).toEqual([
      en.restoreNew.replace('{name}', 'Anna'),
      en.restoreReplaces.replace('{name}', 'Bert'),
      en.restoreOlder.replace('{name}', en.unnamed),
    ]);
  });
});

describe('same character', () => {
  test('is the first saved one with the same name; no name matches nothing', () => {
    const list = [
      { id: 'a', name: 'Anna' },
      { id: 'b', name: '' },
      { id: 'c', name: 'Anna' },
    ];
    expect(sameNamed(list, 'Anna')?.id).toBe('a');
    expect(sameNamed(list, 'Bert')).toBeNull();
    expect(sameNamed(list, '')).toBeNull();
  });
});
