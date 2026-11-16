/* eslint-disable ts-patterns/no-magic-numbers -- times and hit points are the test data */
// The app's sync (src/sync/) against the real service (server/) on a real MySQL or MariaDB, so the app and the
// service can't drift apart while each passes its own tests against a stand-in. Runs, like server/sync.test.ts,
// only when TEST_DB_HOST, TEST_DB_USER and TEST_DB_PASSWORD reach a database server, with its own empty database
// in TEST_APP_DB_NAME (not server/sync.test.ts's: test files run side by side and wipe their tables).
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { IDBFactory } from 'fake-indexeddb';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { service } from '../server/app.ts';
import { connect, type Db } from '../server/db.ts';
import { CHARACTER_FORMAT, FORMAT_VERSION } from '../src/engine/sheet-data.ts';
import type { CharacterData } from '../src/engine/sheet-data.ts';
import { ui } from '../src/i18n.ts';
import { CharacterStore, describeCharacter } from '../src/store/characters.ts';
import type { StoredCharacter } from '../src/store/characters.ts';
import { Sync } from '../src/sync/sync.svelte.ts';
import type { Lease } from '../src/sync/api.ts';

const env = process.env;
const settings = {
  DB_HOST: env.TEST_DB_HOST,
  DB_NAME: env.TEST_APP_DB_NAME,
  DB_USER: env.TEST_DB_USER,
  DB_PASSWORD: env.TEST_DB_PASSWORD,
};
const ADMIN = 'admin secret';
const TABLES = [
  'lager_requests',
  'lager_items',
  'lager_groups',
  'lager',
  'characters',
  'devices',
  'attempts',
  'players',
  'schema_version',
];
const ID = '1b4e28ba-2fa1-11d2-883f-0016d3cca427';

let db: Db;
let server: Server;
let base: string;

/** Adds a player on the admin page and returns the code it shows once. */
async function addPlayer(name: string): Promise<string> {
  const res = await fetch(`${base}/admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept-Language': 'en' },
    body: new URLSearchParams({ password: ADMIN, action: 'add', name }).toString(),
  });
  const page = await res.text();
  const start = page.indexOf('class="code">') + 'class="code">'.length;
  return page.slice(start, page.indexOf('<', start));
}

let clock = Date.parse('2026-11-15T18:00:00Z');
const anna = (hp: string, before?: StoredCharacter): StoredCharacter => {
  clock += 60_000;
  const data: CharacterData = {
    format: CHARACTER_FORMAT,
    version: FORMAT_VERSION,
    info: { SheetVersion: '24.2.0' },
    numPages: 6,
    fields: { 'PC Name': { value: 'Anna' }, 'HP Current': { value: hp } },
  };
  const meta = describeCharacter(
    data,
    { files: [], manual: false },
    before?.meta ?? { id: ID, created: '2026-11-01T00:00:00Z' },
    new Date(clock),
  );
  return { meta, data };
};

/** A device: its own browser storage and sync, on the real service. */
async function device(): Promise<{ store: CharacterStore; sync: Sync; lost: Lease[]; notes: string[] }> {
  const store = await CharacterStore.open(new IDBFactory());
  const lost: Lease[] = [];
  const notes: string[] = [];
  const values = new Map<string, string>();
  const sync = new Sync(
    {
      store: () => store,
      open: () => null,
      changed: async () => undefined,
      replaced: async () => undefined,
      removed: () => undefined,
      lost: (_id, lease) => void lost.push(lease),
      note: (_kind, text) => void notes.push(text),
      // A clash takes the service's copy, so this one is the restore point.
      pick: async () => 'there',
    },
    () => ui.en,
    undefined,
    {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
      removeItem: (key) => void values.delete(key),
    },
    base,
  );
  return { store, sync, lost, notes };
}

const hpOf = async (store: CharacterStore) => (await store.get(ID))?.data.fields['HP Current'];

describe.skipIf(!settings.DB_HOST || !settings.DB_NAME)('the app’s sync on the real service', () => {
  beforeAll(() => {
    db = connect(settings) as Db;
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.change(`DROP TABLE IF EXISTS ${TABLES.join(', ')}`);
    const { handle } = service({ ...settings, ADMIN_PASSWORD: ADMIN }, db);
    server = createServer((req, res) => void handle(req, res));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('carries a character and its changes between two devices, and keeps the losing copy of a clash', async () => {
    const code = await addPlayer('Anna');
    const laptop = await device();
    const ipad = await device();
    await laptop.store.put(anna('20'));
    expect(await laptop.sync.connect(code, 'Laptop')).toBe('ok');
    expect(await ipad.sync.connect(code.replaceAll('-', ' ').toUpperCase(), 'iPad')).toBe('ok');
    expect(await hpOf(ipad.store)).toEqual({ value: '20' });

    // Both change it before either syncs: the iPad's goes out first and wins.
    await laptop.store.put(anna('5', (await laptop.store.get(ID))!));
    await ipad.store.put(anna('15', (await ipad.store.get(ID))!));
    await ipad.sync.round(false);
    await laptop.sync.round(false);
    await laptop.sync.round(false);
    expect(await hpOf(laptop.store)).toEqual({ value: '15' });
    expect((await laptop.store.points(ID)).map((p) => p.reason)).toEqual(['sync']);
    expect(laptop.sync.state).toBe('synced');
  });

  it('says who has a character open, and lets the other device take it over', async () => {
    const code = await addPlayer('Anna');
    const laptop = await device();
    const ipad = await device();
    await laptop.store.put(anna('20'));
    await laptop.sync.connect(code, 'Laptop');
    await ipad.sync.connect(code, 'iPad');
    expect(await laptop.sync.hold(ID)).toEqual({ held: true });
    expect(await ipad.sync.hold(ID)).toMatchObject({ held: false, lease: { device: 'Laptop' } });
    expect(await ipad.sync.hold(ID, true)).toEqual({ held: true });
    laptop.sync.release(ID);
    ipad.sync.release(ID);
  });

  it('deletes on the other device, and forgets this one', async () => {
    const code = await addPlayer('Anna');
    const laptop = await device();
    const ipad = await device();
    await laptop.store.put(anna('20'));
    await laptop.sync.connect(code, 'Laptop');
    await ipad.sync.connect(code, 'iPad');
    await laptop.store.delete(ID, (await laptop.store.syncRecords()).get(ID));
    await laptop.sync.round(false);
    await ipad.sync.round(true);
    expect(await ipad.store.get(ID)).toBeUndefined();

    expect(await ipad.sync.forgetThisDevice()).toBe('ok');
    expect((await laptop.sync.listDevices())?.map((d) => d.name)).toEqual(['Laptop']);
  });
});
