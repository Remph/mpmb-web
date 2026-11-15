// MPMB Web's sync service (M15). Plain node:http, no framework; esbuild bundles it with its two libraries
// (mysql2, the code word list) into one file, so the webspace needs no npm install (server/README.md).
//
// The routes, all JSON except the admin page:
//   GET    /health                    how the service runs; no login
//   POST   /login                     {code, device} -> {token, player, device}
//   GET    /devices                   the player's devices
//   DELETE /devices/:id               forget a device
//   GET    /characters                the player's characters, without their data
//   GET    /characters/:id            one character with its data
//   PUT    /characters/:id            {version, meta, data} -> {version, updated}; 409 newer version, 423 held
//   DELETE /characters/:id            {version} -> {version, updated}
//   POST   /characters/:id/lease      {takeOver?} -> {since, until}; 423 when another device holds it
//   DELETE /characters/:id/lease      let go
//   GET    /admin, POST /admin        the admin page (players and their codes)
// Everything but /health, /login and /admin needs "Authorization: Bearer <token>".
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ADMIN_HEADERS, adminPage, adminPost, langOf, noDatabaseView } from './admin.ts';
import { connect, migrate, type Db } from './db.ts';
import { health, type DatabaseState } from './health.ts';
import {
  addressOf,
  allowedOrigins,
  BAD_REQUEST,
  bearer,
  corsHeaders,
  NO_CONTENT,
  NOT_FOUND,
  OK,
  readJson,
  readText,
  Refusal,
  sendHtml,
  sendJson,
  SERVER_ERROR,
  UNAVAILABLE,
} from './http.ts';
import {
  characterId,
  deleteCharacter,
  deviceOf,
  devices,
  forgetDevice,
  getCharacter,
  holdCharacter,
  listCharacters,
  login,
  releaseCharacter,
  saveCharacter,
  type Context,
  type Device,
} from './sync.ts';

/** Passenger hands the port in; by hand it is this one (`node dist/app.cjs`, then open localhost:3000/health). */
const DEFAULT_PORT = 3000;
/** The largest body: a character with a portrait is a few megabytes; MySQL's default packet limit is 16 MB. */
const MIB = 1_048_576;
const BODY_MIB = 12;
const BODY_LIMIT = BODY_MIB * MIB;
/** The admin form is a few short fields. */
const FORM_LIMIT = 4096;
/** Paths may start with /api, in case the service ends up mounted under it. */
const PREFIX = '/api';

type Env = Readonly<Record<string, string | undefined>>;

export interface Service {
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  /** Resolves once the tables are up to date (rejects when the database can't be reached). */
  ready: () => Promise<void>;
}

/**
 * The path's parts without the optional /api: "/api/characters/abc/lease" -> ["characters", "abc", "lease"]. A path
 * it can't read ("/characters/%", an absolute URL with a broken host) is a bad request, not an error that escapes.
 */
/** A driver error's code ("ECONNREFUSED", "ER_ACCESS_DENIED_ERROR"), or "unknown": never its message. */
export function errorCode(error: unknown): string {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : 'unknown';
}

export function partsOf(url: string | undefined): string[] {
  try {
    const path = new URL(url ?? '/', 'http://localhost').pathname;
    const rest = path === PREFIX || path.startsWith(`${PREFIX}/`) ? path.slice(PREFIX.length) : path;
    return rest.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    throw new Refusal(BAD_REQUEST, 'bad path');
  }
}

/** One request that needs a signed-in device, routed by method and path. Returns the answer's body. */
async function signedIn(context: Context, device: Device, req: IncomingMessage, parts: string[]): Promise<unknown> {
  const [what, id, sub, ...more] = parts;
  const method = req.method ?? 'GET';
  if (more.length) throw new Refusal(NOT_FOUND, 'not found');
  const body = method === 'PUT' || method === 'POST' || method === 'DELETE' ? await readJson(req, BODY_LIMIT) : {};
  if (what === 'devices' && id === undefined && method === 'GET') return devices(context, device);
  if (what === 'devices' && id !== undefined && sub === undefined && method === 'DELETE') {
    const number = Number(id);
    if (!Number.isSafeInteger(number)) throw new Refusal(BAD_REQUEST, 'bad id');
    return forgetDevice(context, device, number);
  }
  if (what !== 'characters') throw new Refusal(NOT_FOUND, 'not found');
  if (id === undefined && method === 'GET') return listCharacters(context, device);
  const character = characterId(id ?? '');
  const routes: Record<string, () => Promise<unknown>> = {
    'GET ': () => getCharacter(context, device, character),
    'PUT ': () => saveCharacter(context, device, character, body),
    'DELETE ': () => deleteCharacter(context, device, character, body),
    'POST lease': () => holdCharacter(context, device, character, body),
    'DELETE lease': () => releaseCharacter(context, device, character),
  };
  const route = routes[`${method} ${sub ?? ''}`];
  if (!route) throw new Refusal(NOT_FOUND, 'not found');
  return route();
}

