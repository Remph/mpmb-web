// The sync itself (M15 PR 2): a device signs in with its player's code, then saves and loads that player's
// characters. Every save names the version it started from, so a save made from an old copy is refused instead of
// overwriting a newer one; the app keeps the losing copy as a restore point. A device that has a character open
// holds it with a lease it renews; another device then sees "open on <device>" and can read or take over.
//
// The service never looks inside a character: `meta` (what the character list shows) and `data` (the sheet) are
// the app's business. All it checks is their size.
import { checkTries, clearFailures, countFailure } from './attempts.ts';
import { codeMatches, hashToken, newToken, normalCode } from './codes.ts';
import type { Db, Param } from './db.ts';
import { BAD_REQUEST, CONFLICT, isRecord, LOCKED, NOT_FOUND, Refusal, UNAUTHORIZED } from './http.ts';

/** A device holds a character this long after its last renewal; the app renews well before (every 45 s or so). */
export const LEASE_MS = 120_000;
/** `last_seen` is written at most this often, so reads don't turn into writes. */
const SEEN_EVERY_MS = 60_000;
/** The list's part of a character (name, class, a small portrait): 256 KiB is far more than it needs. */
export const META_LIMIT = 262_144;
export const NAME_MAX = 80;
const ID_MAX = 64;

export interface Device {
  id: number;
  playerId: number;
  name: string;
}

/** What a request handler gets: the database and the time (a test passes its own). */
export interface Context {
  db: Db;
  now: number;
}

/** A name a person typed: trimmed, at most NAME_MAX characters, or `fallback` when empty. */
export function cleanName(value: unknown, fallback: string): string {
  const name = typeof value === 'string' ? value.trim().slice(0, NAME_MAX) : '';
  return name || fallback;
}

