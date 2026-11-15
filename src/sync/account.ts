// What this device remembers of its sync code: not the code (only the service checks it, once), but the token
// the service gave this device for it, the player's name and this device's name. In localStorage like the
// language and the look: small, read at once when the page opens, shared by the site's tabs.

export interface Account {
  token: string;
  /** The player's name as Remph typed it on the admin page. */
  player: string;
  /** This device's number at the service (its "Forget" in the devices list). */
  device: number;
  /** This device's name, shown to the player's other devices. */
  name: string;
  /**
   * Whether this device syncs by itself (the usual case). Off, it syncs only when the player taps "Sync now": for
   * trying things out on one device without the saves reaching the others (Nick, 2026-11-15).
   */
  auto: boolean;
  /** When this device last finished a sync round (ms since 1970): the start page says so while auto sync is off. */
  lastSync: number | null;
}

/** Where the account is kept in localStorage (another tab's change to it arrives as a `storage` event). */
export const ACCOUNT_KEY = 'mpmb-web.sync';
const KEY = ACCOUNT_KEY;

/** What a stand-in for localStorage needs (tests). */
export type KeyValues = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): KeyValues | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function readAccount(storage: KeyValues | null = browserStorage()): Account | null {
  try {
    const value = JSON.parse(storage?.getItem(KEY) ?? 'null') as Partial<Account> | null;
    if (!value || typeof value.token !== 'string' || typeof value.device !== 'number') return null;
    return {
      token: value.token,
      player: String(value.player ?? ''),
      device: value.device,
      name: String(value.name ?? ''),
      // Accounts from before the switch sync by themselves.
      auto: value.auto !== false,
      lastSync: typeof value.lastSync === 'number' ? value.lastSync : null,
    };
  } catch {
    return null;
  }
}

/** Remembers the account (null forgets it). Storage can be blocked: the sync then lasts for this visit. */
export function writeAccount(account: Account | null, storage: KeyValues | null = browserStorage()): void {
  try {
    if (account) storage?.setItem(KEY, JSON.stringify(account));
    else storage?.removeItem(KEY);
  } catch {
    // Not remembered; the next visit asks for the code again.
  }
}

/**
 * A first guess at this device's name for the code window ("iPad", "Firefox on Windows"); the player can change
 * it; `on` is the language's word between the two ("unter"). iPadOS says "Macintosh" like a Mac, but a Mac has no touch screen.
 */
export function guessDeviceName(userAgent: string, touchPoints: number, on = 'on'): string {
  const browser = /Firefox\//.test(userAgent)
    ? 'Firefox'
    : /Edg\//.test(userAgent)
      ? 'Edge'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : '';
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return 'iPad';
  if (/iPhone/.test(userAgent)) return 'iPhone';
  const system = /Android/.test(userAgent)
    ? 'Android'
    : /Windows/.test(userAgent)
      ? 'Windows'
      : /Macintosh|Mac OS X/.test(userAgent)
        ? 'Mac'
        : /CrOS/.test(userAgent)
          ? 'Chromebook'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : '';
  if (system && browser) return `${browser} ${on} ${system}`;
  return system || browser || 'Browser';
}
