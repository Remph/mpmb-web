// The sync service's MySQL database (the webspace offers only MySQL, decisions.md 2026-11-15). Plesk hands the
// login in as DB_HOST, DB_NAME, DB_USER and DB_PASSWORD (the password under Secrets).
//
// Times are kept as milliseconds since 1970 (BIGINT), not DATETIME: the service, the database and the players'
// devices may sit in different time zones, and a plain number means the same everywhere.
import { createPool } from 'mysql2/promise';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

type Env = Readonly<Record<string, string | undefined>>;

/** A value a query can carry. */
export type Param = string | number | boolean | null;

/** What the service needs from a database: rows back, or how many rows a change touched. */
export interface Db {
  rows<T>(sql: string, params?: readonly Param[]): Promise<T[]>;
  /**
   * Runs a change and returns the number of rows its WHERE matched (0: none). mysql2 asks for FOUND_ROWS by default,
   * so an update that writes the same values again still counts its row.
   */
  change(sql: string, params?: readonly Param[]): Promise<{ affected: number; insertId: number }>;
  /**
   * Runs `work` in one transaction on one connection: all of its changes count, or none (an error rolls them back).
   * Only for data tables: MySQL commits a CREATE TABLE at once, whatever the transaction says.
   */
  transaction<T>(work: (db: Queries) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** What a transaction's work may do: queries on its own connection, no nesting. */
export type Queries = Pick<Db, 'rows' | 'change'>;

/** A webspace has few connections to spare; the group is a handful of players. */
const CONNECTIONS = 4;

/** The database the `DB_*` settings name, or null when one of them is missing. */
export function connect(env: Env): Db | null {
  const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD } = env;
  if (!DB_HOST || !DB_NAME || !DB_USER || !DB_PASSWORD) return null;
  const pool = createPool({
    host: DB_HOST,
    port: env.DB_PORT ? Number(env.DB_PORT) : undefined,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    connectionLimit: CONNECTIONS,
    charset: 'utf8mb4',
    // BIGINT columns hold times in milliseconds: well inside a JavaScript number, so read them as one.
    supportBigNumbers: true,
    bigNumberStrings: false,
  });
  return fromPool(pool);
}

/** A pool hands each query to any free connection; a transaction needs all of them on the same one. */
function queriesOn(on: Pool | PoolConnection): Queries {
  return {
    async rows<T>(sql: string, params: readonly Param[] = []) {
      const [rows] = await on.query<RowDataPacket[]>(sql, [...params]);
      return rows as T[];
    },
    async change(sql: string, params: readonly Param[] = []) {
      const [result] = await on.query<ResultSetHeader>(sql, [...params]);
      return { affected: result.affectedRows, insertId: result.insertId };
    },
  };
}

/** Tries of a transaction that MySQL ended as a deadlock: it rolled it back, so running it again is safe. */
const DEADLOCK_TRIES = 3;
const ER_LOCK_DEADLOCK = 1213;

const isDeadlock = (error: unknown) => (error as { errno?: unknown } | null)?.errno === ER_LOCK_DEADLOCK;

async function inTransaction<T>(pool: Pool, work: (db: Queries) => Promise<T>): Promise<T> {
  for (let tries = 1; ; tries++) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(queriesOn(connection));
      await connection.commit();
      return result;
    } catch (error) {
      // A rollback that fails too (the connection broke) must not hide the first error.
      await connection.rollback().catch(() => undefined);
      if (!isDeadlock(error) || tries >= DEADLOCK_TRIES) throw error;
    } finally {
      connection.release();
    }
  }
}

function fromPool(pool: Pool): Db {
  return {
    ...queriesOn(pool),
    transaction: (work) => inTransaction(pool, work),
    close: () => pool.end(),
  };
}

/**
 * The tables, one step per schema version. A step never changes once it has run on the webspace: a later change is
 * a new step, so a database at any version can be brought up to date. MySQL can't roll back a CREATE TABLE, so a
 * step that stopped halfway (the webspace's MySQL refusing one table) left the tables before it behind; IF NOT EXISTS
 * lets the next try carry on instead of failing on them for good.
 */
