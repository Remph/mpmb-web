// Sync between a player's devices (M15, design A: one code per player, decisions.md 2026-11-15). The characters
// stay in this browser as before (IndexedDB, works offline); the sync sends each change to the service on
// sync.remph.de and brings the changes made on the player's other devices. plan.ts decides what a round does.
//
// When it talks to the service:
// - after a change, at most every PUSH_PACE_MS (a character is half a megabyte; every tap saves it);
// - a full round (the service's list, then pushes and downloads) when the page opens, every FULL_ROUND_MS, when
//   the page comes back into view or the network comes back, and before a character opens;
// - while a character is open for changes, its lease every LEASE_RENEW_MS, so another device sees "open on …".
//
// With auto sync off (the player's switch, per device; Nick 2026-11-15: trying things out on the PC without the saves
// reaching the Surface), none of that: the device saves as before and talks to the service only when the player taps
// "Sync now". It holds no leases either, since it sends nothing by itself; copies that went apart meanwhile are a
// clash at the next "Sync now", answered by the player as ever.
import type { Texts } from '../i18n.ts';
import { fill } from '../i18n.ts';
import type { CharacterStore } from '../store/characters.ts';
import { ACCOUNT_KEY, readAccount, writeAccount } from './account.ts';
import type { Account, KeyValues } from './account.ts';
import {
  CAP_REACHED,
  NEWER_VERSION,
  NOT_FOUND,
  OPEN_ELSEWHERE,
  SIGNED_OUT,
  SyncApi,
  SyncOffline,
  SyncRefused,
  TOO_MANY_TRIES,
} from './api.ts';
import type { Fetch, Lease, ServerCharacter, SyncDevice } from './api.ts';
import { localMeta, packData, serverMeta, unpackData } from './pack.ts';
import { changedHere, planSync, serverUpdated } from './plan.ts';
import type { SyncRecord, SyncStep } from './plan.ts';

/** Changes go out at most this often (the service's README asks for "every few seconds at most"). */
export const PUSH_PACE_MS = 5_000;
/** A full round this often while the page is open: the other devices' changes come in without a reload. */
export const FULL_ROUND_MS = 60_000;
/** The service lets a lease lapse 2 minutes after its last renewal (server/sync.ts LEASE_MS). */
export const LEASE_RENEW_MS = 45_000;

/**
 * What the start page and the top bar say. `synced`: nothing waiting; `waiting`: changes go out in a moment;
 * `syncing`: talking to the service; `offline`: it didn't answer, changes wait here; `manual`: auto sync is off,
 * nothing happens until the player taps "Sync now".
 */
export type SyncState = 'off' | 'synced' | 'waiting' | 'syncing' | 'offline' | 'manual';

/**
 * What "Sync now" does with a character changed here (auto sync off): `send` it, `keep` it on this device for now
 * (left out of the round: nothing goes out, nothing comes in), or `take` the synced copy (this one becomes a
 * restore point). Characters not named are sent.
 */
export type SyncChoice = 'send' | 'keep' | 'take';

/** A character changed here since the last sync, for "Sync now"; `known`: the service has a copy to take instead. */
export interface WaitingCharacter {
  id: string;
  name: string;
  updated: string;
  known: boolean;
}

/** A round the player asked for ("Sync now"); the only kind that runs with auto sync off. */
interface ByHand {
  choices: Readonly<Record<string, SyncChoice>>;
}

/** What the sync needs of the session around it. */
export interface SyncHost {
  store(): CharacterStore | null;
  /** The character on screen; `editing` when this device may change it (not read-only). */
  open(): { id: string; editing: boolean } | null;
  /** The sync changed characters in the store: the list reads them again. */
  changed(): Promise<void>;
  /** The open character (read-only here) has a newer copy in the store: show it. */
  replaced(id: string): Promise<void>;
  /** The open character was deleted on another device. */
  removed(id: string): void;
  /** Another device took over the open character; this one shows it read-only from now. */
  lost(id: string, lease: Lease): void;
  note(kind: 'info' | 'error', text: string): void;
  /** Two copies of a character went apart: which one every device uses ('later': ask again next time). */
  pick(clash: Clash): Promise<'here' | 'there' | 'later'>;
}

