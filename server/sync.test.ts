// The service against a real MySQL or MariaDB: the SQL is most of what can go wrong. Runs when TEST_DB_HOST,
// TEST_DB_NAME, TEST_DB_USER and TEST_DB_PASSWORD name an empty database it may wipe (server/README.md, "Tests");
// skipped otherwise. The clock is the test's, so leases and lock-outs run out without waiting.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_FAILURES, WINDOW_MS } from './attempts.ts';
import { CODE_WORDS } from './codes.ts';
import { service } from './app.ts';
import { connect, migrate, type Db } from './db.ts';
import { LEASE_MS, META_LIMIT } from './sync.ts';

const env = process.env;
const settings = {
  DB_HOST: env.TEST_DB_HOST,
  DB_NAME: env.TEST_DB_NAME,
  DB_USER: env.TEST_DB_USER,
  DB_PASSWORD: env.TEST_DB_PASSWORD,
};
const ADMIN = 'admin secret';
const START = Date.parse('2026-11-15T12:00:00Z');
const ONE_MS = 1;
const FIRST = 1;
const SECOND = 2;
const ID = '1b4e28ba-2fa1-11d2-883f-0016d3cca427';
const TABLES = ['characters', 'devices', 'attempts', 'players', 'schema_version'];

const OK = 200;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const CONFLICT = 409;
const LOCKED = 423;
const TOO_MANY = 429;

let db: Db;
let server: Server;
let base: string;
let now = START;

interface Answer {
  status: number;
  body: Record<string, unknown>;
  headers: Headers;
}

async function call(method: string, path: string, body?: unknown, token?: string, origin?: string): Promise<Answer> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {}, headers: res.headers };
}

