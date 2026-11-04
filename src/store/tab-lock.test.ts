// The per-character lock across tabs, on a stand-in for the browser's LockManager that two "tabs" share.
import { describe, expect, test } from 'vitest';
import { TabLock, lockName } from './tab-lock.ts';
import { StandInLocks } from '../../test/stand-in-locks.ts';

/** Two tabs of the same browser, each recording which characters it lost. */
function twoTabs(): { first: TabLock; second: TabLock; lostByFirst: string[]; locks: StandInLocks } {
  const locks = new StandInLocks();
  const lostByFirst: string[] = [];
  return {
    first: new TabLock(locks, (id) => lostByFirst.push(id)),
    second: new TabLock(locks, () => undefined),
    lostByFirst,
    locks,
  };
}

describe('TabLock', () => {
  test('the first tab gets the character; a second tab does not, and sees it open elsewhere', async () => {
    const { first, second } = twoTabs();
    expect(await first.take('anna')).toBe(true);
    expect(first.holds('anna')).toBe(true);
    expect(await second.take('anna')).toBe(false);
    expect(second.holds('anna')).toBe(false);
    expect(await second.openElsewhere(['anna', 'bert'])).toEqual(['anna']);
    // A tab's own character isn't "elsewhere".
    expect(await first.openElsewhere(['anna'])).toEqual([]);
  });

  test('taking over: the other tab is told and may no longer save', async () => {
    const { first, second, lostByFirst } = twoTabs();
    await first.take('anna');
    expect(await second.take('anna', true)).toBe(true);
    await expect.poll(() => lostByFirst).toEqual(['anna']);
    expect(first.holds('anna')).toBe(false);
    expect(second.holds('anna')).toBe(true);
  });

  test('leaving a character and opening it again at once gets it again', async () => {
    const { first, second } = twoTabs();
    await first.take('anna');
    first.free();
    expect(await first.take('anna')).toBe(true);
    expect(await second.take('anna')).toBe(false);
  });

  test('leaving a character frees it for the other tab, without telling anyone it was lost', async () => {
    const { first, second, lostByFirst, locks } = twoTabs();
    await first.take('anna');
    first.free();
    await expect.poll(async () => (await locks.query()).held ?? []).toEqual([]);
    expect(await second.take('anna')).toBe(true);
    expect(lostByFirst).toEqual([]);
  });

  test('taking the character it already holds keeps it (reopening)', async () => {
    const { first, second } = twoTabs();
    await first.take('anna');
    expect(await first.take('anna')).toBe(true);
    expect(await second.take('anna')).toBe(false);
  });

  test('opening another character lets go of the first', async () => {
    const { first, locks } = twoTabs();
    await first.take('anna');
    await first.take('bert');
    await expect.poll(async () => (await locks.query()).held?.map((lock) => lock.name)).toEqual([lockName('bert')]);
  });

  test('without the API (older Safari) every tab may save, as before', async () => {
    const tab = new TabLock(undefined, () => undefined);
    expect(await tab.take('anna')).toBe(true);
    expect(tab.holds('anna')).toBe(true);
    expect(tab.holds('bert')).toBe(true);
    expect(await tab.openElsewhere(['anna'])).toEqual([]);
  });
});
