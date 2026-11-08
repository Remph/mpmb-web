// The app's look: which theme, light or dark, and whether characters show their sheet colour. Kept in this
// browser only (like the language), read before the first paint by public/look.js and then by the app.

/** The themes, in the Look window's order: the app's own, remph.de's campfire, true black for OLED screens. */
export const THEMES = ['purple', 'campfire', 'oled'] as const;
export type Theme = (typeof THEMES)[number];

/** Light or dark: as the device is set, or always one of them. */
export const MODES = ['device', 'light', 'dark'] as const;
export type Mode = (typeof MODES)[number];

export interface Look {
  theme: Theme;
  mode: Mode;
  /** An open character's sheet colour replaces the theme's accent (see SHEET_COLORS). */
  sheetColors: boolean;
}

export const DEFAULT_LOOK: Look = { theme: 'purple', mode: 'device', sheetColors: true };

/** Where the look is kept; public/look.js reads the same key. */
export const LOOK_KEY = 'mpmb-web.look';

/** A theme that has one mode only. OLED is black or nothing: a light OLED theme would be Purple. */
const ALWAYS_DARK: readonly Theme[] = ['oled'];

export const hasOneMode = (theme: Theme): boolean => ALWAYS_DARK.includes(theme);

const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme);
const isMode = (value: unknown): value is Mode => MODES.includes(value as Mode);

/**
 * The stored look, or the default for whatever is missing or unknown: storage may hold a look from a newer
 * version of the app (a theme this one doesn't know), or nothing at all.
 */
export function parseLook(raw: string | null): Look {
  let stored: Partial<Record<keyof Look, unknown>> = {};
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}');
    if (parsed && typeof parsed === 'object') stored = parsed;
  } catch {
    // Not JSON: the default look.
  }
  return {
    theme: isTheme(stored.theme) ? stored.theme : DEFAULT_LOOK.theme,
    mode: isMode(stored.mode) ? stored.mode : DEFAULT_LOOK.mode,
    sheetColors: typeof stored.sheetColors === 'boolean' ? stored.sheetColors : DEFAULT_LOOK.sheetColors,
  };
}

/** Light or dark as the page shows it, given whether the device asks for dark. */
export function shownMode(look: Look, deviceDark: boolean): 'light' | 'dark' {
  if (hasOneMode(look.theme)) return 'dark';
  if (look.mode === 'device') return deviceDark ? 'dark' : 'light';
  return look.mode;
}

/** The attributes <html> carries for app.css (data-theme, data-mode). */
export function lookAttributes(look: Look, deviceDark: boolean): { theme: Theme; mode: 'light' | 'dark' } {
  return { theme: look.theme, mode: shownMode(look, deviceDark) };
}

/**
 * MPMB's sheet colours (its ColorList, "Set Color Theme" on the Colorful sheet) that app.css has a readable
 * accent for. Purple is the sheet's default and keeps the theme's own accent, so it isn't one of them.
 */
export const SHEET_COLORS = [
  'aqua',
  'blue',
  'brown',
  'gray',
  'green',
  'orange',
  'pink',
  'red',
  'teal',
  'yellow',
] as const;
export type SheetColor = (typeof SHEET_COLORS)[number];

/** The accent for a sheet's "Color.Theme" field, or null for purple, an empty field or anything unknown. */
export function sheetColor(value: unknown): SheetColor | null {
  const name = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SHEET_COLORS.includes(name as SheetColor) ? (name as SheetColor) : null;
}
