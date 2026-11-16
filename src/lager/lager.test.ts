/* eslint-disable ts-patterns/no-magic-numbers -- counts, gold and times are the test data */
// The Lager as the app sees it (lager.ts) and keeps it (lager.svelte.ts), on the stand-in service
// (test/fake-sync.ts). Made-up items only: the group's real list stays in the private repo.
import { describe, expect, test, vi } from 'vitest';
import { FakeSync } from '../../test/fake-sync.ts';
import { SyncApi } from '../sync/api.ts';
import { changedWhen } from '../views/lager/when.ts';
import {
  applyOps,
  EMPTY_LAGER,
  goldText,
  importOps,
  isLager,
  lagerFile,
  lagerFileName,
  movedGroup,
  noteLine,
  parseGold,
  placeCounts,
  placeKind,
  placesUsed,
  sameItem,
  shownGroups,
  type Lager,
  type LagerItem,
  type Op,
} from './lager.ts';
import { LagerStore } from './lager.svelte.ts';

const CODE = 'orbit-hazard-melt-ripple';
const NOW = Date.parse('2026-11-15T18:00:00Z');

/** Two groups: magic items with places, materials with counts. */
function sample(): Lager {
  const ops: Op[] = [
    { op: 'addGroup', id: 'g1', name: 'Magic items', kind: 'place' },
    { op: 'addGroup', id: 'g2', name: 'Materials', kind: 'count' },
    {
      op: 'add',
      id: 'a',
      group: 'g1',
      name: 'Goggles of Night',
      count: 1,
      place: 'Lager',
      note: 'Darkvision.\n60 feet.',
    },
    { op: 'add', id: 'b', group: 'g1', name: 'Rope of Climbing', count: 1, place: 'Aria', note: '' },
    { op: 'add', id: 'c', group: 'g1', name: 'Bag of Holding', count: 1, place: 'Aria', note: '' },
    { op: 'add', id: 'd', group: 'g1', name: 'Potion of Healing', count: 2, place: 'm.i.a', note: '' },
    { op: 'add', id: 'e', group: 'g1', name: 'Wand of Light', count: 1, place: 'Bram', note: '' },
    { op: 'add', id: 'f', group: 'g2', name: 'Iron Ore', count: 3, place: '', note: '' },
  ];
  return applyOps(EMPTY_LAGER, ops, 'Aria', NOW);
}

describe('places', () => {
  test('the Lager, gone, or a character', () => {
    expect(['', 'Lager', ' storage ', 'LAGER'].map(placeKind)).toEqual(['lager', 'lager', 'lager', 'lager']);
    expect(['Gone', 'm.i.a', '-', 'weg', 'Verkauft'].map(placeKind)).toEqual(['gone', 'gone', 'gone', 'gone', 'gone']);
    expect(placeKind('Aria')).toBe('character');
  });

  test('the filter counts and the characters most used first', () => {
    const lager = sample();
    expect(placeCounts(lager)).toEqual({ all: 5, lager: 1, character: 3, gone: 1 });
    expect(placesUsed(lager)).toEqual(['Aria', 'Bram']);
  });
});

describe('the list', () => {
  test('search finds every word in the name, place or note; a place filter hides the materials', () => {
    const lager = sample();
    const names = (query: string, filter: Parameters<typeof shownGroups>[2]) =>
      shownGroups(lager, query, filter).map(({ items }) => items.map((item) => item.name));
    expect(names('of aria', 'all')).toEqual([['Rope of Climbing', 'Bag of Holding'], []]);
    expect(names('', 'gone')).toEqual([['Potion of Healing'], []]);
    expect(names('', 'all')[1]).toEqual(['Iron Ore']);
    // "60 feet" is only in the goggles' note; "goggles feet" mixes the name and the note.
    expect(names('60 FEET', 'all')).toEqual([['Goggles of Night'], []]);
    expect(names('goggles feet', 'lager')).toEqual([['Goggles of Night'], []]);
    expect(names('feet', 'character')).toEqual([[], []]);
    expect(shownGroups(lager, 'goggles', 'all')[0]?.total).toBe(5);
  });

  test("under the name: the note's first line, or the line a search found the item by", () => {
    const goggles = sample().items[0] as LagerItem;
    expect(noteLine(goggles, '')).toBe('Darkvision.');
    expect(noteLine(goggles, 'goggles')).toBe('Darkvision.');
    expect(noteLine(goggles, 'feet')).toBe('60 feet.');
    expect(noteLine(goggles, 'night 60')).toBe('60 feet.');
    // A hit far into a long line: cut in front at a word, so the hit shows in the row.
    const long = { ...goggles, note: 'Intro.\nThis crystal is worth a lot when you sell it to a dwarf in the city.' };
    expect(noteLine(long, 'dwarf')).toBe('… sell it to a dwarf in the city.');
    expect(noteLine(long, 'crystal')).toBe('This crystal is worth a lot when you sell it to a dwarf in the city.');
  });

  test('a name the group has already, whatever its case and spaces', () => {
    expect(sameItem(sample(), 'g2', ' iron ore ')?.id).toBe('f');
    expect(sameItem(sample(), 'g1', 'iron ore')).toBeNull();
  });
});

