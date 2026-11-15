// The group's Lager (M16). The checks of what a request may say run everywhere; the Lager itself runs against a
// real MySQL or MariaDB when TEST_DB_HOST, TEST_DB_USER and TEST_DB_PASSWORD reach a server and TEST_LAGER_DB_NAME
// names an empty database it may wipe (server/README.md, "Tests"), and is skipped otherwise. Its own database,
// because test files run side by side and sync.test.ts wipes the same tables.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { service } from './app.ts';
import { connect, type Db } from './db.ts';
import { LIMITS, parseOp, parseOps, sinceOf } from './lager.ts';

const OK = 200;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const G1 = 'g-magic';
const G2 = 'g-materials';
const I1 = 'i-ring';
const I2 = 'i-ore';
/** 1,234.5 gp in copper. */
const GOLD = 123_450;
const STEP = 1000;
const START = Date.parse('2026-11-15T12:00:00Z');

describe('what a Lager request may say', () => {
  it('reads each kind of op, with defaults for what an add leaves out', () => {
    expect(parseOp({ op: 'addGroup', id: G1, name: ' Magic items ', kind: 'place' }, 0)).toEqual({
      op: 'addGroup',
      id: G1,
      name: 'Magic items',
      kind: 'place',
    });
    expect(parseOp({ op: 'add', id: I1, group: G1, name: 'Ring of Jumping' }, 0)).toEqual({
      op: 'add',
      id: I1,
      group: G1,
      name: 'Ring of Jumping',
      count: 1,
      place: '',
      note: '',
    });
    expect(parseOp({ op: 'count', id: I2, by: -2 }, 0)).toEqual({ op: 'count', id: I2, by: -2 });
    expect(parseOp({ op: 'set', id: I1, place: 'Aria' }, 0)).toEqual({ op: 'set', id: I1, place: 'Aria' });
    expect(parseOp({ op: 'gold', to: GOLD }, 0)).toEqual({ op: 'gold', to: GOLD });
    expect(parseOp({ op: 'gold', by: -100 }, 0)).toEqual({ op: 'gold', by: -100 });
  });

  it('refuses a bad op and says which one and what is wrong', () => {
    const refused = (value: unknown) => {
      try {
        parseOps({ ops: [{ op: 'remove', id: I1 }, value] });
      } catch (error) {
        return { status: (error as { status: number }).status, details: (error as { details: unknown }).details };
      }
      return null;
    };
    expect(refused({ op: 'explode', id: I1 })).toEqual({ status: BAD_REQUEST, details: { index: 1, what: 'op' } });
    expect(refused({ op: 'add', id: I1, group: G1, name: '   ' })).toMatchObject({ details: { what: 'name' } });
    expect(refused({ op: 'add', id: 'a b', group: G1, name: 'x' })).toMatchObject({ details: { what: 'id' } });
    expect(refused({ op: 'count', id: I1, by: 1.5 })).toMatchObject({ details: { what: 'by' } });
    expect(refused({ op: 'gold', by: 1, to: 2 })).toMatchObject({ details: { what: 'gold' } });
    expect(refused({ op: 'gold', to: -1 })).toMatchObject({ details: { what: 'to' } });
    expect(refused({ op: 'addGroup', id: G1, name: 'x', kind: 'list' })).toMatchObject({ details: { what: 'kind' } });
    expect(refused({ op: 'add', id: I1, group: G1, name: 'x', note: 'y'.repeat(LIMITS.note + 1) })).toMatchObject({
      details: { what: 'note' },
    });
    // An op named after an object's own properties is no op.
    expect(refused({ op: 'toString', id: I1 })).toMatchObject({ details: { what: 'op' } });
  });

  it('wants at least one op and not too many', () => {
    expect(() => parseOps({ ops: [] })).toThrow('bad body');
    expect(() => parseOps({})).toThrow('bad body');
    expect(() => parseOps({ ops: Array.from({ length: LIMITS.ops + 1 }, () => ({ op: 'remove', id: I1 })) })).toThrow(
      'bad body',
    );
  });

  it('reads ?since= only when it is a plain version number', () => {
    expect(sinceOf('/lager?since=12')).toBe(12);
    expect(sinceOf('/api/lager?since=0')).toBe(0);
    expect(sinceOf('/lager')).toBeNull();
    expect(sinceOf('/lager?since=-1')).toBeNull();
    expect(sinceOf('/lager?since=1e3')).toBeNull();
    expect(sinceOf('/lager?since=')).toBeNull();
  });
});

