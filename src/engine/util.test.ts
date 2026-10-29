/* eslint-disable ts-patterns/no-magic-numbers -- dates and numbers are the test data */
import { describe, expect, test } from 'vitest';
import { acrobatValue, formatNumber, printd, printf, scand } from './util.ts';

const DATE = new Date(2026, 9, 29, 18, 5, 7);

describe('printd', () => {
  test.each([
    ['yyyy-mm-dd', '2026-10-29'],
    ['d mmm yy', '29 Oct 26'],
    ['dddd, mmmm d', 'Thursday, October 29'],
    ['h:MM tt', '6:05 pm'],
    ['HH:MM:ss', '18:05:07'],
    ['\\d\\a\\y d', 'day 29'],
  ])('%s', (format, text) => {
    expect(printd(format, DATE)).toBe(text);
  });

  test('presets', () => {
    expect(printd(0, DATE)).toBe('D:20261029180507');
    expect(printd(2, DATE)).toBe('10/29/26 6:05:07 pm');
  });
});

describe('scand', () => {
  test('reads what printd writes', () => {
    expect(scand('yyyy-mm-dd HH:MM:ss', printd('yyyy-mm-dd HH:MM:ss', DATE))).toEqual(DATE);
    expect(scand('mmm d, yyyy', 'Oct 29, 2026')).toEqual(new Date(2026, 9, 29));
  });

  test('two-digit years: below 50 are 20xx', () => {
    expect(scand('yy-mm-dd', '26-10-29')?.getFullYear()).toBe(2026);
    expect(scand('yy-mm-dd', '75-10-29')?.getFullYear()).toBe(1975);
  });

  test('12-hour clock', () => {
    expect(scand('h:MM tt', '6:05 pm')?.getHours()).toBe(18);
  });

  test('rejects text that does not fit, and days that do not exist', () => {
    expect(scand('yyyy-mm-dd', '2026-10-29x')).toBeNull();
    expect(scand('yyyy-mm-dd', 'yesterday')).toBeNull();
    expect(scand('yyyy-mm-dd', '2026-02-31')).toBeNull();
  });
});

describe('numbers', () => {
  test('formatNumber in the four separator styles', () => {
    expect([0, 1, 2, 3].map((style) => formatNumber(-1234567.891, 2, style))).toEqual([
      '-1,234,567.89',
      '-1234567.89',
      '-1.234.567,89',
      '-1234567,89',
    ]);
  });

  test.each([
    ['%d', [12.7], '12'],
    ['%.2f', [1234.5], '1234.50'],
    ['%,0.1f', [1234.5], '1,234.5'],
    ['%+d', [3], '+3'],
    ['%+d', [-3], '-3'],
    ['%05d', [42], '00042'],
    ['%5s|', ['ab'], '   ab|'],
    ['%x', [255], 'ff'],
    ['%s of %s, 100%%', ['1', '2'], '1 of 2, 100%'],
  ])('printf(%s)', (format, args, text) => {
    expect(printf(format, ...args)).toBe(text);
  });

  test('field values: plain decimal numbers become numbers, everything else stays text', () => {
    expect(['4', '-1', '2.5', '.5', '007'].map(acrobatValue)).toEqual([4, -1, 2.5, 0.5, 7]);
    expect(['', ' ', '+2', '1e3', '0x10', '1,5', 'Infinity'].map(acrobatValue)).toEqual([
      '',
      ' ',
      '+2',
      '1e3',
      '0x10',
      '1,5',
      'Infinity',
    ]);
  });
});
