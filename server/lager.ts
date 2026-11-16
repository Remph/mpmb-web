// The group's storage, the "Lager" (M16, decisions.md 2026-11-15): one shared list for everyone with a sync code.
// Groups of items ("magic items", "materials", …), each either with a place per item (in the Lager, with a
// character, gone) or with counts; and the group's gold.
//
// Several players change it at the same table, so changes come as small steps ("ops"), not as a whole new list:
// counts and gold move by a difference, so two players' "+1" at the same moment both count; a name, place or note
// is simply the last one written. The app asks for the Lager every few seconds while it is open; `since` lets it
// ask cheaply (an unchanged Lager answers with its version only).
import type { Param, Queries } from './db.ts';
import { BAD_REQUEST, isRecord, Refusal } from './http.ts';
import type { Context, Device } from './sync.ts';

/** How a group shows its items: a place per item (magic items) or a count per item (materials). */
export type GroupKind = 'place' | 'count';

/** Ops in one request: the app's import of a whole list sends a few hundred at once. */
const MAX_OPS = 1000;
const MAX_GROUPS = 50;
const MAX_ITEMS = 3000;
const GROUP_NAME_MAX = 80;
const ITEM_NAME_MAX = 200;
const PLACE_MAX = 80;
/** Item texts (a magic item's description) run to a few hundred words. */
const NOTE_MAX = 20_000;
const GOLD_NOTE_MAX = 200;
const COUNT_MAX = 1_000_000;
/** Gold in copper (1 gp = 100 cp, so "1234.5 gp" is exact); a trillion copper is plenty. */
const COPPER_MAX = 1_000_000_000_000;
/** As long as a character's id (crypto.randomUUID is 36). */
const ID_MAX = 64;
/**
 * How long the service remembers a request's id, so the same request sent again changes nothing. A retry comes
 * seconds later; a laptop that slept with a request on its way may send it again days later.
 */
const REQUEST_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export const LIMITS = {
  ops: MAX_OPS,
  groups: MAX_GROUPS,
  items: MAX_ITEMS,
  groupName: GROUP_NAME_MAX,
  itemName: ITEM_NAME_MAX,
  place: PLACE_MAX,
  note: NOTE_MAX,
  goldNote: GOLD_NOTE_MAX,
  count: COUNT_MAX,
  copper: COPPER_MAX,
  id: ID_MAX,
} as const;

export type Op =
  | { op: 'addGroup'; id: string; name: string; kind: GroupKind }
  | { op: 'renameGroup'; id: string; name: string }
  | { op: 'removeGroup'; id: string }
  | { op: 'add'; id: string; group: string; name: string; count: number; place: string; note: string }
  | { op: 'count'; id: string; by: number }
  | { op: 'set'; id: string; name?: string; place?: string; note?: string; group?: string }
  | { op: 'remove'; id: string }
  | { op: 'gold'; by?: number; to?: number }
  | { op: 'goldNote'; note: string };

export interface LagerGroup {
  id: string;
  name: string;
  kind: GroupKind;
}

export interface LagerItem {
  id: string;
  group: string;
  name: string;
  count: number;
  place: string;
  note: string;
  updated: number;
  /** The player who changed it last, or '' when that player has been removed. */
  by: string;
}

export interface Lager {
  version: number;
  /** In copper: 123450 is 1,234.5 gp. */
  copper: number;
  goldNote: string;
  updated: number;
  by: string;
  groups: LagerGroup[];
  items: LagerItem[];
}

