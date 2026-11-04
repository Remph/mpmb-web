// A stand-in for the browser's LockManager (Web Locks API) for tests in Node, which has none.
import type { Locks } from '../src/store/tab-lock.ts';

/**
 * The parts of the Web Locks API the app uses: `ifAvailable` (no lock when another holds it) and `steal`
 * (the holder's request is rejected with an AbortError, as browsers do).
 */
export class StandInLocks implements Locks {
  private readonly holders = new Map<string, { abort: (reason: Error) => void }>();

  async request(
    name: string,
    options: LockOptions,
    callback: (lock: Lock | null) => Promise<void> | void,
  ): Promise<void> {
    const holder = this.holders.get(name);
    if (holder && !options.steal) {
      await callback(null);
      return;
    }
    holder?.abort(new DOMException('The lock was stolen', 'AbortError'));
    let abort = (_reason: Error): void => undefined;
    const aborted = new Promise<never>((_, reject) => (abort = reject));
    const entry = { abort };
    this.holders.set(name, entry);
    try {
      await Promise.race([callback({ name, mode: 'exclusive' }), aborted]);
    } finally {
      if (this.holders.get(name) === entry) this.holders.delete(name);
    }
  }

  query(): Promise<LockManagerSnapshot> {
    return Promise.resolve({
      held: [...this.holders.keys()].map((name) => ({ name, mode: 'exclusive' })),
      pending: [],
    });
  }
}
