// The sync service's routes as the app calls them (server/README.md has the table). Every answer is JSON; a
// refusal comes as a SyncRefused with its status, a request that never got an answer (offline, the service down,
// too slow) as SyncOffline, so the app can tell "try again later" from "the service said no".

/**
 * Where the service runs: its own subdomain, since Plesk runs Node per (sub)domain. Its origin is in the CSP's
 * connect-src (public/.htaccess). A test build may point elsewhere (VITE_SYNC_URL).
 */
export const SYNC_URL: string = (import.meta.env.VITE_SYNC_URL as string | undefined) || 'https://sync.remph.de';

/** Long enough for a slow phone line with a big save, short enough that "offline" doesn't keep the player waiting. */
const TIMEOUT_MS = 20_000;

/** The service's answers the app tells apart. */
export const SIGNED_OUT = 401;
export const NOT_FOUND = 404;
export const NEWER_VERSION = 409;
export const OPEN_ELSEWHERE = 423;
export const TOO_MANY_TRIES = 429;
/** From here on an answer is the server's trouble (Plesk's page for a stopped app): try later. */
const SERVER_TROUBLE = 500;
const NO_CONTENT = 204;

/** Another device has the character open: who, and since when (ms since 1970). */
export interface Lease {
  device: string;
  deviceId: number;
  since: number;
  until: number;
}

/** A character as the service lists it (its `meta` is the app's list entry, unchecked). */
export interface ServerCharacter {
  id: string;
  version: number;
  deleted: boolean;
  meta: unknown;
  updated: number;
  /** The device that saved it last. */
  device: string | null;
  lease: Lease | null;
}

export interface SyncDevice {
  id: number;
  name: string;
  created: number;
  lastSeen: number;
  current: boolean;
}

/** The service answered with an error status (the constants above). */
export class SyncRefused extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(typeof body.error === 'string' ? body.error : `status ${status}`);
  }

  /** The lease of the device that holds the character (a 423). */
  get lease(): Lease | null {
    return isLease(this.body.lease) ? this.body.lease : null;
  }
}

/** No answer: no network, the service down or too slow. */
export class SyncOffline extends Error {}

function isLease(value: unknown): value is Lease {
  const lease = value as Lease | null;
  return Boolean(lease) && typeof lease?.device === 'string' && typeof lease.since === 'number';
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export class SyncApi {
  constructor(
    /** The device's token, or null before it has one. */
    private readonly token: () => string | null,
    private readonly base: string = SYNC_URL,
    private readonly fetcher: Fetch = (url, init) => fetch(url, init),
  ) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = this.token();
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let response: Response;
    try {
      response = await this.fetcher(new URL(path, this.base).href, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        // No cookies: the token is the only key, so another site can't make the browser send one.
        credentials: 'omit',
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new SyncOffline(err instanceof Error ? err.message : String(err));
    }
    if (response.status === NO_CONTENT) return undefined as T;
    let answer: unknown = null;
    try {
      answer = await response.json();
    } catch {
      // A proxy's HTML error page, or the answer broke off: no service behind it right now.
      if (response.ok || response.status >= SERVER_TROUBLE) throw new SyncOffline(`status ${response.status}`);
    }
    if (!response.ok) {
      // Plesk's own pages for a stopped app (502, 503) are "try later", not a refusal.
      if (response.status >= SERVER_TROUBLE) throw new SyncOffline(`status ${response.status}`);
      throw new SyncRefused(response.status, (answer ?? {}) as Record<string, unknown>);
    }
    return answer as T;
  }

  login(code: string, device: string): Promise<{ token: string; player: string; device: number }> {
    return this.call('POST', '/login', { code, device });
  }

  devices(): Promise<{ player: string; devices: SyncDevice[] }> {
    return this.call('GET', '/devices');
  }

  forgetDevice(id: number): Promise<void> {
    return this.call('DELETE', `/devices/${id}`);
  }

  async characters(): Promise<ServerCharacter[]> {
    return (await this.call<{ characters: ServerCharacter[] }>('GET', '/characters')).characters;
  }

  character(id: string): Promise<ServerCharacter & { data: string }> {
    return this.call('GET', `/characters/${encodeURIComponent(id)}`);
  }

  save(id: string, version: number, meta: object, data: string): Promise<{ version: number; updated: number }> {
    return this.call('PUT', `/characters/${encodeURIComponent(id)}`, { version, meta, data });
  }

  remove(id: string, version: number): Promise<{ version: number; updated: number }> {
    return this.call('DELETE', `/characters/${encodeURIComponent(id)}`, { version });
  }

  hold(id: string, takeOver = false): Promise<{ since: number; until: number }> {
    return this.call('POST', `/characters/${encodeURIComponent(id)}/lease`, { takeOver });
  }

  release(id: string): Promise<void> {
    return this.call('DELETE', `/characters/${encodeURIComponent(id)}/lease`);
  }

  /** The group's Lager (M16); only `{version}` when it is still at `since`. */
  lager(since: number | null): Promise<unknown> {
    return this.call('GET', since === null ? '/lager' : `/lager?since=${since}`);
  }

  /**
   * Changes to the Lager; the answer is the Lager after them. `request` names this request: sent again with the same
   * one after a lost answer, the service applies it only once.
   */
  changeLager(ops: readonly object[], request: string): Promise<unknown> {
    return this.call('POST', '/lager', { ops, request });
  }
}
