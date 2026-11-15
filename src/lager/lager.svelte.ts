// The group's Lager as the open page keeps it (M16): read from the sync service, asked again every few seconds
// while someone looks at it, and changed by small ops. A change shows at once (applyOps) and is replaced by the
// service's answer; one that doesn't get through is dropped again at the next read, and the panel says so.
//
// The Lager needs the player's sync code (the token), but not auto sync: it is the group's, not a try-out on one
// device, so it talks to the service even while this device's auto sync is off.
import { SyncOffline, type SyncApi } from '../sync/api.ts';
import { applyOps, isLager, type Lager, type Op } from './lager.ts';

/** How often an open Lager asks for changes: a change shows on the other devices within about this long. */
export const LAGER_POLL_MS = 5_000;

/** off: no sync code on this device. offline: no answer (shows the last copy, read only). */
export type LagerStatus = 'off' | 'loading' | 'ready' | 'offline' | 'error';

export class LagerStore {
  lager: Lager | null = $state(null);
  status: LagerStatus = $state('loading');
  /** Changes on their way to the service. */
  sending = $state(0);
  /** The last change didn't reach the service (it was dropped again): the panel says so until the next one does. */
  failed = $state(false);

  /** The places that want fresh numbers (the open panel, the Inventory tab's line). */
  private watchers = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Changes go out one after the other, in the order the player made them. */
  private queue: Promise<void> = Promise.resolve();
  /** The Lager as the service last sent it, without changes still on their way. */
  private confirmed: Lager | null = null;

  constructor(
    private readonly api: SyncApi,
    /** The player's name, or null without a sync code. */
    private readonly player: () => string | null,
    private readonly clock: () => number = Date.now,
  ) {}

  get on(): boolean {
    return this.player() !== null;
  }

  /** Reads the Lager, or only learns that it hasn't changed. */
  async refresh(): Promise<void> {
    if (!this.on) {
      this.status = 'off';
      return;
    }
    // A change on its way answers with the newest Lager anyway; a read now could show the state before it.
    if (this.sending) return;
    try {
      const answer = await this.api.lager(this.lager?.version ?? null);
      if (this.sending) return;
      if (isLager(answer)) {
        this.confirmed = answer;
        this.lager = answer;
      }
      if (this.lager) this.status = 'ready';
    } catch (error) {
      this.status = error instanceof SyncOffline ? 'offline' : 'error';
    }
  }

  /** Keeps the Lager fresh while the caller looks at it; returns the function that stops that. */
  watch(): () => void {
    this.watchers += 1;
    if (this.watchers === 1) {
      void this.refresh();
      this.timer = setInterval(() => {
        // A tab in the background doesn't need fresh numbers; it reads again when it is shown.
        if (typeof document === 'undefined' || document.visibilityState === 'visible') void this.refresh();
      }, LAGER_POLL_MS);
    }
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      this.watchers -= 1;
      if (this.watchers === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  /** Sends changes; they show at once. Resolves false when they didn't reach the service (and were dropped). */
  change(ops: readonly Op[]): Promise<boolean> {
    const player = this.player();
    if (!this.lager || player === null || !ops.length) return Promise.resolve(false);
    this.lager = applyOps(this.lager, ops, player, this.clock());
    this.sending += 1;
    const before = this.queue;
    const sent = this.send(before, ops);
    this.queue = this.settle(sent);
    return sent;
  }

  /** Sends once the changes before have gone out. */
  private async send(before: Promise<void>, ops: readonly Op[]): Promise<boolean> {
    await before;
    try {
      const answer = await this.post(ops);
      // Only the last change's answer: an earlier one would undo on screen what the player did since.
      if (isLager(answer)) this.confirmed = answer;
      if (isLager(answer) && this.sending === 1) this.lager = answer;
      this.status = 'ready';
      this.failed = false;
      return true;
    } catch (error) {
      this.status = error instanceof SyncOffline ? 'offline' : 'error';
      this.failed = true;
      return false;
    } finally {
      this.sending -= 1;
    }
  }

  /**
   * One request, sent a second time when no answer came: the answer may be what got lost, and the request's id makes
   * the service apply it once either way, so a "+1" never counts twice.
   */
  private async post(ops: readonly Op[]): Promise<unknown> {
    const request = crypto.randomUUID();
    try {
      return await this.api.changeLager(ops, request);
    } catch (error) {
      if (!(error instanceof SyncOffline)) throw error;
      return await this.api.changeLager(ops, request);
    }
  }

  /** After a change that didn't get through: back to the service's last copy, then ask for a newer one. */
  private async settle(sent: Promise<boolean>): Promise<void> {
    if ((await sent) || this.sending) return;
    this.lager = this.confirmed;
    await this.refresh();
  }
}