const isIdChar = (char: string) =>
  (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char === '-';

const bad = (index: number, what: string) => new Refusal(BAD_REQUEST, 'bad op', { index, what });

const isId = (value: unknown): value is string =>
  typeof value === 'string' && !!value && value.length <= LIMITS.id && [...value].every(isIdChar);

/** An id the app made (crypto.randomUUID). */
function idOf(value: unknown, index: number): string {
  if (!isId(value)) throw bad(index, 'id');
  return value;
}

/** A text a player typed: trimmed (a note keeps its inner lines), at most `max` characters. */
function textOf(value: unknown, max: number, index: number, what: string, required = false): string {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string') throw bad(index, what);
  const text = value.trim();
  if (text.length > max || (required && !text)) throw bad(index, what);
  return text;
}

const optional = (body: Record<string, unknown>, key: string, max: number, index: number, required = false) =>
  body[key] === undefined ? undefined : textOf(body[key], max, index, key, required);

function wholeOf(value: unknown, min: number, max: number, index: number, what: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw bad(index, what);
  return value as number;
}

type Body = Record<string, unknown>;

/** Checks the fields of each kind of op; `id` reads the op's own id. */
const PARSERS: Record<Op['op'], (value: Body, index: number, id: () => string) => Op> = {
  addGroup: (value, index, id) => {
    if (value.kind !== 'place' && value.kind !== 'count') throw bad(index, 'kind');
    return {
      op: 'addGroup',
      id: id(),
      name: textOf(value.name, LIMITS.groupName, index, 'name', true),
      kind: value.kind,
    };
  },
  renameGroup: (value, index, id) => ({
    op: 'renameGroup',
    id: id(),
    name: textOf(value.name, LIMITS.groupName, index, 'name', true),
  }),
  removeGroup: (_value, _index, id) => ({ op: 'removeGroup', id: id() }),
  add: (value, index, id) => ({
    op: 'add',
    id: id(),
    group: idOf(value.group, index),
    name: textOf(value.name, LIMITS.itemName, index, 'name', true),
    count: value.count === undefined ? 1 : wholeOf(value.count, 0, LIMITS.count, index, 'count'),
    place: textOf(value.place, LIMITS.place, index, 'place'),
    note: textOf(value.note, LIMITS.note, index, 'note'),
  }),
  count: (value, index, id) => ({
    op: 'count',
    id: id(),
    by: wholeOf(value.by, -LIMITS.count, LIMITS.count, index, 'by'),
  }),
  set: (value, index, id) => {
    const name = optional(value, 'name', LIMITS.itemName, index, true);
    const place = optional(value, 'place', LIMITS.place, index);
    const note = optional(value, 'note', LIMITS.note, index);
    const group = value.group === undefined ? undefined : idOf(value.group, index);
    // Only the fields the op names: a missing one stays as it is.
    return {
      op: 'set',
      id: id(),
      ...(name === undefined ? {} : { name }),
      ...(place === undefined ? {} : { place }),
      ...(note === undefined ? {} : { note }),
      ...(group === undefined ? {} : { group }),
    };
  },
  remove: (_value, _index, id) => ({ op: 'remove', id: id() }),
  gold: (value, index) => {
    // Either a change ("+150 gp") or a new total, not both.
    if ((value.by === undefined) === (value.to === undefined)) throw bad(index, 'gold');
    return value.by !== undefined
      ? { op: 'gold', by: wholeOf(value.by, -LIMITS.copper, LIMITS.copper, index, 'by') }
      : { op: 'gold', to: wholeOf(value.to, 0, LIMITS.copper, index, 'to') };
  },
  goldNote: (value, index) => ({ op: 'goldNote', note: textOf(value.note, LIMITS.goldNote, index, 'note') }),
};

const isOpName = (value: unknown): value is Op['op'] => typeof value === 'string' && Object.hasOwn(PARSERS, value);

/** One op from the request body, checked; throws 400 "bad op" with its index and the field that is wrong. */
export function parseOp(value: unknown, index: number): Op {
  if (!isRecord(value) || !isOpName(value.op)) throw bad(index, 'op');
  return PARSERS[value.op](value, index, () => idOf(value.id, index));
}

/** The body of POST /lager: `{ops: [...]}`, every op checked before any is applied. */
export function parseOps(body: Record<string, unknown>): Op[] {
  const { ops } = body;
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > LIMITS.ops) throw new Refusal(BAD_REQUEST, 'bad body');
  return ops.map(parseOp);
}

/** The request's own id (`request`, made by the app once per request and sent again with a retry), or null. */
export function requestOf(body: Record<string, unknown>): string | null {
  if (body.request === undefined) return null;
  if (!isId(body.request)) throw new Refusal(BAD_REQUEST, 'bad request id');
  return body.request;
}

interface GroupRow {
  id: string;
  name: string;
  kind: GroupKind;
}

interface ItemRow {
  id: string;
  group_id: string;
  name: string;
  count: number;
  place: string;
  note: string;
  updated: number;
  by_name: string | null;
}

