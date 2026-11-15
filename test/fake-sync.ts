// A stand-in for the sync service (server/sync.ts) in memory, for the app's tests: the same routes, answers and
// refusals (401, 404, 409, 423, 429), without MySQL. The unit tests call it through `fetcher`, the browser tests
// (e2e/sync.spec.ts) through Playwright's request routing. server/sync.test.ts tests the real service; when the two
// disagree, the real one is right and this one gets fixed.

const LEASE_MS = 120_000;
const MAX_TRIES = 10;
/** The service's answers (server/http.ts). */
const OK = 200;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const CONFLICT = 409;
const LOCKED = 423;
const TOO_MANY = 429;
/** 2026-11-15 18:00 UTC, a Sunday evening at the table. */
const START = Date.parse('2026-11-15T18:00:00Z');
/** A token's random part: base 36 digits after "0.". */
const BASE36 = 36;
const AFTER_POINT = 2;

/**
 * A request's token: "Bearer token-2-abc" gives "token-2-abc"; "Basic xyz" gives nothing.
 * Try it: https://regex101.com/?regex=%5EBearer%20(.%2B)%24&testString=Bearer%20token-2-abc
 */
const BEARER = /^Bearer (.+)$/;
/**
 * The code as the service compares it (server/codes.ts normalCode): words split by spaces or dashes, so
 * "orbit hazard-melt  ripple" matches "orbit-hazard-melt-ripple". Try it:
 * https://regex101.com/?regex=%5B%5Cs-%5D%2B&testString=orbit%20hazard-melt%20%20ripple
 */
const WORD_GAPS = /[\s-]+/;
/**
 * "Forget a device": "/devices/7" gives 7; "/devices/me" doesn't match.
 * Try it: https://regex101.com/?regex=%5E%5C%2Fdevices%5C%2F(%5Cd%2B)%24&testString=%2Fdevices%2F7
 */
const DEVICE_PATH = /^\/devices\/(\d+)$/;
/**
 * One character, or its lease: "/characters/1b4e-28ba" and "/characters/1b4e-28ba/lease" match, "/characters/a b"
 * doesn't. Try it: https://regex101.com/?regex=%5E%5C%2Fcharacters%5C%2F(%5BA-Za-z0-9-%5D%2B)(%5C%2Flease)%3F%24&testString=%2Fcharacters%2F1b4e-28ba%2Flease
 */
const CHARACTER_PATH = /^\/characters\/([A-Za-z0-9-]+)(\/lease)?$/;

interface FakeLease {
  device: number;
  since: number;
  until: number;
}

interface FakeCharacter {
  id: string;
  version: number;
  deleted: boolean;
  meta: unknown;
  data: string;
  updated: number;
  device: number;
  lease: FakeLease | null;
}

interface FakeDevice {
  id: number;
  player: number;
  name: string;
  token: string;
  created: number;
  lastSeen: number;
}

export interface FakeAnswer {
  status: number;
  body: unknown;
}

const answer = (status: number, body: unknown = null): FakeAnswer => ({ status, body });
const refuse = (status: number, error: string, extra: object = {}): FakeAnswer => answer(status, { error, ...extra });

export class FakeSync {
  /** The time the service sees (ms); tests move it on. */
  now = START;
  readonly players: { id: number; name: string; code: string }[] = [];
  readonly devices: FakeDevice[] = [];
  /** By player, then character id. */
  readonly characters = new Map<number, Map<string, FakeCharacter>>();
  /** Every request, for tests that count them ("PUT /characters/abc"). */
  readonly log: string[] = [];
  /** While true, every request fails as if the network were down. */
  offline = false;
  private failures = 0;
  private nextDevice = 1;

  addPlayer(name: string, code: string): void {
    this.players.push({ id: this.players.length + 1, name, code });
  }

  private deviceOf(headers: Record<string, string>): FakeDevice | null {
    const token = BEARER.exec(headers['authorization'] ?? '')?.[1];
    const device = this.devices.find((d) => d.token === token) ?? null;
    if (device) device.lastSeen = this.now;
    return device;
  }

  private leaseOf(character: FakeCharacter) {
    const lease = character.lease;
    if (!lease || lease.until <= this.now) return null;
    const device = this.devices.find((d) => d.id === lease.device);
    return { device: device?.name ?? '', deviceId: lease.device, since: lease.since, until: lease.until };
  }

  private summary(c: FakeCharacter) {
    const device = this.devices.find((d) => d.id === c.device);
    return {
      id: c.id,
      version: c.version,
      deleted: c.deleted,
      meta: c.meta,
      updated: c.updated,
      device: device?.name ?? null,
      lease: this.leaseOf(c),
    };
  }

  /** Why a write didn't take, as the real service says it (server/sync.ts refusalFor). */
  private refusal(c: FakeCharacter | undefined, device: FakeDevice): FakeAnswer {
    if (!c) return refuse(NOT_FOUND, 'not found');
    const lease = this.leaseOf(c);
    if (lease && lease.deviceId !== device.id) return refuse(LOCKED, 'open elsewhere', { lease });
    return refuse(CONFLICT, 'newer version', { version: c.version, updated: c.updated, deleted: c.deleted });
  }

