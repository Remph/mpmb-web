/* eslint-disable ts-patterns/no-magic-numbers -- dates and counts are the test data */
// The character store on a stand-in IndexedDB (fake-indexeddb), and backup files.
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, test } from 'vitest';
import { CHARACTER_FORMAT, FORMAT_VERSION } from '../engine/sheet-data.ts';
import type { CharacterData } from '../engine/sheet-data.ts';
import { SHEET_ID } from '../engine/sheet-id.ts';
import { BackupError, backupFileName, filledPdfName, makeBackup, planRestore, readBackup } from './backup.ts';
import { CharacterStore, describeCharacter } from './characters.ts';
import type { PreviousVersion, StoredCharacter } from './characters.ts';

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

  test('adds the level to a class text without one, as MPMB writes classes', () => {
    const only = describeCharacter(
      sheetOf({ 'Class and Levels': 'Evoker', 'Character Level': '10' }),
      NO_ADD_ONS,
      null,
    );
    expect(only.classes).toBe('Evoker 10');
    const both = sheetOf({ 'Class and Levels': 'Paladin 8, Warlock 2', 'Character Level': '10' });
    expect(describeCharacter(both, NO_ADD_ONS, null).classes).toBe('Paladin 8, Warlock 2');
  });

  test('copies the add-ons, so a reactive proxy from the page never reaches IndexedDB', () => {
    const addOns = { files: ['2026/10/29 - x.js'], manual: true };
    const meta = describeCharacter(sheetOf({}), addOns, null);
    expect(meta.addOns).toEqual(addOns);
    expect(meta.addOns).not.toBe(addOns);
    expect(meta.addOns.files).not.toBe(addOns.files);
  });

  test('keeps the homebrew values (ult charges) across saves, as a copy', () => {
    const homebrew = { ult: { name: 'Oathbound Judgement', max: 30, charges: 18 } };
    const meta = describeCharacter(sheetOf({}), NO_ADD_ONS, { id: 'a', created: '2026-01-01T00:00:00.000Z', homebrew });
    expect(meta.homebrew).toEqual(homebrew);
    expect(meta.homebrew?.ult).not.toBe(homebrew.ult);
    expect(describeCharacter(sheetOf({}), NO_ADD_ONS, null)).not.toHaveProperty('homebrew');
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

  test('an update to a new sheet is saved with the copy from before; deleting takes both', async () => {
    const store = await fresh();
    const before = character('Anna', '2026-10-01T00:00:00Z');
    await store.put(before);
    const sheetUpdate = { from: '24.2.0', to: '24.3.0', date: '2026-11-04T00:00:00Z', seen: false, changes: 1 };
    const data = { ...before.data, info: { ...before.data.info, SheetVersion: '24.3.0' } };
    const after = { meta: describeCharacter(data, NO_ADD_ONS, { ...before.meta, sheetUpdate }), data };
    const previous: PreviousVersion = {
      ...before,
      summary: 'Some things that you adjusted manually …',
      changes: [{ field: 'Extra.Notes', before: 'Test Notes', now: '' }],
    };
    await store.putUpdated(after, previous);
    expect(await store.get('anna')).toEqual(after);
    expect((await store.list())[0]?.sheetUpdate).toEqual(sheetUpdate);
    expect(await store.previous('anna')).toEqual(previous);
    await store.delete('anna');
    expect(await store.previous('anna')).toBeUndefined();
  });

  test('undo puts the copy from before back and drops it; keeping changes only the list entry', async () => {
    const store = await fresh();
    const before = character('Anna', '2026-10-01T00:00:00Z');
    const sheetUpdate = { from: '24.2.0', to: '24.3.0', date: '2026-11-04T00:00:00Z', seen: false, changes: 0 };
    const after = { meta: { ...before.meta, sheetUpdate }, data: before.data };
    await store.putUpdated(after, { ...before, summary: '', changes: [] });
    await store.putMeta({ ...after.meta, sheetUpdate: { ...sheetUpdate, seen: true } });
    expect((await store.get('anna'))?.meta.sheetUpdate?.seen).toBe(true);
    expect(await store.previous('anna')).toBeDefined();
    const undone = { ...before.meta, sheetUpdate: { ...sheetUpdate, seen: true, undone: true } };
    await store.putBack({ meta: undone, data: before.data });
    expect(await store.get('anna')).toEqual({ meta: undone, data: before.data });
    expect(await store.previous('anna')).toBeUndefined();
  });

  test('a database of the first version (before M11) opens with its characters and gets the new store', async () => {
    const browser = new IDBFactory();
    const request = browser.open('mpmb-web', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('meta', { keyPath: 'id' });
      request.result.createObjectStore('data');
    };
    const old = await new Promise<IDBDatabase>((resolve) => (request.onsuccess = () => resolve(request.result)));
    const anna = character('Anna', '2026-10-01T00:00:00Z');
    const tx = old.transaction(['meta', 'data'], 'readwrite');
    tx.objectStore('meta').put(anna.meta);
    tx.objectStore('data').put(anna.data, 'anna');
    await new Promise((resolve) => (tx.oncomplete = resolve));
    old.close();
    const store = await CharacterStore.open(browser);
    expect(await store.get('anna')).toEqual(anna);
    expect(await store.previous('anna')).toBeUndefined();
  });

  test('putting a character with a known id replaces it', async () => {
    const store = await fresh();
    await store.put(character('Anna', '2026-10-01T00:00:00Z'));
    await store.put(character('Anna the Bold', '2026-10-02T00:00:00Z', 'anna'));
    expect((await store.list()).map((m) => m.name)).toEqual(['Anna the Bold']);
  });

  test('a newer version in another tab: the old tab lets go and is told, the new one opens', async () => {
    const browser = new IDBFactory();
    let replaced = 0;
    const old = await CharacterStore.open(browser, 'mpmb-web', { replaced: () => replaced++ });
    await old.put(character('Anna', '2026-10-01T00:00:00Z'));
    // The next release's tab, one database version up: before the fix its opening never finished.
    const newer = await CharacterStore.open(browser, 'mpmb-web', {}, 3);
    expect(replaced).toBe(1);
    expect((await newer.list()).map((m) => m.name)).toEqual(['Anna']);
  });

  test('an older tab that does not let go: the new tab is told it waits', async () => {
    const browser = new IDBFactory();
    // A raw connection without the store's handler stands in for a tab of an older release.
    const raw = await new Promise<IDBDatabase>((resolve) => {
      const request = browser.open('mpmb-web', 2);
      request.onsuccess = () => resolve(request.result);
    });
    let blocked = 0;
    const opening = CharacterStore.open(browser, 'mpmb-web', { blocked: () => blocked++ }, 3);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(blocked).toBe(1);
    // Closing the other tab lets the opening go on.
    raw.close();
    expect(await (await opening).list()).toEqual([]);
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

  test('characters of an older sheet the app keeps can be restored; those of an unknown version not', () => {
    const anna = character('Anna', '2026-10-01T00:00:00Z');
    const onOlder = (version: string): StoredCharacter => ({
      ...anna,
      data: { ...anna.data, info: { ...anna.data.info, SheetVersion: version } },
    });
    const made = (sheetVersion: string, ...characters: StoredCharacter[]): string =>
      JSON.stringify(makeBackup(characters, { type: SHEET_ID.type, version: sheetVersion }, now));
    const KEPT = ['24.1.0'];
    // Made by the app before its update to the current version.
    expect(readBackup(made('24.1.0', onOlder('24.1.0')), SHEET_ID, KEPT).characters).toHaveLength(1);
    // Made after the update, with a character not opened since.
    expect(readBackup(made(SHEET_ID.version, anna, onOlder('24.1.0')), SHEET_ID, KEPT).characters).toHaveLength(2);
    expect(() => readBackup(made('24.1.0', onOlder('24.1.0')), SHEET_ID)).toThrow('wrong-sheet');
    expect(() => readBackup(made(SHEET_ID.version, onOlder('23.9.0')), SHEET_ID, KEPT)).toThrow(
      'wrong-sheet: Colorful - A4 v23.9.0',
    );
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
    // A list entry the start page can't draw (here without its add-ons) is refused, not stored.
    const anna = character('Anna', '2026-10-01T00:00:00Z');
    const { addOns: _dropped, ...withoutAddOns } = anna.meta;
    expect(problem(JSON.stringify({ ...good, characters: [{ ...anna, meta: withoutAddOns }] }))).toBe('not-a-backup');
    expect(problem(JSON.stringify({ ...good, characters: [{ ...anna, meta: { ...anna.meta, name: null } }] }))).toBe(
      'not-a-backup',
    );
  });

  test('file names: the character for one, "backup" for more, and the day', () => {
    const anna = character('Zoë Ånneliese & Co.', '2026-10-01T00:00:00Z');
    expect(backupFileName([anna], now)).toBe('mpmb-web-zoe-anneliese-co-2026-10-29.json');
    expect(backupFileName([anna, anna], now)).toBe('mpmb-web-backup-2026-10-29.json');
    expect(backupFileName([character('', '2026-10-01T00:00:00Z', 'x')], now)).toBe('mpmb-web-backup-2026-10-29.json');
  });

  test('a filled MPMB PDF is named after the character and the day', () => {
    expect(filledPdfName('Zoë Ånneliese & Co.', now)).toBe('zoe-anneliese-co-mpmb-2026-10-29.pdf');
    expect(filledPdfName('', now)).toBe('character-mpmb-2026-10-29.pdf');
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