interface LagerRow {
  version: number;
  copper: number;
  gold_note: string;
  updated: number;
  by_name: string | null;
}

/** GET /lager: the whole Lager, or only `{version}` when it is still at `since` (the app's polling). */
export async function readLager({ db }: Context, since: number | null): Promise<Lager | { version: number }> {
  const [head] = await db.rows<LagerRow>(
    `SELECT l.version, l.copper, l.gold_note, l.updated, p.name AS by_name
     FROM lager l LEFT JOIN players p ON p.id = l.updated_by WHERE l.id = 1`,
  );
  if (!head) throw new Error('the lager row is missing');
  if (since !== null && since === head.version) return { version: head.version };
  const groups = await db.rows<GroupRow>('SELECT id, name, kind FROM lager_groups ORDER BY position, id');
  const items = await db.rows<ItemRow>(
    `SELECT i.id, i.group_id, i.name, i.count, i.place, i.note, i.updated, p.name AS by_name
     FROM lager_items i LEFT JOIN players p ON p.id = i.updated_by ORDER BY i.position, i.id`,
  );
  return {
    version: head.version,
    copper: Number(head.copper),
    goldNote: head.gold_note,
    updated: Number(head.updated),
    by: head.by_name ?? '',
    groups: groups.map(({ id, name, kind }) => ({ id, name, kind })),
    items: items.map((row) => ({
      id: row.id,
      group: row.group_id,
      name: row.name,
      count: row.count,
      place: row.place,
      note: row.note,
      updated: Number(row.updated),
      by: row.by_name ?? '',
    })),
  };
}

async function countOf(db: Queries, table: 'lager_groups' | 'lager_items'): Promise<number> {
  const [row] = await db.rows<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return Number(row?.n ?? 0);
}

/** The next position at the end of a list, so new groups and items come last. */
async function nextPosition(db: Queries, table: 'lager_groups' | 'lager_items'): Promise<number> {
  const [row] = await db.rows<{ p: number | null }>(`SELECT MAX(position) AS p FROM ${table}`);
  return Number(row?.p ?? 0) + 1;
}

type Apply<K extends Op['op']> = (db: Queries, op: Extract<Op, { op: K }>, stamp: Param[]) => Promise<void>;

/** The columns a "set" op may change, in the order they are written. */
const SET_COLUMNS = ['name', 'place', 'note'] as const;

/**
 * What each op does. Ops on an item or group that someone else removed meanwhile do nothing (the app learns at its
 * next read), and adding with an id that exists already does nothing either. (A count or gold step sent twice would
 * count twice: the request's id guards against that, changeLager.) `stamp` is [now, player].
 */
