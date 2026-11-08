// The look as the app's state: the Look window changes it, <html> follows it, and so does a device that
// switches between light and dark (evening mode) while the app is open.
import { LOOK_KEY, lookAttributes, parseLook, type Look } from './look.ts';

function readStored(): string | null {
  try {
    return localStorage.getItem(LOOK_KEY);
  } catch {
    return null;
  }
}

const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

class LookState {
  current: Look = $state(parseLook(readStored()));
  /** Whether the device asks for dark right now. */
  deviceDark = $state(darkQuery?.matches ?? false);

  constructor() {
    darkQuery?.addEventListener('change', (event) => {
      this.deviceDark = event.matches;
      this.show();
    });
  }

  /** Changes part of the look, shows it and keeps it for the next visit. */
  set(change: Partial<Look>): void {
    this.current = { ...this.current, ...change };
    try {
      localStorage.setItem(LOOK_KEY, JSON.stringify(this.current));
    } catch {
      // Not remembered, but the change still shows for this visit.
    }
    this.show();
  }

  /** Puts the look on <html>; public/look.js did it once before the first paint. */
  show(): void {
    const { theme, mode } = lookAttributes(this.current, this.deviceDark);
    const root = document.documentElement;
    root.dataset['theme'] = theme;
    root.dataset['mode'] = mode;
  }
}

export const look = new LookState();
