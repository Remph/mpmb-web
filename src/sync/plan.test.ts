/* eslint-disable ts-patterns/no-magic-numbers -- versions and dates are the test data */
// What a sync round does with each character (plan.ts): every case of here, there and the record between.
import { describe, expect, test } from 'vitest';
import type { ServerCharacter } from './api.ts';
import { planSync } from './plan.ts';
import type { SyncRecord } from './plan.ts';

const T1 = '2026-11-15T18:00:00.000Z';
const T2 = '2026-11-15T18:05:00.000Z';
const T3 = '2026-11-15T18:10:00.000Z';

const server = (id: string, version: number, updated: string, deleted = false): ServerCharacter => ({
  id,
  version,
  deleted,
  meta: { id, updated },
  updated: Date.parse(updated),
  device: 'iPad',
  lease: null,
});
const records = (entries: Record<string, SyncRecord>) => new Map(Object.entries(entries));

describe('planSync with the service list', () => {
  test('a character new here goes out as version 0; one new there comes in', () => {
    const steps = planSync([{ id: 'a', updated: T1 }], records({}), [server('b', 3, T2)]);
    expect(steps).toEqual([
      { kind: 'push', id: 'a', version: 0 },
      { kind: 'download', id: 'b', server: server('b', 3, T2) },
    ]);
  });

  test('the same version on both sides: nothing, or the change made here', () => {
    const there = [server('a', 2, T1)];
    expect(planSync([{ id: 'a', updated: T1 }], records({ a: { version: 2, pushed: T1 } }), there)).toEqual([]);
    expect(planSync([{ id: 'a', updated: T2 }], records({ a: { version: 2, pushed: T1 } }), there)).toEqual([
      { kind: 'push', id: 'a', version: 2 },
    ]);
  });

  test('newer there: unchanged here takes it; changed here too is a clash (the player picks)', () => {
    const there = [server('a', 3, T3)];
    const record = records({ a: { version: 2, pushed: T1 } });
    expect(planSync([{ id: 'a', updated: T1 }], record, there)).toEqual([
      { kind: 'download', id: 'a', server: there[0] },
    ]);
    expect(planSync([{ id: 'a', updated: T2 }], record, there)).toEqual([{ kind: 'clash', id: 'a', server: there[0] }]);
  });

  test('the character open here for changes is only ever pushed, never swapped under the player', () => {
    const there = [server('a', 3, T3)];
    const hold = new Set(['a']);
    expect(planSync([{ id: 'a', updated: T1 }], records({ a: { version: 2, pushed: T1 } }), there, hold)).toEqual([]);
    expect(planSync([{ id: 'a', updated: T2 }], records({ a: { version: 2, pushed: T1 } }), there, hold)).toEqual([
      { kind: 'push', id: 'a', version: 2 },
    ]);
  });

  test('deleted there: gone here too, unless changed here, which brings it back', () => {
    const there = [server('a', 4, T2, true)];
    const record = records({ a: { version: 3, pushed: T1 } });
    expect(planSync([{ id: 'a', updated: T1 }], record, there)).toEqual([{ kind: 'remove', id: 'a' }]);
    expect(planSync([{ id: 'a', updated: T3 }], record, there)).toEqual([{ kind: 'push', id: 'a', version: 4 }]);
  });

  test('deleted here: the service hears of it; a change there meanwhile wins and comes back', () => {
    const tomb = records({ a: { version: 3, pushed: T1, deleted: true } });
    expect(planSync([], tomb, [server('a', 3, T1)])).toEqual([{ kind: 'delete', id: 'a', version: 3 }]);
    expect(planSync([], tomb, [server('a', 4, T2)])).toEqual([
      { kind: 'download', id: 'a', server: server('a', 4, T2) },
    ]);
    expect(planSync([], tomb, [server('a', 4, T2, true)])).toEqual([{ kind: 'drop', id: 'a' }]);
    expect(planSync([], tomb, [])).toEqual([{ kind: 'drop', id: 'a' }]);
  });

  test('here and there without a record: the same copy is adopted, two different ones clash', () => {
    const there = [server('a', 5, T2)];
    expect(planSync([{ id: 'a', updated: T2 }], records({}), there)).toEqual([
      { kind: 'adopt', id: 'a', server: there[0] },
    ]);
    // Older or newer here: the player picks (a newer copy may only be a try-out).
    expect(planSync([{ id: 'a', updated: T1 }], records({}), there)).toEqual([
      { kind: 'clash', id: 'a', server: there[0] },
    ]);
    expect(planSync([{ id: 'a', updated: T3 }], records({}), there)).toEqual([
      { kind: 'clash', id: 'a', server: there[0] },
    ]);
    // Open here: not asked while the player is in it.
    expect(planSync([{ id: 'a', updated: T3 }], records({}), there, new Set(['a']))).toEqual([]);
  });

  test('a known character the service no longer has goes out again; a deleted one nobody has is ignored', () => {
    expect(planSync([{ id: 'a', updated: T1 }], records({ a: { version: 2, pushed: T1 } }), [])).toEqual([
      { kind: 'push', id: 'a', version: 0 },
    ]);
    expect(planSync([], records({}), [server('b', 2, T1, true)])).toEqual([]);
    expect(planSync([], records({ c: { version: 2, pushed: T1 } }), [])).toEqual([{ kind: 'drop', id: 'c' }]);
  });
});

describe('planSync between full rounds (no service list)', () => {
  test('only changes here go out, and deletes', () => {
    const steps = planSync(
      [
        { id: 'a', updated: T1 },
        { id: 'b', updated: T2 },
        { id: 'new', updated: T3 },
      ],
      records({
        a: { version: 2, pushed: T1 },
        b: { version: 5, pushed: T1 },
        gone: { version: 1, pushed: T1, deleted: true },
      }),
      null,
    );
    expect(steps).toEqual([
      { kind: 'delete', id: 'gone', version: 1 },
      { kind: 'push', id: 'b', version: 5 },
      { kind: 'push', id: 'new', version: 0 },
    ]);
  });
});
