/* eslint-disable ts-patterns/no-magic-numbers -- dates and counts are the test data */
// The character store on a stand-in IndexedDB (fake-indexeddb), and backup files.
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, test } from 'vitest';
import { CHARACTER_FORMAT, FORMAT_VERSION } from '../engine/sheet-data.ts';
import type { CharacterData } from '../engine/sheet-data.ts';
import { SHEET_ID } from '../engine/sheet-id.ts';
import { BackupError, backupFileName, makeBackup, planRestore, readBackup } from './backup.ts';
import { CharacterStore, describeCharacter } from './characters.ts';
import type { StoredCharacter } from './characters.ts';

const sheetOf = (fields: Record<string, string>): CharacterData => ({
  format: CHARACTER_FORMAT,
  version: FORMAT_VERSION,
  info: { SheetType: SHEET_ID.type, SheetVersion: SHEET_ID.version },
  numPages: 6,
  fields: Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, { value }])),
});

const NO_ADD_ONS = { files: [], manual: false };

const character = (name: string, day: string, id = name.toLowerCase()): StoredCharacter => {
  const data = sheetOf({ 'PC Name': name, 'Class and Levels': 'Wizard 3', Race: 'Elf' });
  return { meta: describeCharacter(data, NO_ADD_ONS, { id, created: day }, new Date(day)), data };
};

describe('describeCharacter', () => {
  test('takes name, class and species from the sheet and keeps id and creation date', () => {
    const data = sheetOf({ 'PC Name': ' Anna ', 'Class and Levels': 'Paladin 8, Warlock 2', Race: 'Human' });
    const now = new Date('2026-10-29T12:00:00Z');
    expect(describeCharacter(data, NO_ADD_ONS, { id: 'a', created: '2026-01-01T00:00:00.000Z' }, now)).toEqual({
      id: 'a',
      name: 'Anna',
      classes: 'Paladin 8, Warlock 2',
      species: 'Human',
      addOns: NO_ADD_ONS,
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-10-29T12:00:00.000Z',
    });
  });

  test('copies the add-ons, so a reactive proxy from the page never reaches IndexedDB', () => {
    const addOns = { files: ['2026/10/29 - x.js'], manual: true };
    const meta = describeCharacter(sheetOf({}), addOns, null);
    expect(meta.addOns).toEqual(addOns);
    expect(meta.addOns).not.toBe(addOns);
    expect(meta.addOns.files).not.toBe(addOns.files);
  });

  test('a new character gets a new id; empty fields give empty texts', () => {
    const one = describeCharacter(sheetOf({}), NO_ADD_ONS, null);
    const two = describeCharacter(sheetOf({}), NO_ADD_ONS, null);
    expect(one.id).not.toBe(two.id);
    expect(one).toMatchObject({ name: '', classes: '', species: '' });
    expect(one.created).toBe(one.updated);
  });
});

describe('CharacterStore', () => {
  const fresh = (): Promise<CharacterStore> => CharacterStore.open(new IDBFactory());

  test('keeps characters, lists the last changed first, and deletes them', async () => {
    const store = await fresh();
    const anna = character('Anna', '2026-10-01T00:00:00Z');
    const bo = character('Bo', '2026-10-20T00:00:00Z');
    await store.put(anna, bo);
    expect((await store.list()).map((m) => m.name)).toEqual(['Bo', 'Anna']);
    expect(await store.get('anna')).toEqual(anna);
    await store.delete('bo');
    expect((await store.list()).map((m) => m.name)).toEqual(['Anna']);
    expect(await store.get('bo')).toBeUndefined();
  });

  test('what is stored is still there when the page opens the database again (a reload)', async () => {
    const browser = new IDBFactory();
    const before = await CharacterStore.open(browser);
    await before.put(character('Anna', '2026-10-01T00:00:00Z'));
    before.close();
    const after = await CharacterStore.open(browser);
    expect((await after.get('anna'))?.data.fields['PC Name']).toEqual({ value: 'Anna' });
  });

  test('putting a character with a known id replaces it', async () => {
    const store = await fresh();
    await store.put(character('Anna', '2026-10-01T00:00:00Z'));
    await store.put(character('Anna the Bold', '2026-10-02T00:00:00Z', 'anna'));
    expect((await store.list()).map((m) => m.name)).toEqual(['Anna the Bold']);
  });
});

describe('backups', () => {
  const now = new Date('2026-10-29T12:00:00Z');

  test('a backup reads back as it was written, and names the sheet', () => {
    const backup = makeBackup([character('Anna', '2026-10-01T00:00:00Z')], SHEET_ID, now);
    const read = readBackup(JSON.stringify(backup), SHEET_ID);
    expect(read).toEqual(backup);
    expect(read.sheet).toEqual({ type: 'Colorful - A4', version: '24.2.0' });
  });

  test('refuses what it cannot restore, saying why', () => {
    const problem = (text: string): string => {
      try {
        readBackup(text, SHEET_ID);
        return 'restored';
      } catch (err) {
        return err instanceof BackupError ? `${err.problem} ${err.detail}`.trim() : String(err);
      }
    };
    const good = makeBackup([character('Anna', '2026-10-01T00:00:00Z')], SHEET_ID, now);
    expect(problem('%PDF-1.7')).toBe('not-a-backup');
    expect(problem('{"some":"json"}')).toBe('not-a-backup');
    expect(problem(JSON.stringify({ ...good, version: 2 }))).toBe('newer-backup');
    expect(problem(JSON.stringify({ ...good, sheet: { type: 'Printer Friendly', version: '24.2.0' } }))).toBe(
      'wrong-sheet Printer Friendly v24.2.0',
    );
    expect(problem(JSON.stringify({ ...good, characters: [] }))).toBe('not-a-backup');
    expect(problem(JSON.stringify({ ...good, characters: [{ meta: { id: 'x' }, data: {} }] }))).toBe('not-a-backup');
  });

  test('file names: the character for one, "backup" for more, and the day', () => {
    const anna = character('Zoë Ånneliese & Co.', '2026-10-01T00:00:00Z');
    expect(backupFileName([anna], now)).toBe('mpmb-web-zoe-anneliese-co-2026-10-29.json');
    expect(backupFileName([anna, anna], now)).toBe('mpmb-web-backup-2026-10-29.json');
    expect(backupFileName([character('', '2026-10-01T00:00:00Z', 'x')], now)).toBe('mpmb-web-backup-2026-10-29.json');
  });

  test('restoring adds new characters and replaces those with the same id, warning when older', () => {
    const backup = makeBackup(
      [character('Anna', '2026-10-01T00:00:00Z'), character('Bo', '2026-10-20T00:00:00Z')],
      SHEET_ID,
      now,
    );
    const plan = planRestore(backup, [{ id: 'anna', updated: '2026-10-05T00:00:00.000Z' }]);
    expect(plan.map((p) => [p.character.meta.name, p.replaces, p.older])).toEqual([
      ['Anna', true, true],
      ['Bo', false, false],
    ]);
  });
});