const isIdChar = (char: string) =>
  (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char === '-';

/** A character's id as the app makes them (crypto.randomUUID: "1b4e28ba-2fa1-…"), or a bad request. */
export function characterId(value: string): string {
  if (!value || value.length > ID_MAX || ![...value].every(isIdChar)) {
    throw new Refusal(BAD_REQUEST, 'bad id');
  }
  return value;
}

const isVersion = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** POST /login {code, device}: the player's code once per device, a token for this device back. */
export async function login(
  { db, now }: Context,
  body: Record<string, unknown>,
  address: string,
): Promise<{ token: string; player: string; device: number }> {
  const key = `login:${address}`;
  await checkTries(db, key, now);
  const code = normalCode(typeof body.code === 'string' ? body.code : '');
  const players = code
    ? await db.rows<{ id: number; name: string; code_hash: string }>('SELECT id, name, code_hash FROM players')
    : [];
  // A handful of players, so trying each hash is quick enough (about 50 ms each), and only once per device.
  const matches = await Promise.all(players.map((player) => codeMatches(code ?? '', player.code_hash)));
  const player = players.find((_, index) => matches[index]);
  if (!player) {
    await countFailure(db, key, now);
    throw new Refusal(UNAUTHORIZED, 'wrong code');
  }
  await clearFailures(db, key);
  const token = newToken();
  const { insertId } = await db.change(
    'INSERT INTO devices (player_id, token_hash, name, created, last_seen) VALUES (?, ?, ?, ?, ?)',
    [player.id, hashToken(token), cleanName(body.device, 'Device'), now, now],
  );
  return { token, player: player.name, device: insertId };
}

/** The device behind a token, or 401 "signed out" (wrong token, or the device was forgotten). */
export async function deviceOf({ db, now }: Context, token: string | null): Promise<Device> {
  if (!token) throw new Refusal(UNAUTHORIZED, 'signed out');
  const [row] = await db.rows<{ id: number; player_id: number; name: string; last_seen: number }>(
    'SELECT id, player_id, name, last_seen FROM devices WHERE token_hash = ?',
    [hashToken(token)],
  );
  if (!row) throw new Refusal(UNAUTHORIZED, 'signed out');
  if (now - row.last_seen >= SEEN_EVERY_MS) {
    await db.change('UPDATE devices SET last_seen = ? WHERE id = ?', [now, row.id]);
  }
  return { id: row.id, playerId: row.player_id, name: row.name };
}

/** GET /devices: the player's name and devices, newest first, so the app can show where the code is used. */
export async function devices({ db }: Context, device: Device) {
  const [player] = await db.rows<{ name: string }>('SELECT name FROM players WHERE id = ?', [device.playerId]);
  const rows = await db.rows<{ id: number; name: string; created: number; last_seen: number }>(
    'SELECT id, name, created, last_seen FROM devices WHERE player_id = ? ORDER BY last_seen DESC',
    [device.playerId],
  );
  return {
    player: player?.name ?? '',
    devices: rows.map((row) => ({
      id: row.id,
      name: row.name,
      created: row.created,
      lastSeen: row.last_seen,
      current: row.id === device.id,
    })),
  };
}

/** DELETE /devices/:id: forgets one of the player's devices (this one: "Forget this device"). */
export async function forgetDevice({ db }: Context, device: Device, id: number): Promise<void> {
  const { affected } = await db.change('DELETE FROM devices WHERE id = ? AND player_id = ?', [id, device.playerId]);
  if (!affected) throw new Refusal(NOT_FOUND, 'not found');
}

interface CharacterRow {
  id: string;
  version: number;
  deleted: number;
  meta: string;
  updated: number;
  device: string | null;
  lease_device: number | null;
  lease_name: string | null;
  lease_since: number | null;
  lease_until: number | null;
}

/** A character's lease while it runs: who holds it, since when and until when. */
function leaseOf(row: CharacterRow, now: number) {
  if (row.lease_device === null || row.lease_until === null || row.lease_until <= now) return null;
  return { device: row.lease_name ?? '', deviceId: row.lease_device, since: row.lease_since, until: row.lease_until };
}

const CHARACTER_COLUMNS = `c.id, c.version, c.deleted, c.meta, c.updated, d.name AS device,
  c.lease_device, l.name AS lease_name, c.lease_since, c.lease_until`;
const CHARACTER_JOINS = `LEFT JOIN devices d ON d.id = c.device_id LEFT JOIN devices l ON l.id = c.lease_device`;

function summary(row: CharacterRow, now: number) {
  return {
    id: row.id,
    version: row.version,
    deleted: Boolean(row.deleted),
    meta: JSON.parse(row.meta) as unknown,
    updated: row.updated,
    device: row.device,
    lease: leaseOf(row, now),
  };
}

/** GET /characters: every character of the player, deleted ones too (so other devices drop them), without data. */
export async function listCharacters({ db, now }: Context, device: Device) {
  const rows = await db.rows<CharacterRow>(
    `SELECT ${CHARACTER_COLUMNS} FROM characters c ${CHARACTER_JOINS} WHERE c.player_id = ? ORDER BY c.updated DESC`,
    [device.playerId],
  );
  return { characters: rows.map((row) => summary(row, now)) };
}

async function rowOf(db: Db, device: Device, id: string): Promise<(CharacterRow & { data: string }) | undefined> {
  const [row] = await db.rows<CharacterRow & { data: string }>(
    `SELECT ${CHARACTER_COLUMNS}, c.data FROM characters c ${CHARACTER_JOINS} WHERE c.player_id = ? AND c.id = ?`,
    [device.playerId, id],
  );
  return row;
}

/** GET /characters/:id: one character with its data. */
export async function getCharacter({ db, now }: Context, device: Device, id: string) {
  const row = await rowOf(db, device, id);
  if (!row) throw new Refusal(NOT_FOUND, 'not found');
  return { ...summary(row, now), data: row.data };
}

/**
 * Why a save or lease didn't take: gone, held by another device, or saved (or deleted) meanwhile from another copy.
 */
async function refusalFor(db: Db, device: Device, id: string, now: number): Promise<Refusal> {
  const row = await rowOf(db, device, id);
  if (!row) return new Refusal(NOT_FOUND, 'not found');
  const lease = leaseOf(row, now);
  if (lease && lease.deviceId !== device.id) return new Refusal(LOCKED, 'open elsewhere', { lease });
  return new Refusal(CONFLICT, 'newer version', {
    version: row.version,
    updated: row.updated,
    device: row.device,
    deleted: Boolean(row.deleted),
  });
}

/** A device may change a character when no other device holds it. */
const FREE = '(lease_device IS NULL OR lease_device = ? OR lease_until <= ?)';

/**
 * PUT /characters/:id {version, meta, data}: saves the character over `version`, the one this device started from
 * (0 for a new character). 409 when another save came first, 423 when another device holds it.
 */
export async function saveCharacter(
  { db, now }: Context,
  device: Device,
  id: string,
  body: Record<string, unknown>,
): Promise<{ version: number; updated: number }> {
  const { version, meta, data } = body;
  if (!isVersion(version) || !isRecord(meta) || typeof data !== 'string') throw new Refusal(BAD_REQUEST, 'bad body');
  const metaText = JSON.stringify(meta);
  if (metaText.length > META_LIMIT) throw new Refusal(BAD_REQUEST, 'meta too large');
  return write(db, device, id, now, version, { deleted: 0, meta: metaText, data });
}

/** DELETE /characters/:id {version}: marks the character deleted (the row stays, so other devices learn of it). */
export async function deleteCharacter(
  { db, now }: Context,
  device: Device,
  id: string,
  body: Record<string, unknown>,
): Promise<{ version: number; updated: number }> {
  if (!isVersion(body.version) || body.version === 0) throw new Refusal(BAD_REQUEST, 'bad body');
  const row = await rowOf(db, device, id);
  return write(db, device, id, now, body.version, { deleted: 1, meta: row?.meta ?? '{}', data: '' });
}

async function write(
  db: Db,
  device: Device,
  id: string,
  now: number,
  from: number,
  values: { deleted: number; meta: string; data: string },
): Promise<{ version: number; updated: number }> {
  const version = from + 1;
  const { deleted, meta, data } = values;
  if (from === 0) {
    // A new character: INSERT IGNORE touches nothing when the id is taken (another device made it first).
    const { affected } = await db.change(
      `INSERT IGNORE INTO characters (player_id, id, version, deleted, meta, data, updated, device_id)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
      [device.playerId, id, deleted, meta, data, now, device.id],
    );
    if (!affected) throw await refusalFor(db, device, id, now);
    return { version, updated: now };
  }
  // A deleted character also lets go of its lease.
  const leaseReset = deleted ? ', lease_device = NULL, lease_since = NULL, lease_until = NULL' : '';
  const params: Param[] = [version, deleted, meta, data, now, device.id, device.playerId, id, from, device.id, now];
  const { affected } = await db.change(
    `UPDATE characters SET version = ?, deleted = ?, meta = ?, data = ?, updated = ?, device_id = ?${leaseReset}
     WHERE player_id = ? AND id = ? AND version = ? AND ${FREE}`,
    params,
  );
  if (!affected) throw await refusalFor(db, device, id, now);
  return { version, updated: now };
}

/**
 * POST /characters/:id/lease {takeOver}: this device holds the character for LEASE_MS more. Refused (423) while
 * another device holds it, unless the player chose "Take over"; the other device then finds out at its next renewal.
 */
export async function holdCharacter(
  { db, now }: Context,
  device: Device,
  id: string,
  body: Record<string, unknown>,
): Promise<{ since: number; until: number }> {
  const takeOver = body.takeOver === true;
  const until = now + LEASE_MS;
  // `lease_since` comes first: MySQL applies the assignments in order, so it still sees the old holder and keeps
  // the start time when this device only renews.
  const { affected } = await db.change(
    `UPDATE characters
     SET lease_since = IF(lease_device <=> ? AND lease_until > ?, lease_since, ?), lease_device = ?, lease_until = ?
     WHERE player_id = ? AND id = ? AND deleted = 0 AND (${FREE} OR ?)`,
    [device.id, now, now, device.id, until, device.playerId, id, device.id, now, takeOver],
  );
  if (!affected) throw await refusalFor(db, device, id, now);
  const row = await rowOf(db, device, id);
  return { since: row?.lease_since ?? now, until };
}

/** DELETE /characters/:id/lease: lets go when the character is closed (only this device's own lease). */
export async function releaseCharacter({ db }: Context, device: Device, id: string): Promise<void> {
  await db.change(
    `UPDATE characters SET lease_device = NULL, lease_since = NULL, lease_until = NULL
     WHERE player_id = ? AND id = ? AND lease_device = ?`,
    [device.playerId, id, device.id],
  );
}
