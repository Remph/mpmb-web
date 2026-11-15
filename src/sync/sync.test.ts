/* eslint-disable ts-patterns/no-magic-numbers -- times and versions are the test data */
// The sync between two devices (sync.svelte.ts): each with its own browser storage (fake-indexeddb), both on one
// stand-in service (test/fake-sync.ts).
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { FakeSync } from '../../test/fake-sync.ts';
import { CHARACTER_FORMAT, FORMAT_VERSION } from '../engine/sheet-data.ts';
import type { CharacterData } from '../engine/sheet-data.ts';
import { ui } from '../i18n.ts';
import { CharacterStore, describeCharacter } from '../store/characters.ts';
import type { StoredCharacter } from '../store/characters.ts';
import type { Lease } from './api.ts';
import { PUSH_PACE_MS, Sync } from './sync.svelte.ts';
import type { Clash, SyncHost } from './sync.svelte.ts';

const CODE = 'orbit-hazard-melt-ripple';
const BASE = 'https://sync.test';

const sheetOf = (name: string, hp: string): CharacterData => ({
  format: CHARACTER_FORMAT,
  version: FORMAT_VERSION,
  info: { SheetVersion: '24.2.0' },
  numPages: 6,
  fields: { 'PC Name': { value: name }, 'HP Current': { value: hp }, 'HP Max': { value: '30' } },
});

let clock = Date.parse('2026-11-15T18:00:00Z');
/** A change on a device: a later `updated`, as every save makes. */
const character = (id: string, hp: string, before?: StoredCharacter): StoredCharacter => {
  clock += 60_000;
  const data = sheetOf('Anna', hp);
  const meta = describeCharacter(
    data,
    { files: [], manual: false },
    before?.meta ?? { id, created: '2026-11-01T00:00:00.000Z' },
    new Date(clock),
  );
  return { meta, data };
};

/** One device: its browser storage, its sync, and what the sync told the page. */
class Device {
  store!: CharacterStore;
  sync!: Sync;
  readonly notes: string[] = [];
  readonly lost: Lease[] = [];
  readonly replaced: string[] = [];
  readonly removed: string[] = [];
  openId: { id: string; editing: boolean } | null = null;
  /** The player's answer when two copies clash, and the clashes asked about. */
  answer: 'here' | 'there' | 'later' = 'there';
  readonly asked: Clash[] = [];
  private readonly values = new Map<string, string>();

  static async on(service: FakeSync): Promise<Device> {
    const device = new Device();
    device.store = await CharacterStore.open(new IDBFactory());
    const host: SyncHost = {
      store: () => device.store,
      open: () => device.openId,
      changed: async () => undefined,
      replaced: async (id) => void device.replaced.push(id),
      removed: (id) => void device.removed.push(id),
      lost: (_id, lease) => void device.lost.push(lease),
      note: (_kind, text) => void device.notes.push(text),
      pick: async (clash) => {
        device.asked.push(clash);
        return device.answer;
      },
    };
    const storage = {
      getItem: (key: string) => device.values.get(key) ?? null,
      setItem: (key: string, value: string) => void device.values.set(key, value),
      removeItem: (key: string) => void device.values.delete(key),
    };
    device.sync = new Sync(host, () => ui.en, service.fetcher, storage, BASE);
    return device;
  }

  async hp(id: string): Promise<string | undefined> {
    const field = (await this.store.get(id))?.data.fields['HP Current'];
    return field ? String(field.value) : undefined;
  }
}

let service: FakeSync;