const APPLY: { [K in Op['op']]: Apply<K> } = {
  addGroup: async (db, op, stamp) => {
    if ((await countOf(db, 'lager_groups')) >= LIMITS.groups) throw new Refusal(BAD_REQUEST, 'too many groups');
    await db.change(
      'INSERT IGNORE INTO lager_groups (id, name, kind, position, updated, updated_by) VALUES (?, ?, ?, ?, ?, ?)',
      [op.id, op.name, op.kind, await nextPosition(db, 'lager_groups'), ...stamp],
    );
  },
  renameGroup: async (db, op, stamp) => {
    await db.change('UPDATE lager_groups SET name = ?, updated = ?, updated_by = ? WHERE id = ?', [
      op.name,
      ...stamp,
      op.id,
    ]);
  },
  removeGroup: async (db, op) => {
    // Its items go with it (the app asks first when the group isn't empty).
    await db.change('DELETE FROM lager_items WHERE group_id = ?', [op.id]);
    await db.change('DELETE FROM lager_groups WHERE id = ?', [op.id]);
  },
  add: async (db, op, stamp) => {
    if ((await countOf(db, 'lager_items')) >= LIMITS.items) throw new Refusal(BAD_REQUEST, 'too many items');
    // Only into a group that is still there: INSERT … SELECT finds no row when it was removed meanwhile.
    await db.change(
      `INSERT IGNORE INTO lager_items (id, group_id, name, count, place, note, position, updated, updated_by)
       SELECT ?, id, ?, ?, ?, ?, ?, ?, ? FROM lager_groups WHERE id = ?`,
      [op.id, op.name, op.count, op.place, op.note, await nextPosition(db, 'lager_items'), ...stamp, op.group],
    );
  },
  count: async (db, op, stamp) => {
    // Never below 0 and never above the limit, whatever two players did at once.
    await db.change(
      `UPDATE lager_items SET count = LEAST(?, GREATEST(0, CAST(count AS SIGNED) + ?)), updated = ?, updated_by = ?
       WHERE id = ?`,
      [LIMITS.count, op.by, ...stamp, op.id],
    );
  },
  set: async (db, op, stamp) => {
    const named = SET_COLUMNS.filter((column) => op[column] !== undefined);
    const sets = named.map((column) => `${column} = ?`);
    const params: Param[] = named.map((column) => op[column] ?? '');
    if (op.group !== undefined) {
      // Moved only into a group that exists; otherwise it stays where it is.
      sets.push('group_id = COALESCE((SELECT g.id FROM lager_groups g WHERE g.id = ?), group_id)');
      params.push(op.group);
    }
    if (!sets.length) return;
    await db.change(`UPDATE lager_items SET ${sets.join(', ')}, updated = ?, updated_by = ? WHERE id = ?`, [
      ...params,
      ...stamp,
      op.id,
    ]);
  },
  remove: async (db, op) => {
    await db.change('DELETE FROM lager_items WHERE id = ?', [op.id]);
  },
  gold: async (db, op) => {
    if (op.to !== undefined) {
      await db.change('UPDATE lager SET copper = ? WHERE id = 1', [op.to]);
      return;
    }
    await db.change('UPDATE lager SET copper = LEAST(?, GREATEST(0, copper + ?)) WHERE id = 1', [
      LIMITS.copper,
      op.by ?? 0,
    ]);
  },
  goldNote: async (db, op) => {
    await db.change('UPDATE lager SET gold_note = ? WHERE id = 1', [op.note]);
  },
};

/** Applies one op (TypeScript can't pair a union member with its table entry, hence the cast). */
const apply = (db: Queries, op: Op, stamp: Param[]): Promise<void> =>
  (APPLY[op.op] as Apply<Op['op']>)(db, op as never, stamp);

/** Thrown inside the transaction when the request was applied before: rolls back the version step. */
class Repeated extends Error {}

/**
 * POST /lager {ops, request?}: applies the ops in order and answers with the Lager as it is now. A request counts
 * whole or not at all (an op can still fail while it is applied, "too many items"), and one with an id the service
 * has seen counts once, so the app may send it again when the answer got lost.
 */
export async function changeLager(context: Context, device: Device, body: Record<string, unknown>): Promise<Lager> {
  const ops = parseOps(body);
  const request = requestOf(body);
  const { db, now } = context;
  const stamp = [now, device.playerId];
  try {
    await db.transaction(async (tx) => {
      // One version number for the whole Lager: every change moves it on, so a device that still has the old one
      // knows to read again. Moving it first also locks the Lager's row until the commit, so the players' requests
      // run one after the other: no deadlocks between two requests that touch the same items in another order,
      // and the limits and positions count what is really there.
      await tx.change('UPDATE lager SET version = version + 1, updated = ?, updated_by = ? WHERE id = 1', stamp);
      if (request !== null) {
        await tx.change('DELETE FROM lager_requests WHERE at < ?', [now - REQUEST_KEEP_MS]);
        const { affected } = await tx.change('INSERT IGNORE INTO lager_requests (id, at) VALUES (?, ?)', [
          request,
          now,
        ]);
        if (!affected) throw new Repeated();
      }
      // One after the other, in the order the player made them.
      for (const op of ops) await apply(tx, op, stamp);
    });
  } catch (error) {
    if (!(error instanceof Repeated)) throw error;
  }
  return (await readLager(context, null)) as Lager;
}

/** `?since=12` from the request's address, or null. */
export function sinceOf(url: string | undefined): number | null {
  try {
    const value = new URL(url ?? '/', 'http://localhost').searchParams.get('since');
    // Digits only, at most 15 (a safe integer): "12" is a version, "-1", "1e3" and "" are not.
    if (value === null || !/^\d{1,15}$/.test(value)) return null;
    return Number(value);
  } catch {
    return null;
  }
}
