/* eslint-disable ts-patterns/no-magic-numbers -- dates and counts are the test data */
import { describe, expect, test } from 'vitest';
import { CHARACTER_FORMAT, FORMAT_VERSION } from '../engine/sheet-data.ts';
import type { CharacterData } from '../engine/sheet-data.ts';
import { SHEET_ID } from '../engine/sheet-id.ts';
import { KEEP_POINTS, pointHp, pointNeeded, pointWhen, surplus } from './restore-points.ts';
import type { RestorePoint } from './restore-points.ts';

const sheetOf = (fields: Record<string, string>): CharacterData => ({
  format: CHARACTER_FORMAT,
  version: FORMAT_VERSION,
  info: { SheetType: SHEET_ID.type, SheetVersion: SHEET_ID.version },
  numPages: 6,
  fields: Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, { value }])),
});

describe('pointNeeded', () => {
  const newest = { meta: { updated: '2026-11-01T00:00:00.000Z' } } as RestorePoint;
  test('the first point, and one after a change, are taken; one without a change is not', () => {
    expect(pointNeeded({ updated: '2026-11-01T00:00:00.000Z' }, undefined)).toBe(true);
    expect(pointNeeded({ updated: '2026-11-02T00:00:00.000Z' }, newest)).toBe(true);
    expect(pointNeeded({ updated: '2026-11-01T00:00:00.000Z' }, newest)).toBe(false);
  });
});

test('surplus: all but the newest three, in any order given', () => {
  const points = ['2026-11-03', '2026-11-01', '2026-11-04', '2026-11-02', '2026-10-30'].map((at) => ({ at }));
  expect(KEEP_POINTS).toBe(3);
  expect(surplus(points).map((p) => p.at)).toEqual(['2026-11-01', '2026-10-30']);
  expect(surplus(points.slice(0, 3))).toEqual([]);
});

test('pointHp: current and maximum; an empty current is full; none without a maximum', () => {
  expect(pointHp(sheetOf({ 'HP Max': '62', 'HP Current': '31' }))).toEqual({ now: '31', max: '62' });
  expect(pointHp(sheetOf({ 'HP Max': '62' }))).toEqual({ now: '62', max: '62' });
  expect(pointHp(sheetOf({}))).toBeNull();
});

describe('pointWhen', () => {
  // Local times, so the test reads the same in every time zone.
  const now = new Date(2026, 10, 8, 20, 0);
  test('today by name, other days by weekday and date, another year with the year', () => {
    expect(pointWhen(new Date(2026, 10, 8, 19, 42).toISOString(), now, 'en-GB', 'Today')).toBe('Today, 19:42');
    expect(pointWhen(new Date(2026, 10, 5, 21, 10).toISOString(), now, 'en-GB', 'Today')).toBe('Thu 5 Nov, 21:10');
    expect(pointWhen(new Date(2025, 11, 31, 9, 5).toISOString(), now, 'en-GB', 'Today')).toBe(
      'Wed, 31 Dec 2025, 09:05',
    );
    expect(pointWhen(new Date(2026, 10, 5, 21, 10).toISOString(), now, 'de', 'Heute')).toBe('Do., 5. Nov., 21:10');
  });
});