  private free(c: FakeCharacter, device: FakeDevice): boolean {
    return !c.lease || c.lease.device === device.id || c.lease.until <= this.now;
  }

  handle(method: string, url: string, headers: Record<string, string>, body: unknown): FakeAnswer {
    const path = new URL(url).pathname;
    this.log.push(`${method} ${path}`);
    const input = (body ?? {}) as Record<string, unknown>;
    if (method === 'POST' && path === '/login') {
      if (this.failures >= MAX_TRIES) return refuse(TOO_MANY, 'too many tries');
      const code = String(input.code ?? '')
        .trim()
        .toLowerCase()
        .split(WORD_GAPS)
        .join('-');
      const player = this.players.find((p) => p.code === code);
      if (!player) {
        this.failures++;
        return refuse(UNAUTHORIZED, 'wrong code');
      }
      const device: FakeDevice = {
        id: this.nextDevice++,
        player: player.id,
        name: String(input.device ?? 'Device'),
        token: `token-${this.nextDevice}-${Math.random().toString(BASE36).slice(AFTER_POINT)}`,
        created: this.now,
        lastSeen: this.now,
      };
      this.devices.push(device);
      return answer(OK, { token: device.token, player: player.name, device: device.id });
    }
    const device = this.deviceOf(headers);
    if (!device) return refuse(UNAUTHORIZED, 'signed out');
    const mine = this.characters.get(device.player) ?? new Map<string, FakeCharacter>();
    this.characters.set(device.player, mine);

    if (method === 'GET' && path === '/devices') {
      const player = this.players.find((p) => p.id === device.player);
      const list = this.devices
        .filter((d) => d.player === device.player)
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .map((d) => ({
          id: d.id,
          name: d.name,
          created: d.created,
          lastSeen: d.lastSeen,
          current: d.id === device.id,
        }));
      return answer(OK, { player: player?.name ?? '', devices: list });
    }
    const forget = DEVICE_PATH.exec(path);
    if (method === 'DELETE' && forget) {
      const at = this.devices.findIndex((d) => d.id === Number(forget[1]) && d.player === device.player);
      if (at < 0) return refuse(NOT_FOUND, 'not found');
      this.devices.splice(at, 1);
      return answer(NO_CONTENT);
    }
    if (method === 'GET' && path === '/characters') {
      const list = [...mine.values()].sort((a, b) => b.updated - a.updated).map((c) => this.summary(c));
      return answer(OK, { characters: list });
    }
    const one = CHARACTER_PATH.exec(path);
    if (!one) return refuse(NOT_FOUND, 'no such route');
    const id = one[1] ?? '';
    const c = mine.get(id);
    if (one[2]) {
      if (method === 'DELETE') {
        if (c?.lease?.device === device.id) c.lease = null;
        return answer(NO_CONTENT);
      }
      if (!c || c.deleted || !(this.free(c, device) || input.takeOver === true)) return this.refusal(c, device);
      const renewing = c.lease?.device === device.id && c.lease.until > this.now;
      c.lease = {
        device: device.id,
        since: renewing && c.lease ? c.lease.since : this.now,
        until: this.now + LEASE_MS,
      };
      return answer(OK, { since: c.lease.since, until: c.lease.until });
    }
    if (method === 'GET') return c ? answer(OK, { ...this.summary(c), data: c.data }) : refuse(NOT_FOUND, 'not found');
    const version = input.version;
    if (typeof version !== 'number') return refuse(BAD_REQUEST, 'bad body');
    if (method === 'PUT') {
      if (version === 0) {
        if (c) return this.refusal(c, device);
        mine.set(id, {
          id,
          version: 1,
          deleted: false,
          meta: input.meta,
          data: String(input.data),
          updated: this.now,
          device: device.id,
          lease: null,
        });
        return answer(OK, { version: 1, updated: this.now });
      }
      if (!c || c.version !== version || !this.free(c, device)) return this.refusal(c, device);
      Object.assign(c, {
        version: version + 1,
        deleted: false,
        meta: input.meta,
        data: String(input.data),
        updated: this.now,
        device: device.id,
      });
      return answer(OK, { version: c.version, updated: this.now });
    }
    if (method === 'DELETE') {
      if (!c || c.version !== version || !this.free(c, device)) return this.refusal(c, device);
      Object.assign(c, {
        version: version + 1,
        deleted: true,
        data: '',
        updated: this.now,
        device: device.id,
        lease: null,
      });
      return answer(OK, { version: c.version, updated: this.now });
    }
    return refuse(NOT_FOUND, 'no such route');
  }

  /** The service as `fetch` (the unit tests' SyncApi uses it). */
  readonly fetcher = async (url: string, init: RequestInit): Promise<Response> => {
    if (this.offline) throw new TypeError('NetworkError when attempting to fetch resource.');
    const headers = Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
    const { status, body: out } = this.handle(init.method ?? 'GET', url, headers, body);
    return new Response(status === NO_CONTENT ? null : JSON.stringify(out), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
