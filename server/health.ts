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
  time: string;
}

/** No DB_* settings; settings, and the tables are up to date; settings, but no answer (wrong login, or down). */
export type DatabaseState = 'not configured' | 'connected' | 'unreachable';

type Env = Readonly<Record<string, string | undefined>>;

export function health(env: Env, uptime: number, now: Date, database: DatabaseState): Health {
  return {
    ok: true,
    service: 'mpmb-web-sync',
    // Passenger sets PASSENGER_APP_ENV (and IN_PASSENGER) for the apps it starts.
    runner: env.PASSENGER_APP_ENV || env.IN_PASSENGER ? 'passenger' : 'plain',
    uptime: Math.round(uptime),
    database,
    time: now.toISOString(),
  };
}