const STEPS: readonly (readonly string[])[] = [
  [
    `CREATE TABLE IF NOT EXISTS players (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL UNIQUE,
      code_hash VARCHAR(200) NOT NULL,
      created BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS devices (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      player_id INT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL UNIQUE,
      name VARCHAR(80) NOT NULL,
      created BIGINT NOT NULL,
      last_seen BIGINT NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    // One row per character and player. `data` is the character as the app sends it; the service never reads it.
    // A deleted character keeps its row (deleted = 1, empty data) so the other devices learn of it.
    `CREATE TABLE IF NOT EXISTS characters (
      player_id INT UNSIGNED NOT NULL,
      id VARCHAR(64) NOT NULL,
      version INT UNSIGNED NOT NULL,
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      meta MEDIUMTEXT NOT NULL,
      data LONGTEXT NOT NULL,
      updated BIGINT NOT NULL,
      device_id INT UNSIGNED NULL,
      lease_device INT UNSIGNED NULL,
      lease_since BIGINT NULL,
      lease_until BIGINT NULL,
      PRIMARY KEY (player_id, id),
      FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
      FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE SET NULL,
      FOREIGN KEY (lease_device) REFERENCES devices (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    // Wrong codes and admin passwords per address, to slow down guessing.
    `CREATE TABLE IF NOT EXISTS attempts (
      address VARCHAR(80) NOT NULL PRIMARY KEY,
      failures INT UNSIGNED NOT NULL,
      since BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],
  // M16: the group's Lager (lager.ts). One row in `lager` (id 1) for the gold and the version every change moves
  // on; groups and items by the ids the app makes. `updated_by` names the player; it stays when they are removed
  // (SET NULL), so the Lager never loses items with a player.
  [
    `CREATE TABLE IF NOT EXISTS lager (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      version INT UNSIGNED NOT NULL,
      copper BIGINT NOT NULL,
      gold_note VARCHAR(200) NOT NULL,
      updated BIGINT NOT NULL,
      updated_by INT UNSIGNED NULL,
      FOREIGN KEY (updated_by) REFERENCES players (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    "INSERT IGNORE INTO lager (id, version, copper, gold_note, updated) VALUES (1, 0, 0, '', 0)",
    `CREATE TABLE IF NOT EXISTS lager_groups (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      kind VARCHAR(8) NOT NULL,
      position INT UNSIGNED NOT NULL,
      updated BIGINT NOT NULL,
      updated_by INT UNSIGNED NULL,
      FOREIGN KEY (updated_by) REFERENCES players (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS lager_items (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      group_id VARCHAR(64) NOT NULL,
      name VARCHAR(200) NOT NULL,
      count INT UNSIGNED NOT NULL,
      place VARCHAR(80) NOT NULL,
      note MEDIUMTEXT NOT NULL,
      position INT UNSIGNED NOT NULL,
      updated BIGINT NOT NULL,
      updated_by INT UNSIGNED NULL,
      FOREIGN KEY (group_id) REFERENCES lager_groups (id) ON DELETE CASCADE,
      FOREIGN KEY (updated_by) REFERENCES players (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    // The ids of the requests applied lately, so one sent again (a retry) changes nothing the second time.
    `CREATE TABLE IF NOT EXISTS lager_requests (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      at BIGINT NOT NULL,
      KEY (at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],
];

/** Brings the tables up to the newest schema; safe to run on every start. Returns the version it ended at. */
export async function migrate(db: Db): Promise<number> {
  // Always one row, id 1: a second process starting at the same moment can't add another (INSERT IGNORE), and
  // hosts that require a primary key on every table accept it. The steps' IF NOT EXISTS makes running one twice
  // harmless.
  await db.change(`CREATE TABLE IF NOT EXISTS schema_version (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    version INT UNSIGNED NOT NULL
  ) ENGINE=InnoDB`);
  await db.change('INSERT IGNORE INTO schema_version (id, version) VALUES (1, 0)');
  const [row] = await db.rows<{ version: number }>('SELECT version FROM schema_version WHERE id = 1');
  const from = row?.version ?? 0;
  // One statement after the other: a step's tables refer to the ones before them.
  for (const [index, step] of STEPS.slice(from).entries()) {
    for (const sql of step) await db.change(sql);
    await db.change('UPDATE schema_version SET version = ? WHERE id = 1', [from + index + 1]);
  }
  return STEPS.length;
}