describe('changes shown at once', () => {
  test('counts move by the difference and stay between 0 and the limit', () => {
    const lager = applyOps(sample(), [{ op: 'count', id: 'f', by: -5 }], 'Bram', NOW + 1);
    expect(lager.items.find((item) => item.id === 'f')).toMatchObject({ count: 0, by: 'Bram', updated: NOW + 1 });
    expect(lager).toMatchObject({ by: 'Bram', updated: NOW + 1 });
  });

  test('set changes only what it names, and only into a group that exists', () => {
    const lager = applyOps(
      sample(),
      [
        { op: 'set', id: 'a', place: 'Bram' },
        { op: 'set', id: 'b', group: 'nowhere', name: 'Rope' },
      ],
      'Bram',
      NOW,
    );
    expect(lager.items.find((item) => item.id === 'a')).toMatchObject({ place: 'Bram', note: 'Darkvision.\n60 feet.' });
    expect(lager.items.find((item) => item.id === 'b')).toMatchObject({ name: 'Rope', group: 'g1' });
  });

  test('an add into a missing group, or with an id that exists, does nothing', () => {
    const before = sample();
    const add = { op: 'add', count: 1, place: '', note: '', name: 'X' } as const;
    const lager = applyOps(
      before,
      [
        { ...add, id: 'a', group: 'g1' },
        { ...add, id: 'z', group: 'gone' },
      ],
      'A',
      NOW,
    );
    expect(lager.items).toEqual(before.items);
  });

  test('removing a group takes its items with it; gold by a difference or to an amount', () => {
    const lager = applyOps(
      sample(),
      [
        { op: 'removeGroup', id: 'g2' },
        { op: 'gold', to: 1000 },
        { op: 'gold', by: -300 },
        { op: 'goldNote', note: 'for the ship' },
      ],
      'A',
      NOW,
    );
    expect(lager.groups.map((group) => group.id)).toEqual(['g1']);
    expect(lager.items.some((item) => item.group === 'g2')).toBe(false);
    expect(lager).toMatchObject({ copper: 700, goldNote: 'for the ship' });
  });
});

describe('group order', () => {
  test('a group moves a step up or down, not past either end', () => {
    const lager = sample();
    expect(movedGroup(lager, 'g2', -1)).toEqual(['g2', 'g1']);
    expect(movedGroup(lager, 'g1', 1)).toEqual(['g2', 'g1']);
    expect(movedGroup(lager, 'g1', -1)).toBeNull();
    expect(movedGroup(lager, 'g2', 1)).toBeNull();
    expect(movedGroup(lager, 'nowhere', 1)).toBeNull();
  });

  test('the order shows at once; a group the order doesn’t name follows the named ones', () => {
    const three = applyOps(sample(), [{ op: 'addGroup', id: 'g3', name: 'Potions', kind: 'count' }], 'A', NOW);
    const ids = (ops: Op[]) => applyOps(three, ops, 'A', NOW).groups.map((group) => group.id);
    expect(ids([{ op: 'orderGroups', ids: ['g2', 'g1'] }])).toEqual(['g2', 'g1', 'g3']);
    expect(ids([{ op: 'orderGroups', ids: ['g3', 'gone'] }])).toEqual(['g3', 'g1', 'g2']);
  });
});

