// One tab at a time per character. Every save writes the whole character, so with the same character
// open in two tabs (or windows) each tab overwrote the other's changes without a word (tech review
// 2026-11-04, finding 2). The browser's Web Locks API holds a lock per character across all tabs of the
// site: the tab that opens a character first holds it, a second tab sees "open in another tab" and may take
// it over, and the first tab then stops saving. Firefox, Chrome and Safari 15.4+ have the API; without
// it (older Safari) every tab works as before.

/** The lock's name for a character (one name space for the whole site). */
export const lockName = (id: string): string => `mpmb-web:character:${id}`;

/** What the app needs of the browser's LockManager (`navigator.locks`); a stand-in in tests. */
export interface Locks {
  request(name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<void> | void): Promise<void>;
  query(): Promise<LockManagerSnapshot>;
}

/** The browser's LockManager, or undefined where there is none (or reading it throws). */
export function browserLocks(): Locks | undefined {
  try {
    return typeof navigator === 'object' ? navigator.locks : undefined;
  } catch {
    return undefined;
  }
}

/** A lock this tab holds: how to let it go, and when the browser has let go of it. */
interface Held {
  id: string;
  release: () => void;
  released: Promise<void>;
}

export class TabLock {
  /** The character whose lock this tab holds. */
  private held: Held | null = null;
  /** The lock let go of last, until the browser has released it. */
  private releasing: Promise<void> = Promise.resolve();

  constructor(
    private readonly locks: Locks | undefined,
    /** Another tab took over the character this tab had open. */
    private readonly lost: (id: string) => void,
  ) {}

  /**
   * Takes the character's lock (letting go of any other first); false when another tab holds it.
   * `steal`: take it from that tab, which is told through its `lost`.
   */
  async take(id: string, steal = false): Promise<boolean> {
    const locks = this.locks;
    if (!locks) return true;
    // Opening the same character again (Reopen) keeps the lock it has.
    if (this.held?.id === id) return true;
    this.free();
    // Browsers release a lock a moment after it is let go: back to the list and straight into the same
    // character again would otherwise find it "open in another tab".
    await this.releasing;
    return new Promise<boolean>((resolve) => {
      let release = (): void => undefined;
      // The lock is held for as long as this promise is pending.
      const holding = new Promise<void>((done) => (release = done));
      const options: LockOptions = steal ? { steal: true } : { ifAvailable: true };
      // Made before the request: the browser may call back at once. `released` is set right after.
      const mine: Held = { id, release, released: Promise.resolve() };
      let granted = false;
      const request = async (): Promise<void> => {
        try {
          await locks.request(lockName(id), options, (lock) => {
            if (!lock) {
              resolve(false);
              return undefined;
            }
            granted = true;
            this.held = mine;
            resolve(true);
            return holding;
          });
        } catch {
          if (!granted) {
            // A request that fails outright (a page the browser gives no locks) works as without the API:
            // held as far as this tab knows, or `holds` would stop every save without a word.
            this.held = mine;
            resolve(true);
            return;
          }
          // Another tab stole the lock: the browser rejects this request.
          if (this.held === mine) {
            this.held = null;
            this.lost(id);
          }
        }
      };
      mine.released = request();
    });
  }

  /** Lets go of the lock (leaving the character). */
  free(): void {
    if (!this.held) return;
    this.held.release();
    this.releasing = this.held.released;
    this.held = null;
  }

  /** Whether this tab may save the character: it holds its lock, or the browser has no locks. */
  holds(id: string): boolean {
    return !this.locks || this.held?.id === id;
  }

  /** Which of these characters another tab has open. */
  async openElsewhere(ids: string[]): Promise<string[]> {
    if (!this.locks) return [];
    try {
      const { held = [] } = await this.locks.query();
      const names = new Set(held.map((lock) => lock.name));
      return ids.filter((id) => names.has(lockName(id)) && this.held?.id !== id);
    } catch {
      return [];
    }
  }
}
