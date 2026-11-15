/* eslint-disable ts-patterns/no-magic-numbers -- sizes are the test data */
// How a character travels (pack.ts): the sheet gzipped and back, the list entry without this browser's parts.
import { describe, expect, test } from 'vitest';
import { CHARACTER_FORMAT, FORMAT_VERSION } from '../engine/sheet-data.ts';
import type { CharacterData } from '../engine/sheet-data.ts';
import type { CharacterMeta } from '../store/characters.ts';
import { localMeta, packData, serverMeta, unpackData } from './pack.ts';

const sheet: CharacterData = {
  format: CHARACTER_FORMAT,
  version: FORMAT_VERSION,
  info: { SheetVersion: '24.2.0' },
  numPages: 6,
  // A sheet is mostly repeated field names: it packs small. Umlauts and emoji must survive the way there and back.
  fields: Object.fromEntries(
    Array.from({ length: 3000 }, (_, i) => [`Field ${i}`, { value: i % 7 ? 'Grüße 🐉' : '' }]),
  ),
};

const meta: CharacterMeta = {
  id: 'a',
  name: 'Anna',
  classes: 'Wizard 3',
  species: 'Elf',
  addOns: { files: [], manual: false },
  created: '2026-11-01T00:00:00.000Z',
  updated: '2026-11-15T18:00:00.000Z',
  lastBackup: '2026-11-10T00:00:00.000Z',
};

describe('packData', () => {
  test('the sheet comes back as it went, and much smaller than its JSON', async () => {
    const packed = await packData(sheet);
    expect(packed.startsWith('gz:')).toBe(true);
    expect(packed.length).toBeLessThan(JSON.stringify(sheet).length / 5);
    expect(await unpackData(packed)).toEqual(sheet);
  });

  test('plain JSON (a browser without CompressionStream) reads too; text that is no sheet is refused', async () => {
    expect(await unpackData(JSON.stringify(sheet))).toEqual(sheet);
    await expect(unpackData('"just text"')).rejects.toThrow();
  });
});

describe('the list entry', () => {
  test('goes out without the date of a backup made in this browser', () => {
    expect(serverMeta(meta)).not.toHaveProperty('lastBackup');
    expect(serverMeta(meta)).toMatchObject({ id: 'a', name: 'Anna', updated: meta.updated });
  });

  test('comes back with this browser’s backup date, under the id the service has it by', () => {
    const { lastBackup: _, ...sent } = meta;
    const here = { ...meta, lastBackup: '2026-11-12T00:00:00.000Z' };
    expect(localMeta({ ...sent, id: 'other' }, 'a', here)).toEqual({ ...sent, lastBackup: here.lastBackup });
    expect(localMeta(sent, 'a', undefined)).toEqual(sent);
  });

  test('a list entry that isn’t one is refused', () => {
    expect(localMeta(null, 'a', undefined)).toBeNull();
    expect(localMeta({ name: 'x' }, 'a', undefined)).toBeNull();
    expect(localMeta({ ...meta, addOns: null }, 'a', undefined)).toBeNull();
  });
});