const env = process.env;
const settings = {
  DB_HOST: env.TEST_DB_HOST,
  DB_NAME: env.TEST_LAGER_DB_NAME,
  DB_USER: env.TEST_DB_USER,
  DB_PASSWORD: env.TEST_DB_PASSWORD,
};
const ADMIN = 'admin secret';
const TABLES = [
  'lager_items',
  'lager_groups',
  'lager',
  'characters',
  'devices',
  'attempts',
  'players',
  'schema_version',
];

let db: Db;
let server: Server;
let base: string;
let now = START;

async function call(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
}

/** A made-up player with a device signed in; returns the device's token. */
async function player(name: string): Promise<string> {
  const res = await fetch(`${base}/admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept-Language': 'en' },
    body: new URLSearchParams({ password: ADMIN, action: 'add', name }).toString(),
  });
  const page = await res.text();
  const at = page.indexOf('class="code">') + 'class="code">'.length;
  const code = page.slice(at, page.indexOf('<', at));
  const { body } = await call('POST', '/login', { code, device: 'Laptop' });
  return body.token as string;
}

const change = (token: string, ...ops: unknown[]) => call('POST', '/lager', { ops }, token);

interface Item {
  id: string;
  group: string;
  name: string;
  count: number;
  place: string;
  note: string;
  by: string;
}

const items = (body: Record<string, unknown>) => body.items as Item[];
const item = (body: Record<string, unknown>, id: string) => items(body).find((entry) => entry.id === id);

describe.skipIf(!settings.DB_HOST || !settings.DB_NAME)('the Lager on a real database', () => {
  beforeAll(() => {
    db = connect(settings) as Db;
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    now = START;
    await db.change(`DROP TABLE IF EXISTS ${TABLES.join(', ')}`);
    const { handle } = service({ ...settings, ADMIN_PASSWORD: ADMIN }, db, () => now);
    server = createServer((req, res) => void handle(req, res));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('starts empty and needs a signed-in device', async () => {
    expect((await call('GET', '/lager')).status).toBe(UNAUTHORIZED);
    const token = await player('Aria');
    const { status, body } = await call('GET', '/lager', undefined, token);
    expect(status).toBe(OK);
    expect(body).toEqual({ version: 0, copper: 0, goldNote: '', updated: 0, by: '', groups: [], items: [] });
  });

  it('is the same Lager for every player, and says who changed what', async () => {
    const aria = await player('Aria');
    const bram = await player('Bram');
    now += STEP;
    const { body } = await change(
      aria,
      { op: 'addGroup', id: G1, name: 'Magic items', kind: 'place' },
      { op: 'add', id: I1, group: G1, name: 'Ring of Jumping', place: 'Lager', note: 'from the crypt' },
      { op: 'gold', to: GOLD },
      { op: 'goldNote', note: 'some of it is Bram’s' },
    );
    expect(body).toMatchObject({
      version: 1,
      copper: GOLD,
      by: 'Aria',
      updated: now,
      groups: [{ id: G1, kind: 'place' }],
    });
    now += STEP;
    const seen = await change(bram, { op: 'set', id: I1, place: 'Bram' });
    expect(item(seen.body, I1)).toMatchObject({ place: 'Bram', note: 'from the crypt', by: 'Bram' });
    expect((await call('GET', '/lager', undefined, aria)).body).toEqual(seen.body);
  });

  it('answers a device that is up to date with the version only', async () => {
    const token = await player('Aria');
    const { body } = await change(token, { op: 'gold', by: 100 });
    expect((await call('GET', `/lager?since=${body.version as number}`, undefined, token)).body).toEqual({
      version: 1,
    });
    expect((await call('GET', '/lager?since=0', undefined, token)).body.copper).toBe(100);
  });

  it('counts two players’ changes at the same moment both, and never below 0', async () => {
    const aria = await player('Aria');
    const bram = await player('Bram');
    await change(
      aria,
      { op: 'addGroup', id: G2, name: 'Materials', kind: 'count' },
      { op: 'add', id: I2, group: G2, name: 'Iron Ore', count: 17 },
    );
    await Promise.all([change(aria, { op: 'count', id: I2, by: 1 }), change(bram, { op: 'count', id: I2, by: 1 })]);
    const { body } = await call('GET', '/lager', undefined, aria);
    expect(item(body, I2)?.count).toBe(19);
    expect(item((await change(bram, { op: 'count', id: I2, by: -50 })).body, I2)?.count).toBe(0);
    await Promise.all([change(aria, { op: 'gold', by: 250 }), change(bram, { op: 'gold', by: 250 })]);
    expect((await call('GET', '/lager', undefined, aria)).body.copper).toBe(500);
    expect((await change(aria, { op: 'gold', by: -1000 })).body.copper).toBe(0);
  });

  it('does nothing twice: a repeated add, and changes to what someone removed meanwhile', async () => {
    const token = await player('Aria');
    const add = { op: 'add', id: I1, group: G1, name: 'Ring of Jumping' };
    await change(token, { op: 'addGroup', id: G1, name: 'Magic items', kind: 'place' }, add);
    expect(items((await change(token, add)).body)).toHaveLength(1);
    await change(token, { op: 'remove', id: I1 });
    const { status, body } = await change(token, { op: 'count', id: I1, by: 1 }, { op: 'set', id: I1, name: 'Ring' });
    expect(status).toBe(OK);
    expect(items(body)).toEqual([]);
    // Into a group that is gone: nothing is added.
    await change(token, { op: 'removeGroup', id: G1 });
    expect(items((await change(token, add)).body)).toEqual([]);
  });

  it('moves an item to another group, and removes a group with its items', async () => {
    const token = await player('Aria');
    await change(
      token,
      { op: 'addGroup', id: G1, name: 'Magic items', kind: 'place' },
      { op: 'addGroup', id: G2, name: 'Materials', kind: 'count' },
      { op: 'add', id: I1, group: G1, name: 'Ring of Jumping' },
      { op: 'add', id: I2, group: G1, name: 'Iron Ore' },
    );
    expect(item((await change(token, { op: 'set', id: I2, group: G2 })).body, I2)?.group).toBe(G2);
    // A group that doesn't exist leaves the item where it is.
    expect(item((await change(token, { op: 'set', id: I2, group: 'g-none' })).body, I2)?.group).toBe(G2);
    const { body } = await change(token, { op: 'renameGroup', id: G2, name: 'Ore' }, { op: 'removeGroup', id: G1 });
    expect(body.groups).toEqual([{ id: G2, name: 'Ore', kind: 'count' }]);
    expect(items(body).map((entry) => entry.id)).toEqual([I2]);
  });

  it('keeps the items in the order they were added, and an import of a whole list in one request', async () => {
    const token = await player('Aria');
    const names = Array.from({ length: 120 }, (_, index) => `Item ${index}`);
    const { status, body } = await change(
      token,
      { op: 'addGroup', id: G1, name: 'Magic items', kind: 'place' },
      ...names.map((name, index) => ({ op: 'add', id: `i-${index}`, group: G1, name })),
    );
    expect(status).toBe(OK);
    expect(items(body).map((entry) => entry.name)).toEqual(names);
  });

  it('keeps the Lager when the player who changed it is removed', async () => {
    const token = await player('Aria');
    await change(
      token,
      { op: 'addGroup', id: G1, name: 'Magic items', kind: 'place' },
      { op: 'add', id: I1, group: G1, name: 'Ring' },
    );
    await db.change("DELETE FROM players WHERE name = 'Aria'");
    const other = await player('Bram');
    const { body } = await call('GET', '/lager', undefined, other);
    expect(item(body, I1)).toMatchObject({ name: 'Ring', by: '' });
    expect(body.by).toBe('');
  });

  it('refuses a request with one bad op without applying any of it', async () => {
    const token = await player('Aria');
    const { status } = await change(token, { op: 'gold', to: GOLD }, { op: 'count', id: I1 });
    expect(status).toBe(BAD_REQUEST);
    expect((await call('GET', '/lager', undefined, token)).body.copper).toBe(0);
  });
});
