// What GET /health reports: how the webspace runs the service, and whether it reaches its database. The Node
// version, which the hosting spike (#101) needed, is left out now that the hosting is settled: no need to tell it.
// Pure, so a test can call it with a made-up environment.

/** The answer of GET /health, as JSON. */
export interface Health {
  ok: true;
  service: 'mpmb-web-sync';
  /** How the process was started: under Phusion Passenger (Plesk's way) or by hand. */
  runner: 'passenger' | 'plain';
  /** Seconds since the process started: shows whether Passenger keeps it running between requests. */
  uptime: number;
  /** Whether the database settings are there and the service reaches it (the settings never leave the server). */
  database: DatabaseState;
  /**
   * Why the database is unreachable: the driver's error code ("ECONNREFUSED", "ER_ACCESS_DENIED_ERROR"), which names
   * the kind of failure without any of the settings. Only while `database` is "unreachable".
   */
  databaseError?: string;
  /** Only with DB_DEBUG=1, while setting the database up: see DatabaseDebug. */
  databaseDebug?: DatabaseDebug;
  time: string;
}

/** No DB_* settings; settings, and the tables are up to date; settings, but no answer (wrong login, or down). */
export type DatabaseState = 'not configured' | 'connected' | 'unreachable';

/**
 * What /health adds with DB_DEBUG=1 while the database is unreachable, to find a wrong setting from the browser:
 * MySQL's own message (it names the user and the address it saw, and whether a password came), the settings but the
 * password, and the password's length and whether it has spaces at either end. Never the password itself.
 */
export interface DatabaseDebug {
  message: string;
  host: string;
  name: string;
  user: string;
  passwordLength: number;
  passwordHasOuterSpaces: boolean;
}

/** The debug details for an error, from the DB_* settings. */
export function databaseDebug(env: Env, error: unknown): DatabaseDebug {
  const password = env.DB_PASSWORD ?? '';
  return {
    message: error instanceof Error ? error.message : String(error),
    host: env.DB_HOST ?? '',
    name: env.DB_NAME ?? '',
    user: env.DB_USER ?? '',
    passwordLength: password.length,
    passwordHasOuterSpaces: password !== password.trim(),
  };
}

type Env = Readonly<Record<string, string | undefined>>;

export function health(
  env: Env,
  uptime: number,
  now: Date,
  database: DatabaseState,
  databaseError?: string,
  debug?: DatabaseDebug,
): Health {
  return {
    ok: true,
    service: 'mpmb-web-sync',
    // Passenger sets PASSENGER_APP_ENV (and IN_PASSENGER) for the apps it starts.
    runner: env.PASSENGER_APP_ENV || env.IN_PASSENGER ? 'passenger' : 'plain',
    uptime: Math.round(uptime),
    database,
    ...(databaseError ? { databaseError } : {}),
    ...(debug ? { databaseDebug: debug } : {}),
    time: now.toISOString(),
  };
}
