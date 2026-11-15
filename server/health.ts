// What the spike reports (M15, PR 1): enough to learn how the webspace runs Node, without any of the sync yet.
// Pure, so a test can call it with a made-up environment.

/** The answer of GET /health, as JSON. */
export interface Health {
  ok: true;
  service: 'mpmb-web-sync';
  /** "v22.12.0": the Node version Plesk picked, which sets what the service can use. */
  node: string;
  /** How the process was started: under Phusion Passenger (Plesk's way) or by hand. */
  runner: 'passenger' | 'plain';
  /** Seconds since the process started: shows whether Passenger keeps it running between requests. */
  uptime: number;
  /** Whether the database settings are there (their values never leave the server). */
  database: 'configured' | 'not configured';
  time: string;
}

/** The settings a later PR connects with; Plesk's Node.js page sets them as custom environment variables. */
const DATABASE_SETTINGS = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] as const;

type Env = Readonly<Record<string, string | undefined>>;

export function health(env: Env, version: string, uptime: number, now: Date): Health {
  const configured = DATABASE_SETTINGS.every((name) => Boolean(env[name]));
  return {
    ok: true,
    service: 'mpmb-web-sync',
    node: version,
    // Passenger sets PASSENGER_APP_ENV (and IN_PASSENGER) for the apps it starts.
    runner: env.PASSENGER_APP_ENV || env.IN_PASSENGER ? 'passenger' : 'plain',
    uptime: Math.round(uptime),
    database: configured ? 'configured' : 'not configured',
    time: now.toISOString(),
  };
}