export function service(env: Env, db: Db | null, clock: () => number = Date.now): Service {
  const origins = allowedOrigins(env);
  // The tables are brought up to date once; after a failure (database down), the next request tries again.
  let migrated: Promise<void> | null = null;
  const ready = (): Promise<void> => {
    if (!db) return Promise.reject(new Refusal(UNAVAILABLE, 'no database'));
    const database = db;
    migrated ??= (async () => {
      try {
        await migrate(database);
      } catch (error) {
        migrated = null;
        throw error;
      }
    })();
    return migrated;
  };

  /** The database's state, and the error code when it can't be reached (logged in full for Plesk's log). */
  async function databaseState(): Promise<{ state: DatabaseState; error?: string }> {
    if (!db) return { state: 'not configured' };
    try {
      await ready();
      await db.rows('SELECT 1');
      return { state: 'connected' };
    } catch (error) {
      console.error(error);
      return { state: 'unreachable', error: errorCode(error) };
    }
  }

  async function admin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const lang = langOf(req.headers['accept-language']);
    if (req.method !== 'POST') return sendHtml(res, OK, adminPage(lang), ADMIN_HEADERS);
    const form = new URLSearchParams(await readText(req, FORM_LIMIT));
    if (!db) return sendHtml(res, OK, adminPage(lang, noDatabaseView(lang)), ADMIN_HEADERS);
    await ready();
    const view = await adminPost({ db, now: clock() }, form, addressOf(req), env.ADMIN_PASSWORD ?? '', lang);
    return sendHtml(res, OK, adminPage(lang, view), ADMIN_HEADERS);
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const cors = corsHeaders(req.headers.origin, origins);
    // Everything that can throw stays inside the try: start() doesn't wait for handle(), so an error that escaped
    // it would be an unhandled rejection, which ends the whole process (until Passenger starts it again).
    try {
      const parts = partsOf(req.url);
      if (req.method === 'OPTIONS') return sendJson(res, NO_CONTENT, undefined, cors);
      if (parts[0] === 'health' && parts.length === 1) {
        const { state, error } = await databaseState();
        return sendJson(res, OK, health(env, process.uptime(), new Date(clock()), state, error), cors);
      }
      if (parts[0] === 'admin' && parts.length === 1) return await admin(req, res);
      await ready();
      // `ready` rejects without a database, so it is there from here on.
      const context: Context = { db: db as Db, now: clock() };
      if (parts[0] === 'login' && parts.length === 1 && req.method === 'POST') {
        const body = await readJson(req, BODY_LIMIT);
        return sendJson(res, OK, await login(context, body, addressOf(req)), cors);
      }
      const device = await deviceOf(context, bearer(req));
      const answer = await signedIn(context, device, req, parts);
      return answer === undefined ? sendJson(res, NO_CONTENT, undefined, cors) : sendJson(res, OK, answer, cors);
    } catch (error) {
      if (error instanceof Refusal) return sendJson(res, error.status, { error: error.reason, ...error.details }, cors);
      // Passenger writes this into the app's log, which Plesk shows on the Node.js page.
      console.error(error);
      return sendJson(res, SERVER_ERROR, { error: 'server error' }, cors);
    }
  }

  return { handle, ready };
}

/** Starts the service (main.ts, the bundle's entry); a test imports `service` without starting anything. */
export function start(env: Env = process.env): void {
  const { handle } = service(env, connect(env));
  // handle() answers every error itself; this is the last guard, so a slip there can't end the process.
  createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      console.error(error);
      res.destroy();
    });
  }).listen(Number(env.PORT) || DEFAULT_PORT);
}