/** Posts the admin form; returns the page. */
async function admin(fields: Record<string, string>): Promise<string> {
  const res = await fetch(`${base}/admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept-Language': 'en' },
    body: new URLSearchParams(fields).toString(),
  });
  return res.text();
}

/** The text in `page` after `before` up to `after`, or '' when `before` isn't there. */
function between(page: string, before: string, after: string): string {
  const start = page.indexOf(before);
  if (start < 0) return '';
  const rest = page.slice(start + before.length);
  return rest.slice(0, rest.indexOf(after));
}

/** Adds a player on the admin page and returns their code. */
async function addPlayer(name: string): Promise<string> {
  const page = await admin({ password: ADMIN, action: 'add', name });
  const code = between(page, 'class="code">', '<');
  if (!code) throw new Error(`no code in the page: ${page}`);
  return code;
}

async function signIn(code: string, device: string): Promise<string> {
  const { status, body } = await call('POST', '/login', { code, device });
  expect(status).toBe(OK);
  return body.token as string;
}

const save = (token: string, version: number, data: string, id = ID) =>
  call('PUT', `/characters/${id}`, { version, meta: { name: 'Paladin' }, data }, token);

describe.skipIf(!settings.DB_HOST)('the sync service on a real database', () => {
  beforeAll(async () => {
    db = connect(settings) as Db;
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    now = START;
    // A clean database each time, and a new service whose migration builds the tables again on its first request.
    // One statement, children before the tables they point to (the pool's connections don't share settings).
    await db.change(`DROP TABLE IF EXISTS ${TABLES.join(', ')}`);
    const { handle } = service({ ...settings, ADMIN_PASSWORD: ADMIN }, db, () => now);
    server = createServer((req, res) => void handle(req, res));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('builds its tables and says it is connected', async () => {
    const { status, body } = await call('GET', '/health');
    expect(status).toBe(OK);
    expect(body.database).toBe('connected');
    expect((await call('GET', '/api/health')).body.database).toBe('connected');
  });

  it('brings the tables up to date again after a step that stopped halfway, or two starts at once', async () => {
    // Two processes starting together (Passenger may run more than one), then a step that only got its first table.
    await Promise.all([migrate(db), migrate(db)]);
    await db.change('DROP TABLE attempts');
    await db.change('UPDATE schema_version SET version = 0');
    expect(await migrate(db)).toBe(FIRST);
    expect(await db.rows('SELECT id, version FROM schema_version')).toEqual([{ id: FIRST, version: FIRST }]);
    expect(await db.rows('SELECT * FROM attempts')).toEqual([]);
  });

  it('gives a new player a code once, and refuses a wrong admin password', async () => {
    expect(await admin({ password: 'wrong', action: 'list' })).toContain('Wrong password.');
    const code = await addPlayer('Aria');
    expect(code.split('-')).toHaveLength(CODE_WORDS);
    expect(await admin({ password: ADMIN, action: 'add', name: 'Aria' })).toContain('That name is taken.');
    const list = await admin({ password: ADMIN, action: 'list' });
    expect(list).toContain('Aria');
    expect(list).not.toContain(code);
  });

  it('signs a device in with the code however it is typed, and refuses a wrong one', async () => {
    const code = await addPlayer('Aria');
    const typed = code.toUpperCase().replaceAll('-', '  ');
    const { status, body } = await call('POST', '/login', { code: typed, device: 'Laptop' });
    expect(status).toBe(OK);
    expect(body.player).toBe('Aria');
    expect((await call('POST', '/login', { code: 'abandon ability able zoo' })).status).toBe(UNAUTHORIZED);
    expect((await call('GET', '/characters')).status).toBe(UNAUTHORIZED);
    expect((await call('GET', '/characters', undefined, 'made-up')).body.error).toBe('signed out');
  });

  it('locks an address out after too many wrong codes, until the window has passed', async () => {
    const code = await addPlayer('Aria');
    await Array.from({ length: MAX_FAILURES }).reduce<Promise<unknown>>(
      (before) => before.then(() => call('POST', '/login', { code: 'abandon ability able zoo' })),
      Promise.resolve(),
    );
    const locked = await call('POST', '/login', { code });
    expect(locked.status).toBe(TOO_MANY);
    expect(locked.body.retryAfter).toBeGreaterThan(0);
    now += WINDOW_MS;
    expect((await call('POST', '/login', { code })).status).toBe(OK);
  });

  it('saves only over the version a device started from', async () => {
    const token = await signIn(await addPlayer('Aria'), 'Laptop');
    expect((await save(token, 0, 'first')).body).toEqual({ version: FIRST, updated: now });
    expect((await save(token, 0, 'made twice')).status).toBe(CONFLICT);
    now += ONE_MS;
    expect((await save(token, FIRST, 'second')).body.version).toBe(SECOND);
    const stale = await save(token, FIRST, 'from an old copy');
    expect(stale.status).toBe(CONFLICT);
    expect(stale.body).toMatchObject({ error: 'newer version', version: SECOND, device: 'Laptop', deleted: false });
    const { body } = await call('GET', `/characters/${ID}`, undefined, token);
    expect(body).toMatchObject({ version: SECOND, data: 'second', meta: { name: 'Paladin' }, deleted: false });
  });

  it('turns down bad ids, bodies and oversized lists', async () => {
    const token = await signIn(await addPlayer('Aria'), 'Laptop');
    expect((await save(token, 0, 'x', 'not/an id')).status).toBe(NOT_FOUND);
    expect((await save(token, 0, 'x', 'semi;colon')).status).toBe(BAD_REQUEST);
    expect((await call('PUT', `/characters/${ID}`, { version: -1, meta: {}, data: '' }, token)).status).toBe(
      BAD_REQUEST,
    );
    const big = { version: 0, meta: { portrait: 'x'.repeat(META_LIMIT) }, data: '' };
    expect((await call('PUT', `/characters/${ID}`, big, token)).body.error).toBe('meta too large');
    expect((await call('GET', `/characters/${ID}`, undefined, token)).status).toBe(NOT_FOUND);
  });

  it('lets one device hold a character, and another read it or take over', async () => {
    const code = await addPlayer('Aria');
    const laptop = await signIn(code, 'Laptop');
    const ipad = await signIn(code, 'iPad');
    await save(laptop, 0, 'first');
    const held = await call('POST', `/characters/${ID}/lease`, {}, laptop);
    expect(held.body).toEqual({ since: START, until: START + LEASE_MS });
    now += ONE_MS;
    // Renewing keeps the start, so the other device can say "open since …".
    expect((await call('POST', `/characters/${ID}/lease`, {}, laptop)).body.since).toBe(START);

    const refused = await call('POST', `/characters/${ID}/lease`, {}, ipad);
    expect(refused.status).toBe(LOCKED);
    expect(refused.body.lease).toMatchObject({ device: 'Laptop', since: START });
    expect((await save(ipad, FIRST, 'not while the laptop has it')).status).toBe(LOCKED);
    const list = await call('GET', '/characters', undefined, ipad);
    expect(list.body.characters).toMatchObject([{ id: ID, lease: { device: 'Laptop' } }]);

    expect((await call('POST', `/characters/${ID}/lease`, { takeOver: true }, ipad)).status).toBe(OK);
    expect((await call('POST', `/characters/${ID}/lease`, {}, laptop)).status).toBe(LOCKED);
    expect((await save(ipad, FIRST, 'taken over')).body.version).toBe(SECOND);

    expect((await call('DELETE', `/characters/${ID}/lease`, undefined, ipad)).status).toBe(NO_CONTENT);
    expect((await call('POST', `/characters/${ID}/lease`, {}, laptop)).status).toBe(OK);
  });

  it('lets a lease run out when its device stops renewing', async () => {
    const code = await addPlayer('Aria');
    const laptop = await signIn(code, 'Laptop');
    const ipad = await signIn(code, 'iPad');
    await save(laptop, 0, 'first');
    await call('POST', `/characters/${ID}/lease`, {}, laptop);
    now += LEASE_MS;
    expect((await call('POST', `/characters/${ID}/lease`, {}, ipad)).body.since).toBe(now);
  });

  it('keeps a deleted character as a mark the other devices see', async () => {
    const code = await addPlayer('Aria');
    const laptop = await signIn(code, 'Laptop');
    await save(laptop, 0, 'first');
    expect((await call('DELETE', `/characters/${ID}`, { version: FIRST }, laptop)).body.version).toBe(SECOND);
    const { body } = await call('GET', `/characters/${ID}`, undefined, laptop);
    expect(body).toMatchObject({ deleted: true, data: '', meta: { name: 'Paladin' } });
    expect((await save(laptop, FIRST, 'from before the delete')).body).toMatchObject({
      error: 'newer version',
      deleted: true,
    });
    expect((await call('POST', `/characters/${ID}/lease`, {}, laptop)).status).toBe(CONFLICT);
  });

  it('keeps players apart, forgets devices, and signs everyone out with a new code', async () => {
    const aria = await signIn(await addPlayer('Aria'), 'Laptop');
    const bren = await signIn(await addPlayer('Bren'), 'Phone');
    await save(aria, 0, 'Aria’s');
    expect((await call('GET', '/characters', undefined, bren)).body.characters).toEqual([]);
    expect((await call('GET', `/characters/${ID}`, undefined, bren)).status).toBe(NOT_FOUND);
    expect((await save(bren, 0, 'Bren’s own, same id')).status).toBe(OK);

    const devices = await call('GET', '/devices', undefined, bren);
    expect(devices.body).toMatchObject({ player: 'Bren', devices: [{ name: 'Phone', current: true }] });
    const phone = (devices.body.devices as { id: number }[])[0]?.id;
    expect((await call('DELETE', `/devices/${phone}`, undefined, aria)).status).toBe(NOT_FOUND);
    expect((await call('DELETE', `/devices/${phone}`, undefined, bren)).status).toBe(NO_CONTENT);
    expect((await call('GET', '/devices', undefined, bren)).status).toBe(UNAUTHORIZED);

    const list = await admin({ password: ADMIN, action: 'list' });
    // Aria comes first: the list is sorted by name.
    const ariaId = between(list, 'name="newCode" value="', '"');
    expect(await admin({ password: ADMIN, newCode: ariaId })).toContain('The code for Aria');
    expect((await call('GET', '/characters', undefined, aria)).status).toBe(UNAUTHORIZED);
  });

  it('removes a player only on the second press, with their devices and characters', async () => {
    const code = await addPlayer('Cato');
    const cato = (await call('POST', '/login', { code, device: 'Laptop' })).body.token as string;
    expect((await save(cato, 0, 'Cato’s')).status).toBe(OK);
    const id = between(await admin({ password: ADMIN, action: 'list' }), 'name="remove" value="', '"');

    const asked = await admin({ password: ADMIN, remove: id });
    expect(asked).toContain('Remove Cato?');
    expect(asked).toContain(`name="removeConfirmed" value="${id}"`);
    expect((await call('GET', '/characters', undefined, cato)).status).toBe(OK);

    const done = await admin({ password: ADMIN, removeConfirmed: id });
    expect(done).toContain('Cato was removed.');
    expect(done).toContain('No players yet.');
    expect((await call('GET', '/characters', undefined, cato)).status).toBe(UNAUTHORIZED);
    const left = await db.rows<{ n: number }>('SELECT COUNT(*) AS n FROM characters');
    expect(Number(left[0]?.n)).toBe(0);
  });

  it('answers the app’s origin with CORS headers, and no other', async () => {
    const app = await call('GET', '/health', undefined, undefined, 'https://remph.de');
    expect(app.headers.get('access-control-allow-origin')).toBe('https://remph.de');
    expect(app.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    const other = await call('GET', '/health', undefined, undefined, 'https://example.com');
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});