beforeEach(() => {
  service = new FakeSync();
  service.addPlayer('Anna', CODE);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('connecting', () => {
  test('a wrong code is refused, the right one signs in and sends the characters already here', async () => {
    const laptop = await Device.on(service);
    await laptop.store.put(character('a', '20'));
    expect(await laptop.sync.connect('orbit hazard melt wrong', 'Laptop')).toBe('wrong');
    expect(laptop.sync.on).toBe(false);
    expect(await laptop.sync.connect('Orbit Hazard Melt Ripple', 'Laptop')).toBe('ok');
    expect(laptop.sync.account).toMatchObject({ player: 'Anna', name: 'Laptop' });
    expect(laptop.sync.state).toBe('synced');
    expect(service.characters.get(1)?.get('a')?.version).toBe(1);
    expect(laptop.sync.mark((await laptop.store.list())[0]!)).toBe('synced');
  });

  test('offline, connecting says so and nothing is remembered', async () => {
    const laptop = await Device.on(service);
    service.offline = true;
    expect(await laptop.sync.connect(CODE, 'Laptop')).toBe('offline');
    expect(laptop.sync.on).toBe(false);
  });
});

describe('two devices', () => {
  test('a character made on the laptop shows on the iPad, and a change on the iPad comes back', async () => {
    const laptop = await Device.on(service);
    const ipad = await Device.on(service);
    const made = character('a', '20');
    await laptop.store.put(made);
    await laptop.sync.connect(CODE, 'Laptop');
    await ipad.sync.connect(CODE, 'iPad');
    expect(await ipad.hp('a')).toBe('20');

    const changed = character('a', '12', (await ipad.store.get('a'))!);
    await ipad.store.put(changed);
    await ipad.sync.round(false);
    expect(ipad.sync.mark(changed.meta)).toBe('synced');
    await laptop.sync.round(true);
    expect(await laptop.hp('a')).toBe('12');
    expect(laptop.sync.mark((await laptop.store.list())[0]!)).toBe('synced');
    // Nothing lost, so nothing to keep.
    expect(await laptop.store.points('a')).toEqual([]);
  });

  test('both had it before syncing (a backup): the player picks, and keeping this one sends it everywhere', async () => {
    const pc = await Device.on(service);
    const surface = await Device.on(service);
    const older = character('rowan', '20');
    const newer = character('rowan', '7', older);
    await pc.store.put(older);
    await surface.store.put(newer);

    // The PC with the older copy comes first; the Surface asks, and the player keeps the Surface's.
    await pc.sync.connect(CODE, 'PC');
    surface.answer = 'here';
    await surface.sync.connect(CODE, 'Surface');
    expect(surface.asked).toEqual([
      { id: 'rowan', name: 'Anna', here: newer.meta.updated, there: Date.parse(older.meta.updated), device: 'PC' },
    ]);
    expect(await surface.hp('rowan')).toBe('7');
    const kept = await surface.store.points('rowan');
    expect(kept.map((p) => [p.reason, p.data.fields['HP Current']?.value])).toEqual([['sync', '20']]);
    expect(surface.notes).toContain(ui.en.syncKeptTheirs.replace('{name}', 'Anna').replace('{device}', 'PC'));

    // The PC's copy hadn't changed since it went out: it takes the Surface's without asking.
    await pc.sync.round(true);
    expect(pc.asked).toEqual([]);
    expect(await pc.hp('rowan')).toBe('7');
    expect(pc.sync.mark((await pc.store.list())[0]!)).toBe('synced');
    expect(surface.sync.mark((await surface.store.list())[0]!)).toBe('synced');
  });

  test('both had it before syncing: taking the synced copy keeps this one as a restore point', async () => {
    const pc = await Device.on(service);
    const surface = await Device.on(service);
    const older = character('rowan', '20');
    const newer = character('rowan', '7', older);
    await pc.store.put(older);
    await surface.store.put(newer);

    await surface.sync.connect(CODE, 'Surface');
    pc.answer = 'there';
    await pc.sync.connect(CODE, 'PC');
    expect(await pc.hp('rowan')).toBe('7');
    expect((await pc.store.points('rowan')).map((p) => p.data.fields['HP Current']?.value)).toEqual(['20']);
    expect(await surface.store.points('rowan')).toEqual([]);
  });

  test('keeping this one while the other device has it open: asked once, it goes out when that device lets go', async () => {
    const pc = await Device.on(service);
    const surface = await Device.on(service);
    const older = character('rowan', '20');
    await pc.store.put(older);
    await surface.store.put(character('rowan', '7', older));
    await pc.sync.connect(CODE, 'PC');
    await pc.sync.hold('rowan');
    surface.answer = 'here';
    await surface.sync.connect(CODE, 'Surface');
    // Refused (open on the PC): the answer stands, so the next rounds send it instead of asking again.
    await surface.sync.round(true);
    await surface.sync.round(true);
    expect(surface.asked).toHaveLength(1);
    expect(await surface.store.points('rowan')).toHaveLength(1);
    expect(surface.sync.mark((await surface.store.list())[0]!)).toBe('waiting');

    pc.sync.release('rowan');
    await pc.sync.now();
    await surface.sync.round(true);
    expect(surface.asked).toHaveLength(1);
    expect(surface.sync.mark((await surface.store.list())[0]!)).toBe('synced');
    await pc.sync.round(true);
    expect(await pc.hp('rowan')).toBe('7');
  });

  test('"Later" leaves both copies as they are, and doesn’t ask again until the page loads', async () => {
    const pc = await Device.on(service);
    const surface = await Device.on(service);
    const older = character('rowan', '20');
    await pc.store.put(older);
    await surface.store.put(character('rowan', '7', older));
    await pc.sync.connect(CODE, 'PC');
    surface.answer = 'later';
    await surface.sync.connect(CODE, 'Surface');
    await surface.sync.round(true);
    expect(surface.asked).toHaveLength(1);
    expect(await surface.hp('rowan')).toBe('7');
    expect(await surface.store.points('rowan')).toEqual([]);
    await pc.sync.round(true);
    expect(await pc.hp('rowan')).toBe('20');
  });

  test('changed on both while apart: the newer one at the service wins, the other stays as a restore point', async () => {
    const laptop = await Device.on(service);
    const ipad = await Device.on(service);
    await laptop.store.put(character('a', '20'));
    await laptop.sync.connect(CODE, 'Laptop');
    await ipad.sync.connect(CODE, 'iPad');

    // The laptop is offline and its change waits; the iPad's goes out.
    service.offline = true;
    await laptop.store.put(character('a', '5', (await laptop.store.get('a'))!));
    await laptop.sync.round(false);
    expect(laptop.sync.state).toBe('offline');
    service.offline = false;
    await ipad.store.put(character('a', '15', (await ipad.store.get('a'))!));
    await ipad.sync.round(false);

    // Back online: its save is refused (409), and the next full round keeps its copy as a point.
    await laptop.sync.round(false);
    await laptop.sync.round(false);
    expect(await laptop.hp('a')).toBe('15');
    const points = await laptop.store.points('a');
    expect(points.map((p) => [p.reason, p.data.fields['HP Current']?.value])).toEqual([['sync', '5']]);
    expect(laptop.notes).toEqual([
      'Anna was changed on iPad too. This device’s copy is kept as a restore point (Sheet menu, “Roll back to an earlier save”).',
    ]);
    expect(laptop.sync.state).toBe('synced');
  });

  test('a delete on one device deletes it on the other; a delete made offline goes out later', async () => {
    const laptop = await Device.on(service);
    const ipad = await Device.on(service);
    await laptop.store.put(character('a', '20'), character('b', '20'));
    await laptop.sync.connect(CODE, 'Laptop');
    await ipad.sync.connect(CODE, 'iPad');

    service.offline = true;
    await laptop.store.delete('a', (await laptop.store.syncRecords()).get('a'));
    await laptop.sync.round(false);
    service.offline = false;
    await laptop.sync.round(false);
    expect(service.characters.get(1)?.get('a')?.deleted).toBe(true);
    expect((await laptop.store.syncRecords()).has('a')).toBe(false);

    await ipad.sync.round(true);
    expect(await ipad.store.get('a')).toBeUndefined();
    expect(await ipad.store.get('b')).toBeDefined();
  });

  test('changes go out at most every few seconds, however often the character is saved', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const laptop = await Device.on(service);
    await laptop.store.put(character('a', '20'));
    await laptop.sync.connect(CODE, 'Laptop');
    service.log.length = 0;
    // Four saves a second apart, as quick taps on the hit points make them.
    const current = await ['19', '18', '17', '16'].reduce(
      async (before, hp) => {
        const next = character('a', hp, await before);
        await laptop.store.put(next);
        laptop.sync.changed();
        await vi.advanceTimersByTimeAsync(1_000);
        return next;
      },
      Promise.resolve((await laptop.store.get('a'))!),
    );
    const puts = () => service.log.filter((line) => line.startsWith('PUT'));
    expect(puts()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(PUSH_PACE_MS);
    // The round packs the sheet with the platform's streams, which run on real time.
    vi.useRealTimers();
    await vi.waitFor(() => expect(laptop.sync.state).toBe('synced'));
    expect(puts()).toHaveLength(1);
    expect(await service.characters.get(1)?.get('a')?.meta).toMatchObject({ updated: current.meta.updated });
  });
});

describe('open on another device', () => {
  test('the second device is told who has it; Take over moves it, and the first learns at its renewal', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const laptop = await Device.on(service);
    const ipad = await Device.on(service);
    await laptop.store.put(character('a', '20'));
    await laptop.sync.connect(CODE, 'Laptop');
    await ipad.sync.connect(CODE, 'iPad');

    expect(await laptop.sync.hold('a')).toEqual({ held: true });
    const asked = await ipad.sync.hold('a');
    expect(asked).toMatchObject({ held: false, lease: { device: 'Laptop' } });
    await ipad.sync.round(true);
    expect(ipad.sync.heldElsewhere('a')).toMatchObject({ device: 'Laptop' });

    expect(await ipad.sync.hold('a', true)).toEqual({ held: true });
    await vi.advanceTimersByTimeAsync(45_000);
    expect(laptop.lost).toMatchObject([{ device: 'iPad' }]);
  });

  test('taken over elsewhere: the next push already tells the first device, before its renewal', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const laptop = await Device.on(service);
    const ipad = await Device.on(service);
    await laptop.store.put(character('a', '20'));
    await laptop.sync.connect(CODE, 'Laptop');
    await ipad.sync.connect(CODE, 'iPad');
    await laptop.sync.hold('a');
    await ipad.sync.hold('a', true);
    // Typed on the laptop a moment after the iPad took over: the push is refused (423) and says by whom.
    await laptop.store.put(character('a', '12', (await laptop.store.get('a'))!));
    await laptop.sync.round(false);
    expect(laptop.lost).toMatchObject([{ device: 'iPad' }]);
    // The laptop renews no more (it would only be refused again): the one hold after 45 s is the iPad's.
    const holds = (): number => service.log.filter((line) => line === 'POST /characters/a/lease').length;
    const before = holds();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(holds()).toBe(before + 1);
    expect(laptop.lost).toHaveLength(1);
  });

  test('closing sends the last change before it lets go, so the next device opens the newest copy', async () => {
    const laptop = await Device.on(service);
    const ipad = await Device.on(service);
    await laptop.store.put(character('a', '20'));
    await laptop.sync.connect(CODE, 'Laptop');
    await ipad.sync.connect(CODE, 'iPad');
    await laptop.sync.hold('a');
    await laptop.store.put(character('a', '4', (await laptop.store.get('a'))!));
    // As Session.close(): the round first, then the release.
    void laptop.sync.now(true);
    laptop.sync.release('a');
    await vi.waitFor(() => expect(service.log).toContain('DELETE /characters/a/lease'));
    const log = service.log.join('\n');
    expect(log.lastIndexOf('PUT /characters/a')).toBeLessThan(log.lastIndexOf('DELETE /characters/a/lease'));
    expect(await ipad.sync.hold('a')).toEqual({ held: true });
    await ipad.sync.round(true);
    expect(await ipad.hp('a')).toBe('4');
  });

  test("opened again here before the release went out: the lease stays this device's", async () => {
    const laptop = await Device.on(service);
    await laptop.store.put(character('a', '20'));
    await laptop.sync.connect(CODE, 'Laptop');
    await laptop.sync.hold('a');
    void laptop.sync.now(true);
    laptop.sync.release('a');
    await laptop.sync.hold('a');
    await laptop.sync.round(false);
    expect(service.log).not.toContain('DELETE /characters/a/lease');
    laptop.sync.release('a');
  });

  test('closing lets go at once, so the next device opens it without asking', async () => {
    const laptop = await Device.on(service);
    const ipad = await Device.on(service);
    await laptop.store.put(character('a', '20'));
    await laptop.sync.connect(CODE, 'Laptop');
    await ipad.sync.connect(CODE, 'iPad');
    await laptop.sync.hold('a');
    laptop.sync.release('a');
    await vi.waitFor(() => expect(service.log).toContain('DELETE /characters/a/lease'));
    expect(await ipad.sync.hold('a')).toEqual({ held: true });
  });

  test('offline, a character still opens for changes', async () => {
    const laptop = await Device.on(service);
    await laptop.store.put(character('a', '20'));
    await laptop.sync.connect(CODE, 'Laptop');
    service.offline = true;
    expect(await laptop.sync.hold('a')).toEqual({ held: false, offline: true });
    laptop.sync.release('a');
  });

  test('a character shown read-only gets the newer copy when the device that has it saves', async () => {
    const laptop = await Device.on(service);
    const ipad = await Device.on(service);
    await laptop.store.put(character('a', '20'));
    await laptop.sync.connect(CODE, 'Laptop');
    await ipad.sync.connect(CODE, 'iPad');
    ipad.openId = { id: 'a', editing: false };
    await laptop.store.put(character('a', '3', (await laptop.store.get('a'))!));
    await laptop.sync.round(false);
    await ipad.sync.round(true);
    expect(await ipad.hp('a')).toBe('3');
    expect(ipad.replaced).toEqual(['a']);
  });
});