describe('gold', () => {
  test('a new total, typed in either language', () => {
    expect(['1234.5', '1234,5', '1.234,5', '1,234.50', ' 12 ', '0,05'].map(parseGold)).toEqual(
      [123_450, 123_450, 123_450, 123_450, 1_200, 5].map((to) => ({ to })),
    );
    expect(['', 'abc', '.5', '1e3', '100 gp', '+', '--3', '+-3', '5+'].map(parseGold)).toEqual(Array(9).fill(null));
  });

  test('a leading + or − changes it by that amount', () => {
    // The hyphen, the minus sign and the dash a phone's keyboard may make of a hyphen all take away.
    expect(['+50', '-20', '−20', '–20', '+ 1.234,5', '-0,5', '+1,234.50'].map(parseGold)).toEqual(
      [5_000, -2_000, -2_000, -2_000, 123_450, -50, 123_450].map((by) => ({ by })),
    );
  });

  test('shown in the locale, without trailing zeros', () => {
    expect(goldText(123_450, 'en')).toBe('1,234.5');
    expect(goldText(123_450, 'de')).toBe('1.234,5');
    expect(goldText(1_200, 'en')).toBe('12');
  });
});

describe('a copy', () => {
  test('saved as a list file, it imports back into the same list', () => {
    const lager = { ...sample(), copper: 123_450, goldNote: 'after the market' };
    let next = 0;
    const ops = importOps(JSON.parse(JSON.stringify(lagerFile(lager))), () => `copy${++next}`);
    const copy = applyOps(EMPTY_LAGER, ops ?? [], 'Bram', NOW + 1);
    const shape = (each: Lager) => ({
      copper: each.copper,
      goldNote: each.goldNote,
      groups: each.groups.map((group) => [group.name, group.kind]),
      items: each.items.map((item) => [
        each.groups.find((group) => group.id === item.group)?.name,
        item.name,
        item.count,
        item.place,
        item.note,
      ]),
    });
    expect(shape(copy)).toEqual(shape(lager));
  });

  test('named with the day it was saved', () => {
    expect(lagerFileName(new Date(2026, 10, 6, 23, 30))).toBe('mpmb-web-lager-2026-11-06.json');
  });
});

describe('import', () => {
  let next = 0;
  const newId = () => `id${++next}`;

  test('a list file becomes groups, items and gold, cut to the limits', () => {
    const ops = importOps(
      {
        copper: 500,
        goldNote: 'saved',
        groups: [
          { name: 'Magic items', kind: 'place', items: [{ name: 'Goggles of Night' }, { name: ' ' }] },
          { name: 'Materials', kind: 'count', items: [{ name: 'Iron Ore', count: 4, note: 'x'.repeat(30_000) }] },
        ],
      },
      newId,
    );
    expect(ops?.map((op) => op.op)).toEqual(['addGroup', 'add', 'addGroup', 'add', 'gold', 'goldNote']);
    expect(ops?.[1]).toMatchObject({ name: 'Goggles of Night', place: 'Lager', count: 1 });
    expect(ops?.[3]).toMatchObject({ name: 'Iron Ore', place: '', count: 4 });
    expect((ops?.[3] as { note: string }).note).toHaveLength(20_000);
  });

  test('anything else is refused', () => {
    expect(importOps(null, newId)).toBeNull();
    expect(importOps({ groups: 'no' }, newId)).toBeNull();
    expect(importOps({ groups: [{ name: 'X', kind: 'boxes', items: [] }] }, newId)).toBeNull();
    expect(importOps({ groups: [] }, newId)).toBeNull();
  });
});

test('a broken answer is not a Lager', () => {
  expect(isLager(sample())).toBe(true);
  expect([null, {}, { version: 1 }, 'x'].some(isLager)).toBe(false);
});

