// The sync service's MySQL database (the webspace offers only MySQL, decisions.md 2026-11-15). Plesk hands the
// login in as DB_HOST, DB_NAME, DB_USER and DB_PASSWORD (the password under Secrets).
//
// Times are kept as milliseconds since 1970 (BIGINT), not DATETIME: the service, the database and the players'
// devices may sit in different time zones, and a plain number means the same everywhere.
import { createPool } from 'mysql2/promise';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

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
  close(): Promise<void>;
}

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

function fromPool(pool: Pool): Db {
  return {
    async rows<T>(sql: string, params: readonly Param[] = []) {
      const [rows] = await pool.query<RowDataPacket[]>(sql, [...params]);
      return rows as T[];
    },
    async change(sql: string, params: readonly Param[] = []) {
      const [result] = await pool.query<ResultSetHeader>(sql, [...params]);
      return { affected: result.affectedRows, insertId: result.insertId };
    },
    close: () => pool.end(),
  };
}

/**
 * The tables, one step per schema version. A step never changes once it has run on the webspace: a later change is
 * a new step, so a database at any version can be brought up to date.
 */
const STEPS: readonly (readonly string[])[] = [
  [
    `CREATE TABLE players (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL UNIQUE,
      code_hash VARCHAR(200) NOT NULL,
      created BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE devices (
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
    `CREATE TABLE characters (
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
    `CREATE TABLE attempts (
      address VARCHAR(80) NOT NULL PRIMARY KEY,
      failures INT UNSIGNED NOT NULL,
      since BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],
];

/** Brings the tables up to the newest schema; safe to run on every start. Returns the version it ended at. */
export async function migrate(db: Db): Promise<number> {
  await db.change('CREATE TABLE IF NOT EXISTS schema_version (version INT UNSIGNED NOT NULL) ENGINE=InnoDB');
  const [row] = await db.rows<{ version: number }>('SELECT version FROM schema_version');
  if (!row) await db.change('INSERT INTO schema_version (version) VALUES (0)');
  const from = row?.version ?? 0;
  // One statement after the other: a step's tables refer to the ones before them.
  for (const [index, step] of STEPS.slice(from).entries()) {
    for (const sql of step) await db.change(sql);
    await db.change('UPDATE schema_version SET version = ?', [from + index + 1]);
  }
  return STEPS.length;
}