describe('devices', () => {
  test('a device forgotten elsewhere is signed out at its next round, and keeps its characters', async () => {
    const laptop = await Device.on(service);
    const ipad = await Device.on(service);
    await laptop.store.put(character('a', '20'));
    await laptop.sync.connect(CODE, 'Laptop');
    await ipad.sync.connect(CODE, 'iPad');
    const list = await laptop.sync.listDevices();
    expect(list?.map((d) => [d.name, d.current]).sort()).toEqual([
      ['Laptop', true],
      ['iPad', false],
    ]);
    const other = list!.find((d) => !d.current)!;
    expect(await laptop.sync.forgetDevice(other.id)).toBe(true);
    await ipad.sync.round(true);
    expect(ipad.sync.on).toBe(false);
    expect(ipad.notes[0]).toContain('no longer syncs');
    expect(await ipad.store.get('a')).toBeDefined();
  });

  test('forgetting this device sends what waits, signs out and takes the synced characters out of this browser', async () => {
    const laptop = await Device.on(service);
    await laptop.store.put(character('a', '20'));
    await laptop.sync.connect(CODE, 'Laptop');
    await laptop.store.put(character('a', '9', (await laptop.store.get('a'))!));
    expect(await laptop.sync.forgetThisDevice()).toBe('ok');
    expect(laptop.sync.on).toBe(false);
    expect(await laptop.store.list()).toEqual([]);
    expect(service.devices).toHaveLength(0);
    expect(service.characters.get(1)?.get('a')?.version).toBe(2);
  });

  test('offline, forgetting this device does nothing while changes wait', async () => {
    const laptop = await Device.on(service);
    await laptop.store.put(character('a', '20'));
    await laptop.sync.connect(CODE, 'Laptop');
    await laptop.store.put(character('a', '9', (await laptop.store.get('a'))!));
    service.offline = true;
    expect(await laptop.sync.forgetThisDevice()).toBe('offline');
    expect(laptop.sync.on).toBe(true);
    expect(await laptop.hp('a')).toBe('9');
  });
});