/** What the player sees of a clash: the two copies, when each changed, and where the other one comes from. */
export interface Clash {
  id: string;
  name: string;
  /** When this device's copy changed (ISO). */
  here: string;
  /** When the service's copy changed on its device (ms), and that device. */
  there: number;
  device: string | null;
}

/** How signing in went; `full`: the code already has the most devices there can be (that many). */
export type SyncConnect = 'ok' | 'wrong' | 'wait' | 'offline' | { full: number };

/** The cap the service named in a 403 (0 when it didn't say). */
const capOf = (err: SyncRefused): number => (typeof err.body.max === 'number' ? err.body.max : 0);

/** Whether an error is this status from the service. */
const refused = (err: unknown, status: number): err is SyncRefused =>
  err instanceof SyncRefused && err.status === status;

/** Runs `work` on each item in turn, never two at once (each step may depend on the store as the last left it). */
async function inTurn<T, R>(items: readonly T[], work: (item: T) => Promise<R>): Promise<R[]> {
  return items.reduce<Promise<R[]>>(async (before, item) => [...(await before), await work(item)], Promise.resolve([]));
}

/** How opening a character went at the service. */
export type Hold = { held: true } | { held: false; lease: Lease } | { held: false; offline: true };

export class Sync {
  account: Account | null = $state(null);
  state: SyncState = $state('off');
  /** The service's list as last read, by id: the start page's "open on …" marks. */
  server: Record<string, ServerCharacter> = $state({});
  /** This browser's sync records, by id: which characters have changes not sent yet. */
  records: Record<string, SyncRecord> = $state({});
  devices: SyncDevice[] = $state([]);
  /** When the service last answered (ms since 1970). */
  lastContact: number | null = $state(null);

  private readonly api: SyncApi;
  /** The round running (one at a time: two at once would send the same change twice). */
  private running: Promise<void> = Promise.resolve();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPush = 0;
  /** Characters a 409 showed newer at the service: the next full round deals with them. */
  private fullSoon = false;
  /** The character this device holds a lease on, and the timer that renews it. */
  private held: { id: string; timer: ReturnType<typeof setInterval> } | null = null;
  /** The character this device means to hold, set as soon as hold() starts (before the service answers). */
  private wanted: string | null = null;
  /** Clashes the player put off ("Not now"): left alone until the page loads again. */
  private readonly postponed = new Set<string>();
  /** Characters the service turned away at the cap: said once per page load, not at every round. */
  private readonly capped = new Set<string>();
  private roundTimer: ReturnType<typeof setInterval> | null = null;
  /** The round running is one the player asked for: a push refused because it's open elsewhere says so. */
  private byHand = false;

