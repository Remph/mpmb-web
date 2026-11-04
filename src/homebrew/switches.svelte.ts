// The homebrew switches: house rules the app can add on top of MPMB's sheet. They count for this browser
// (Nick, 2026-11-04), like the language, so they sit in localStorage and not with a character.

export type HomebrewKey = 'ultCharges' | 'noAmmo';
export type HomebrewSwitches = Record<HomebrewKey, boolean>;

/**
 * Every switch, in the order the Homebrew window lists them. All are off until a player turns them on, so a
 * switch that takes something away is named for the house rule ("no ammunition counting"), not for the part.
 */
export const HOMEBREW_KEYS: readonly HomebrewKey[] = ['ultCharges', 'noAmmo'];
const OFF: HomebrewSwitches = { ultCharges: false, noAmmo: false };
const STORAGE_KEY = 'mpmb-web.homebrew';

/** Reads the stored switches; unknown keys are dropped and missing ones are off. */
export function parseSwitches(text: string | null): HomebrewSwitches {
  let stored: unknown = null;
  try {
    stored = text ? JSON.parse(text) : null;
  } catch {
    stored = null;
  }
  const result = { ...OFF };
  if (typeof stored === 'object' && stored !== null) {
    for (const key of HOMEBREW_KEYS) result[key] = (stored as Record<string, unknown>)[key] === true;
  }
  return result;
}

class Homebrew {
  switches = $state<HomebrewSwitches>(parseSwitches(readStored()));

  set(key: HomebrewKey, on: boolean): void {
    this.switches = { ...this.switches, [key]: on };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.switches));
    } catch {
      // Storage blocked (private mode): the switch still works until the page is closed.
    }
  }
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** One for the whole page: the start page and the play view read the same switches. */
export const homebrew = new Homebrew();