test('when it changed: just now, a time today, a date before', () => {
  const t = { lagerChangedNow: 'just now', locale: 'en-GB' };
  expect(changedWhen(NOW - 10_000, NOW, t)).toBe('just now');
  // A time of day: "17:00" matches, "just now" doesn't. Try it: https://regex101.com/?regex=%5Cd%5Cd%3A%5Cd%5Cd&testString=17%3A00
  expect(changedWhen(NOW - 3_600_000, NOW, t)).toMatch(/\d\d:\d\d/);
  // With the month: "12 Nov 2026, 18:00" matches, "18:00" doesn't. Try it: https://regex101.com/?regex=Nov&testString=12%20Nov%202026
  expect(changedWhen(NOW - 3 * 86_400_000, NOW, t)).toMatch(/Nov/);
});

describe('the store', () => {
  async function device(service: FakeSync, name: string) {
    let token: string | null = null;
    const api = new SyncApi(() => token, 'https://sync.test', service.fetcher);
    const login = await api.login(CODE, name);
    token = login.token;
    return new LagerStore(
      api,
      () => login.player,
      () => service.now,
    );
  }

  function serviceWithPlayer(): FakeSync {
    const service = new FakeSync();
    service.addPlayer('Anna', CODE);
    return service;
  }

  test('without a sync code it is off and asks nothing', async () => {
    const service = serviceWithPlayer();
    const store = new LagerStore(new SyncApi(() => null, 'https://sync.test', service.fetcher), () => null);
    await store.refresh();
    expect(store.status).toBe('off');
    expect(service.log).toEqual([]);
  });

  test('a change on one device shows on the other at its next read; an unchanged Lager is a short answer', async () => {
    const service = serviceWithPlayer();
    const laptop = await device(service, 'Laptop');
    const ipad = await device(service, 'iPad');
    await laptop.refresh();
    await ipad.refresh();
    expect(laptop.status).toBe('ready');

    const sent = laptop.change([{ op: 'addGroup', id: 'g', name: 'Materials', kind: 'count' }]);
    // Shown at once, before the answer.
    expect(laptop.lager?.groups).toHaveLength(1);
    expect(laptop.sending).toBe(1);
    expect(await sent).toBe(true);
    expect(laptop.sending).toBe(0);
    expect(laptop.lager?.version).toBe(1);

    await ipad.refresh();
    expect(ipad.lager?.groups.map((group) => group.name)).toEqual(['Materials']);
    expect(ipad.lager?.by).toBe('Anna');
    await ipad.refresh();
    expect(ipad.lager?.version).toBe(1);
  });

  test('changes go out in order; two +1 from two devices both count', async () => {
    const service = serviceWithPlayer();
    const laptop = await device(service, 'Laptop');
    const ipad = await device(service, 'iPad');
    await laptop.refresh();
    await laptop.change([
      { op: 'addGroup', id: 'g', name: 'Materials', kind: 'count' },
      { op: 'add', id: 'i', group: 'g', name: 'Iron Ore', count: 1, place: '', note: '' },
    ]);
    await ipad.refresh();
    const both = [laptop.change([{ op: 'count', id: 'i', by: 1 }]), ipad.change([{ op: 'count', id: 'i', by: 1 }])];
    const more = laptop.change([{ op: 'count', id: 'i', by: 1 }]);
    expect(await Promise.all([...both, more])).toEqual([true, true, true]);
    await laptop.refresh();
    expect(laptop.lager?.items[0]?.count).toBe(4);
  });

  test('a change whose answer got lost is sent again and counts once', async () => {
    const service = serviceWithPlayer();
    const laptop = await device(service, 'Laptop');
    await laptop.refresh();
    await laptop.change([
      { op: 'addGroup', id: 'g', name: 'Materials', kind: 'count' },
      { op: 'add', id: 'i', group: 'g', name: 'Iron Ore', count: 1, place: '', note: '' },
    ]);
    // The next POST reaches the service, but its answer doesn't come back.
    const fetcher = service.fetcher;
    let lose = true;
    Object.assign(service, {
      fetcher: async (url: string, init: RequestInit) => {
        const response = await fetcher(url, init);
        if (init.method === 'POST' && lose) {
          lose = false;
          throw new TypeError('NetworkError when attempting to fetch resource.');
        }
        return response;
      },
    });
    const api = new SyncApi(
      () => service.devices[0]?.token ?? null,
      'https://sync.test',
      (url, init) => service.fetcher(url, init),
    );
    const store = new LagerStore(api, () => 'Anna');
    await store.refresh();
    expect(await store.change([{ op: 'count', id: 'i', by: 1 }])).toBe(true);
    expect(service.lager.items[0]?.count).toBe(2);
    expect(store.lager?.items[0]?.count).toBe(2);
  });

  test('a read that started before a change and answers after it does not undo the change on screen', async () => {
    const service = serviceWithPlayer();
    const ipad = await device(service, 'iPad');
    await ipad.refresh();
    await ipad.change([
      { op: 'addGroup', id: 'g', name: 'Materials', kind: 'count' },
      { op: 'add', id: 'i', group: 'g', name: 'Iron Ore', count: 1, place: '', note: '' },
    ]);
    // A laptop whose polls the service answers at once, but whose answers arrive only when `late` lets them.
    const fetcher = service.fetcher;
    let late: Promise<void> | null = null;
    let arrive = () => {};
    const api = new SyncApi(
      () => service.devices[0]?.token ?? null,
      'https://sync.test',
      async (url, init) => {
        const response = await fetcher(url, init);
        if (init.method === 'GET' && late) await late;
        return response;
      },
    );
    const laptop = new LagerStore(api, () => 'Anna');
    await laptop.refresh();
    // The iPad changes the gold, so the laptop's next poll brings a whole Lager: the one before its own +1.
    await ipad.change([{ op: 'gold', to: 100 }]);
    late = new Promise<void>((resolve) => (arrive = resolve));
    const poll = laptop.refresh();
    await vi.waitFor(() => expect(service.log.at(-1)).toMatch(/GET \/lager/));
    expect(await laptop.change([{ op: 'count', id: 'i', by: 1 }])).toBe(true);
    expect(laptop.lager?.items[0]?.count).toBe(2);
    arrive();
    await poll;
    expect(laptop.lager?.items[0]?.count).toBe(2);
    expect(laptop.lager?.copper).toBe(100);
  });

  test('an import goes only into an empty Lager, and only once', async () => {
    const service = serviceWithPlayer();
    const laptop = await device(service, 'Laptop');
    const ipad = await device(service, 'iPad');
    await laptop.refresh();
    await ipad.refresh();
    const list: Op[] = [
      { op: 'addGroup', id: 'g', name: 'Materials', kind: 'count' },
      { op: 'add', id: 'i', group: 'g', name: 'Iron Ore', count: 3, place: '', note: '' },
    ];
    const relist = (suffix: string): Op[] => [
      { op: 'addGroup', id: `g${suffix}`, name: 'Materials', kind: 'count' },
      { op: 'add', id: `i${suffix}`, group: `g${suffix}`, name: 'Iron Ore', count: 3, place: '', note: '' },
    ];
    // Two taps on this device: the second finds the first still reading and does nothing.
    const twice = await Promise.all([laptop.importList(list), laptop.importList(relist('2'))]);
    expect(twice).toEqual([true, false]);
    // The iPad still shows the empty Lager from before, but reads before it sends.
    expect(ipad.lager?.groups).toEqual([]);
    expect(await ipad.importList(relist('3'))).toBe(false);
    expect(service.lager.groups).toHaveLength(1);
    expect(service.lager.items).toHaveLength(1);
    expect(ipad.importing).toBe(false);
  });

  test('a change that does not get through is dropped again, and the store says so', async () => {
    const service = serviceWithPlayer();
    const laptop = await device(service, 'Laptop');
    await laptop.refresh();
    service.offline = true;
    const sent = laptop.change([{ op: 'gold', to: 500 }]);
    expect(laptop.lager?.copper).toBe(500);
    expect(await sent).toBe(false);
    expect(laptop.failed).toBe(true);
    expect(laptop.status).toBe('offline');
    // The settle step puts the service's last copy back.
    await Promise.resolve();
    await Promise.resolve();
    expect(laptop.lager?.copper).toBe(0);

    service.offline = false;
    expect(await laptop.change([{ op: 'gold', to: 700 }])).toBe(true);
    expect(laptop.failed).toBe(false);
    expect(laptop.lager?.copper).toBe(700);
  });
});