  constructor(
    private readonly host: SyncHost,
    private readonly texts: () => Texts,
    fetcher?: Fetch,
    private readonly storage?: KeyValues | null,
    base?: string,
  ) {
    this.account = readAccount(storage);
    // With an account the page starts with a round (start()), unless auto sync is off.
    this.state = !this.account ? 'off' : this.account.auto ? 'syncing' : 'manual';
    this.api = new SyncApi(() => this.account?.token ?? null, base, fetcher);
    // The switch turned in another tab of this browser: follow it, or a tab left open would go on sending the
    // try-outs (both tabs share the characters) after the player turned auto sync off.
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === null || event.key === ACCOUNT_KEY) this.followStoredAccount();
      });
    }
  }

  get on(): boolean {
    return this.account !== null;
  }

  /** Whether this device syncs by itself (true without an account: nothing to switch off). */
  get auto(): boolean {
    return this.account?.auto !== false;
  }

  /** When this device last finished a sync (ms), as remembered across visits; null before the first. */
  get lastSync(): number | null {
    return this.lastContact ?? this.account?.lastSync ?? null;
  }

  /** Whether a character has changes this browser hasn't sent yet (null without sync). */
  mark(meta: { id: string; updated: string }): 'synced' | 'waiting' | null {
    if (!this.account) return null;
    return changedHere(meta, this.records[meta.id]) ? 'waiting' : 'synced';
  }

  /** Another device that has the character open, from the service's last list. */
  heldElsewhere(id: string): Lease | null {
    // Auto sync off: the list is only as new as the last "Sync now", and leases last two minutes; an old "open on …"
    // would stay on the card (and block deleting) until the next one.
    if (!this.auto) return null;
    const lease = this.server[id]?.lease ?? null;
    return lease && lease.deviceId !== this.account?.device ? lease : null;
  }

  /**
   * Starts the regular rounds (the page is open), plus one when the page comes back into view (the iPad back from
   * another app) or the network comes back; stop() ends them.
   */
  start(): void {
    this.stop();
    if (!this.auto) {
      void this.loadRecords();
      return;
    }
    this.roundTimer = setInterval(() => void this.round(true), FULL_ROUND_MS);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.wake);
      document.addEventListener('visibilitychange', this.wake);
    }
    void this.loadRecords();
    void this.round(true);
  }

  stop(): void {
    if (this.roundTimer) clearInterval(this.roundTimer);
    this.roundTimer = null;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.wake);
      document.removeEventListener('visibilitychange', this.wake);
    }
  }

  private readonly wake = (): void => {
    if (document.visibilityState === 'visible') void this.round(true);
  };

  /** A character changed in the store: send it in a moment (paced). */
  changed(): void {
    if (!this.account) return;
    void this.loadRecords();
    if (!this.auto) return;
    if (this.state === 'synced') this.state = 'waiting';
    if (this.pushTimer) return;
    const wait = Math.max(0, this.lastPush + PUSH_PACE_MS - Date.now());
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.round(false);
    }, wait);
  }

  /**
   * Sends what waits now (the page goes out of sight, or the player leaves the character); `full` also reads the
   * service's list (back on the start page, whose marks say which characters are open elsewhere).
   */
  now(full = false): Promise<void> {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = null;
    return this.round(full);
  }

  /**
   * One round: `full` reads the service's list too (downloads, deletes from other devices); otherwise only
   * this browser's changes go out. Rounds run one after the other. With auto sync off only a round the player
   * asked for runs (`byHand`, from syncNow()); the others are dropped.
   */
  round(full: boolean, byHand?: ByHand): Promise<void> {
    const before = this.running;
    const run = async (): Promise<void> => {
      await before;
      // Checked when its turn comes: the switch may have been turned off while it waited.
      if (!this.account || !this.host.store() || (!this.account.auto && !byHand)) return;
      this.byHand = !!byHand;
      try {
        await this.roundNow(full || this.fullSoon || !!byHand, byHand?.choices ?? {});
      } finally {
        this.byHand = false;
      }
    };
    const guarded = async (): Promise<void> => {
      try {
        await run();
      } catch (err) {
        console.warn('Sync round failed:', err);
      }
    };
    this.running = guarded();
    return this.running;
  }

  private async roundNow(full: boolean, choices: Readonly<Record<string, SyncChoice>>): Promise<void> {
    const store = this.host.store();
    if (!store) return;
    this.state = 'syncing';
    this.lastPush = Date.now();
    try {
      const server = full ? await this.api.characters() : null;
      if (server) {
        this.fullSoon = false;
        this.server = Object.fromEntries(server.map((c) => [c.id, c]));
        this.devices = (await this.api.devices()).devices;
      }
      // "Take the synced copy": the service's copy comes in first (this one becomes a restore point), so the plan
      // below sees it unchanged.
      const takes = Object.keys(choices).filter((id) => choices[id] === 'take');
      // No synced copy left to take (deleted on another device, or removed): this one stays here as it is. Sent, it
      // would bring back the character (a change wins over a delete) with the very changes the player gave up.
      const gone = takes.filter((id) => this.server[id]?.deleted !== false);
      const available = takes.filter((id) => !gone.includes(id));
      const took = (await inTurn(available, (id) => this.download(store, id, true))).some(Boolean);
      const records = await store.syncRecords();
      const local = await store.list();
      const open = this.host.open();
      const leave = new Set([...Object.keys(choices).filter((id) => choices[id] === 'keep'), ...gone]);
      const steps = planSync(local, records, server, new Set(open?.editing ? [open.id] : []), leave);
      const changed = (await inTurn(steps, (step) => this.carryOut(store, step, records))).some(Boolean) || took;
      this.lastContact = Date.now();
      await this.loadRecords();
      if (changed) await this.host.changed();
      if (!this.account) return;
      if (!this.account.auto) {
        // Remembered across visits: the start page says when this device last synced.
        this.account = { ...this.account, lastSync: this.lastContact };
        writeAccount(this.account, this.storage);
        this.state = 'manual';
        return;
      }
      const waiting = (await store.list()).some((c) => changedHere(c, this.records[c.id]));
      this.state = waiting ? 'waiting' : 'synced';
    } catch (err) {
      if (!this.account) return;
      if (refused(err, SIGNED_OUT)) {
        this.signedOut();
        return;
      }
      this.state = err instanceof SyncOffline ? 'offline' : this.account.auto ? 'waiting' : 'manual';
      if (!(err instanceof SyncOffline)) console.warn('Sync failed:', err);
    }
  }

  /** One step of a round; true when it changed the characters in the store. */
  private carryOut(store: CharacterStore, step: SyncStep, records: Map<string, SyncRecord>): Promise<boolean> {
    const steps: { [K in SyncStep['kind']]: (step: Extract<SyncStep, { kind: K }>) => Promise<boolean> } = {
      push: (s) => this.push(store, s.id, s.version),
      download: (s) => this.download(store, s.id, false),
      clash: (s) => this.settle(store, s.id, s.server),
      remove: async (s) => {
        await store.delete(s.id);
        if (this.host.open()?.id === s.id) this.host.removed(s.id);
        return true;
      },
      delete: (s) => this.sendDelete(store, s.id, s.version),
      drop: async (s) => {
        await store.setSync(s.id, null);
        return false;
      },
      adopt: async (s) => {
        const updated = (s.server.meta as { updated: string }).updated;
        await store.setSync(s.id, { ...records.get(s.id), version: s.server.version, pushed: updated });
        return false;
      },
    };
    return (steps[step.kind] as (step: SyncStep) => Promise<boolean>)(step);
  }

  private async push(store: CharacterStore, id: string, version: number): Promise<boolean> {
    const character = await store.get(id);
    if (!character) return false;
    try {
      const sent = character.meta.updated;
      const answer = await this.api.save(id, version, serverMeta(character.meta), await packData(character.data));
      await store.setSync(id, { version: answer.version, pushed: sent });
      // The first push of a character open here: now there is something to hold.
      if (version === 0 && this.held?.id === id) await this.renewNow(id);
      const known = this.server[id];
      if (known) this.server[id] = { ...known, version: answer.version, deleted: false };
    } catch (err) {
      if (!(err instanceof SyncRefused)) throw err;
      // Saved meanwhile from another copy: the next full round keeps this one as a restore point.
      if (err.status === NEWER_VERSION) this.fullSoon = true;
      else if (err.status === OPEN_ELSEWHERE) {
        // The character open here was taken over on another device: say so now rather than at the next renewal
        // (up to 45 s of typing that would only end up as a restore point). Otherwise it goes out once that
        // device lets go.
        if (this.held?.id === id && err.lease) {
          this.letGo();
          this.host.lost(id, err.lease);
        } else if (this.byHand && err.lease) {
          // "Sync now" with auto sync off: the player should know why this one is still waiting.
          const name = character.meta.name || this.texts().unnamed;
          this.host.note('info', fill(this.texts().syncWaitsOpenOn, { name, device: err.lease.device }));
        }
      } else if (err.status === CAP_REACHED) {
        // The character stays here, unsent; each round tries again, so it goes out once there is room.
        if (!this.capped.has(id)) {
          this.capped.add(id);
          const name = character.meta.name || this.texts().unnamed;
          this.host.note('error', fill(this.texts().syncTooManyCharacters, { name, max: capOf(err) }));
        }
      } else console.warn('Sync refused a save:', err);
    }
    return false;
  }

  /** The service's copy into the store; `clash`: this browser's copy first becomes a restore point. */
  private async download(store: CharacterStore, id: string, clash: boolean): Promise<boolean> {
    const t = this.texts();
    const full = await this.api.character(id);
    const meta = localMeta(full.meta, id, (await store.get(id))?.meta);
    if (!meta) return false;
    const data = await unpackData(full.data);
    await store.putSynced({ meta, data }, { version: full.version, pushed: meta.updated }, clash ? 'sync' : undefined);
    if (clash) {
      const device = full.device ?? t.syncAnotherDevice;
      this.host.note('info', fill(t.syncKeptHere, { name: meta.name || t.unnamed, device }));
    }
    if (this.host.open()?.id === id) await this.host.replaced(id);
    return true;
  }

  /**
   * A clash: the player picks a copy. The service's: this one becomes a restore point and the service's comes in.
   * This one: the service's becomes a restore point here, and this one goes out over it (the other devices take
   * it with their next round). Not now: asked again on the next page load, nothing sent meanwhile.
   */
  private async settle(store: CharacterStore, id: string, server: ServerCharacter): Promise<boolean> {
    const mine = await store.get(id);
    if (!mine || this.postponed.has(id)) return false;
    const answer = await this.host.pick({
      id,
      name: mine.meta.name,
      here: mine.meta.updated,
      // When the copy itself changed on its device (as `here`), not when it reached the service.
      there: Date.parse(serverUpdated(server) ?? '') || server.updated,
      device: server.device,
    });
    if (answer === 'later') {
      this.postponed.add(id);
      return false;
    }
    if (answer === 'there') return this.download(store, id, true);
    const t = this.texts();
    const full = await this.api.character(id);
    const meta = localMeta(full.meta, id, mine.meta);
    if (!meta) return false;
    await store.addPoint({ meta, data: await unpackData(full.data) }, 'sync');
    // The answer stands: this copy now counts as a change over the service's version (`pushed` matches no copy),
    // so a refused push (open on the other device, 423) goes out with a later round instead of asking again and
    // keeping another restore point each time. Saved there meanwhile (409): a real new clash, asked then.
    await store.setSync(id, { version: full.version, pushed: '' });
    await this.push(store, id, full.version);
    const device = full.device ?? t.syncAnotherDevice;
    this.host.note('info', fill(t.syncKeptTheirs, { name: mine.meta.name || t.unnamed, device }));
    return false;
  }

  private async sendDelete(store: CharacterStore, id: string, version: number): Promise<boolean> {
    try {
      await this.api.remove(id, version);
      await store.setSync(id, null);
    } catch (err) {
      if (!(err instanceof SyncRefused)) throw err;
      // Changed elsewhere meanwhile, or gone: the record goes; a newer copy comes with the next full round. Open
      // on another device: try again later.
      if (err.status !== OPEN_ELSEWHERE) {
        await store.setSync(id, null);
        // Only ever set here: a 409 from a push earlier in the round must not be forgotten.
        if (err.status === NEWER_VERSION) this.fullSoon = true;
      }
    }
    return false;
  }

  private async loadRecords(): Promise<void> {
    const store = this.host.store();
    if (!store) return;
    this.records = Object.fromEntries(await store.syncRecords());
  }

  /** The service says this device's token is no good (forgotten on another device, or a new code). */
  private signedOut(): void {
    this.dropAccount();
    this.host.note('error', this.texts().syncSignedOut);
  }

  private dropAccount(): void {
    this.letGo();
    this.account = null;
    this.state = 'off';
    this.server = {};
    this.devices = [];
    writeAccount(null, this.storage);
  }

  // ---- Leases: "open on another device" ----

  /**
   * Holds the character for this device while it is open (`takeOver`: from the device that has it). Offline, it
   * opens for changes anyway: they go out once the service answers again.
   */
  async hold(id: string, takeOver = false): Promise<Hold> {
    this.letGo();
    this.wanted = id;
    // Auto sync off: this device sends nothing by itself, so it doesn't keep the others from opening it.
    if (!this.account?.auto) return { held: true };
    try {
      await this.api.hold(id, takeOver);
    } catch (err) {
      if (refused(err, OPEN_ELSEWHERE) && err.lease) return { held: false, lease: err.lease };
      if (refused(err, SIGNED_OUT)) this.signedOut();
      // Not at the service yet (new here): the lease starts once its first push has put it there.
      else if (refused(err, NOT_FOUND)) this.renew(id);
      else if (!(err instanceof SyncRefused)) {
        this.state = 'offline';
        this.renew(id);
        return { held: false, offline: true };
      }
      return { held: true };
    }
    this.renew(id);
    return { held: true };
  }

  private renew(id: string): void {
    const timer = setInterval(() => void this.renewNow(id), LEASE_RENEW_MS);
    this.held = { id, timer };
  }

  private async renewNow(id: string): Promise<void> {
    if (this.held?.id !== id) return;
    try {
      await this.api.hold(id);
      if (this.state === 'offline') void this.round(true);
    } catch (err) {
      if (this.held?.id !== id) return;
      if (refused(err, OPEN_ELSEWHERE) && err.lease) {
        // Taken over on another device: stop renewing, and the open character turns read-only here.
        this.letGo();
        this.host.lost(id, err.lease);
      } else if (refused(err, SIGNED_OUT)) this.signedOut();
      else if (err instanceof SyncOffline) this.state = 'offline';
    }
  }

  /** Stops renewing the lease, without telling the service (it lapses by itself). */
  private letGo(): void {
    if (this.held) clearInterval(this.held.timer);
    this.held = null;
  }

  /**
   * The character is closed here: the lease goes, so another device can open it without asking. Renewing stops at
   * once, but the service hears of it only after the round already queued (close() sends the last changes first):
   * let go earlier and the next device could open the older copy and hold it, refusing the last changes from here.
   */
  release(id: string): void {
    if (this.held?.id !== id) return;
    this.letGo();
    this.wanted = null;
    if (!this.account) return;
    void this.running.then(() => {
      // Opened again here meanwhile: the lease is this device's again.
      if (this.wanted === id || !this.account) return;
      return this.quietly(() => this.api.release(id));
    });
  }

  /** A call whose failure doesn't matter (the lease lapses by itself). */
  private async quietly(call: () => Promise<void>): Promise<void> {
    try {
      await call();
    } catch {
      // Nothing to do.
    }
  }

  // ---- Auto sync on or off ----

  /**
   * Turns auto sync on or off for this device. On: the regular rounds start, with one at once. Off: they stop, and
   * the lease of a character held here goes (it lapses at the service by itself).
   */
  setAuto(on: boolean): void {
    if (!this.account || this.account.auto === on) return;
    this.account = { ...this.account, auto: on, lastSync: this.lastSync };
    writeAccount(this.account, this.storage);
    this.switched(on);
  }

  /** The account as stored changed (another tab): takes over its switch. Public for the tests. */
  followStoredAccount(): void {
    const stored = readAccount(this.storage);
    if (!this.account || !stored || stored.token !== this.account.token || stored.auto === this.account.auto) return;
    this.account = { ...this.account, auto: stored.auto, lastSync: stored.lastSync ?? this.lastSync };
    this.switched(stored.auto);
  }

  private switched(on: boolean): void {
    if (on) {
      this.state = 'syncing';
      this.start();
    } else {
      this.stop();
      this.letGo();
      this.state = 'manual';
    }
  }

  /**
   * "Sync now": one full round, auto sync on or off. `choices`: what happens to each character changed here (see
   * SyncChoice); the rest are sent.
   */
  syncNow(choices: Readonly<Record<string, SyncChoice>> = {}): Promise<void> {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = null;
    return this.round(true, { choices });
  }

  /** The characters changed here since the last sync, oldest change first: what "Sync now" asks about. */
  async waiting(): Promise<WaitingCharacter[]> {
    const store = this.host.store();
    if (!this.account || !store) return [];
    const records = await store.syncRecords();
    return (
      (await store.list())
        .filter((c) => changedHere(c, records.get(c.id)))
        .sort((a, b) => a.updated.localeCompare(b.updated))
        // Known: synced before, and not deleted at the service as far as the last list said.
        .map((c) => ({
          id: c.id,
          name: c.name,
          updated: c.updated,
          known: records.has(c.id) && this.server[c.id]?.deleted !== true,
        }))
    );
  }

  // ---- The code, the devices ----

  /** Signs this device in with the player's code and syncs; the reason when it didn't work. */
  async connect(code: string, name: string): Promise<SyncConnect> {
    try {
      const answer = await this.api.login(code, name);
      this.account = {
        token: answer.token,
        player: answer.player,
        device: answer.device,
        name,
        auto: true,
        lastSync: null,
      };
      writeAccount(this.account, this.storage);
    } catch (err) {
      if (err instanceof SyncRefused) {
        if (err.status === CAP_REACHED) return { full: capOf(err) };
        return err.status === TOO_MANY_TRIES ? 'wait' : 'wrong';
      }
      return 'offline';
    }
    this.state = 'waiting';
    await this.round(true);
    return 'ok';
  }

  /** The player's devices, newest first (the Devices window). */
  async listDevices(): Promise<SyncDevice[] | null> {
    try {
      this.devices = (await this.api.devices()).devices;
      return this.devices;
    } catch (err) {
      if (refused(err, SIGNED_OUT)) this.signedOut();
      return null;
    }
  }

  /** Signs another of the player's devices out (a lost phone); false when the service couldn't be reached. */
  async forgetDevice(id: number): Promise<boolean> {
    try {
      await this.api.forgetDevice(id);
    } catch (err) {
      if (!refused(err, NOT_FOUND)) return false;
    }
    this.devices = this.devices.filter((d) => d.id !== id);
    return true;
  }

  /**
   * "Forget this device": sends what waits, signs the device out and takes the synced characters out of this
   * browser (a shared laptop; they stay on the player's other devices). `waiting`: changes here couldn't be sent,
   * so nothing happened; `offline`: the service didn't answer.
   */
  async forgetThisDevice(): Promise<'ok' | 'waiting' | 'offline' | 'kept'> {
    const store = this.host.store();
    const account = this.account;
    if (!store || !account) return 'ok';
    // The player asked for it: runs with auto sync off too. Off, the changes made here stay out of it: whether a
    // try-out goes to the other devices is answered in "Sync now", never by forgetting the device.
    const kept = account.auto ? [] : await this.waiting();
    await this.round(true, { choices: Object.fromEntries(kept.map((c) => [c.id, 'keep' as const])) });
    const records = await store.syncRecords();
    const local = await store.list();
    if (local.some((c) => changedHere(c, records.get(c.id))) || [...records.values()].some((r) => r.deleted)) {
      return this.state === 'offline' ? 'offline' : kept.length ? 'kept' : 'waiting';
    }
    try {
      await this.api.forgetDevice(account.device);
    } catch (err) {
      // 401: signed out already.
      if (!(err instanceof SyncRefused)) return 'offline';
    }
    await inTurn([...records.keys()], (id) => store.delete(id));
    this.dropAccount();
    this.records = {};
    await this.host.changed();
    return 'ok';
  }
}
