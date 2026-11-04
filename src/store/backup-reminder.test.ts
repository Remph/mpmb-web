/* eslint-disable ts-patterns/no-magic-numbers -- dates are the test data */
import { describe, expect, test } from 'vitest';
import { backupDue, dueForBackup, isSafari } from './backup-reminder.ts';
import type { CharacterMeta } from './characters.ts';

const NOW = new Date('2026-11-10T12:00:00Z');
const meta = (fields: Partial<CharacterMeta>): CharacterMeta => ({
  id: fields.name ?? 'x',
  name: 'x',
  classes: '',
  species: '',
  addOns: { files: [], manual: false },
  created: '2026-11-01T12:00:00.000Z',
  updated: '2026-11-01T12:00:00.000Z',
  ...fields,
});

describe('backupDue', () => {
  test('never backed up: due once it is more than 3 days old', () => {
    expect(backupDue(meta({ created: '2026-11-01T12:00:00.000Z' }), NOW)).toBe(true);
    expect(backupDue(meta({ created: '2026-11-08T12:00:00.000Z', updated: '2026-11-09T12:00:00.000Z' }), NOW)).toBe(
      false,
    );
  });

  test('changed after an old backup: due', () => {
    const after = meta({ lastBackup: '2026-11-02T12:00:00.000Z', updated: '2026-11-09T12:00:00.000Z' });
    expect(backupDue(after, NOW)).toBe(true);
  });

  test('changed after a recent backup: waits', () => {
    const recent = meta({ lastBackup: '2026-11-09T12:00:00.000Z', updated: '2026-11-10T11:00:00.000Z' });
    expect(backupDue(recent, NOW)).toBe(false);
  });

  test('not changed since an old backup: nothing to do', () => {
    const same = meta({ lastBackup: '2026-11-02T12:00:00.000Z', updated: '2026-11-01T12:00:00.000Z' });
    expect(backupDue(same, NOW)).toBe(false);
  });
});

test('dueForBackup keeps the list order', () => {
  const list = [
    meta({ name: 'a', lastBackup: '2026-11-02T00:00:00.000Z', updated: '2026-11-09T00:00:00.000Z' }),
    meta({ name: 'b', lastBackup: '2026-11-09T00:00:00.000Z', updated: '2026-11-09T00:00:00.000Z' }),
    meta({ name: 'c' }),
  ];
  expect(dueForBackup(list, NOW).map((m) => m.name)).toEqual(['a', 'c']);
});

test('isSafari: Safari on the iPad and the Mac, not the other browsers', () => {
  const ipad =
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  // iPadOS asks for desktop sites: it says Macintosh.
  const ipadDesktop =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const chrome =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
  const chromeIos =
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1';
  const firefox = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0';
  expect([ipad, ipadDesktop, chrome, chromeIos, firefox].map(isSafari)).toEqual([true, true, false, false, false]);
});
