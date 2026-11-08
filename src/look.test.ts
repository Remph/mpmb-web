import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { blockTokens, color, contrast, SHOWN, themeTokens } from '../test/theme-css.ts';
import {
  DEFAULT_LOOK,
  LOOK_KEY,
  lookAttributes,
  MODES,
  parseLook,
  SHEET_COLORS,
  sheetColor,
  shownMode,
  THEMES,
} from './look.ts';

/** WCAG AA for normal text. */
const READABLE = 4.5;

describe('parseLook', () => {
  it('gives the default look for nothing, junk or a bare value', () => {
    expect(parseLook(null)).toEqual(DEFAULT_LOOK);
    expect(parseLook('not json')).toEqual(DEFAULT_LOOK);
    expect(parseLook('"oled"')).toEqual(DEFAULT_LOOK);
  });

  it('keeps what it knows and defaults the rest', () => {
    expect(parseLook(JSON.stringify({ theme: 'campfire' }))).toEqual({ ...DEFAULT_LOOK, theme: 'campfire' });
    // A theme from a newer version of the app, a mode spelled wrong.
    expect(parseLook(JSON.stringify({ theme: 'sunset', mode: 'Dark', sheetColors: false }))).toEqual({
      ...DEFAULT_LOOK,
      sheetColors: false,
    });
  });
});

describe('shownMode', () => {
  it('follows the device only when asked to', () => {
    expect(shownMode({ ...DEFAULT_LOOK, mode: 'device' }, true)).toBe('dark');
    expect(shownMode({ ...DEFAULT_LOOK, mode: 'device' }, false)).toBe('light');
    expect(shownMode({ ...DEFAULT_LOOK, mode: 'light' }, true)).toBe('light');
    expect(shownMode({ ...DEFAULT_LOOK, mode: 'dark' }, false)).toBe('dark');
  });

  it('keeps OLED black dark whatever the mode says', () => {
    expect(shownMode({ ...DEFAULT_LOOK, theme: 'oled', mode: 'light' }, false)).toBe('dark');
  });
});

describe('sheetColor', () => {
  it("reads MPMB's colour names, not purple and not anything else", () => {
    expect(sheetColor('blue')).toBe('blue');
    expect(sheetColor(' Teal ')).toBe('teal');
    expect(sheetColor('purple')).toBeNull();
    expect(sheetColor('')).toBeNull();
    expect(sheetColor('magenta')).toBeNull();
    expect(sheetColor(undefined)).toBeNull();
  });
});

/**
 * public/look.js sets the look before the app runs; it must come to the same answer as src/look.ts for every
 * stored look, including ones it should ignore.
 */
describe('public/look.js', () => {
  const script = readFileSync(new URL('../public/look.js', import.meta.url), 'utf8');

  function boot(stored: string | null, deviceDark: boolean): Record<string, string> {
    const attributes: Record<string, string> = {};
    runInNewContext(script, {
      localStorage: { getItem: (key: string) => (key === LOOK_KEY ? stored : null) },
      window: { matchMedia: () => ({ matches: deviceDark }) },
      document: { documentElement: { setAttribute: (name: string, value: string) => (attributes[name] = value) } },
    });
    return attributes;
  }

  const stored: (string | null)[] = [
    null,
    'not json',
    'null',
    JSON.stringify({ theme: 'sunset', mode: 'dusk' }),
    ...THEMES.flatMap((theme) => MODES.map((mode) => JSON.stringify({ theme, mode }))),
  ];
  stored.forEach((raw) =>
    [false, true].forEach((deviceDark) =>
      it(`agrees with src/look.ts for ${raw} (device ${deviceDark ? 'dark' : 'light'})`, () => {
        const { theme, mode } = lookAttributes(parseLook(raw), deviceDark);
        expect(boot(raw, deviceDark)).toEqual({ 'data-theme': theme, 'data-mode': mode });
      }),
    ),
  );

  it('shows the default look when storage is blocked', () => {
    const attributes: Record<string, string> = {};
    runInNewContext(script, {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
      },
      window: { matchMedia: () => ({ matches: false }) },
      document: { documentElement: { setAttribute: (name: string, value: string) => (attributes[name] = value) } },
    });
    expect(attributes).toEqual({ 'data-theme': 'purple', 'data-mode': 'light' });
  });
});

describe('theme colours in app.css', () => {
  // Purple's light block is the full list; a theme that misses one would show Purple's colour there.
  const purple = blockTokens(':root') ?? {};
  const all = Object.keys(purple).filter((name) => purple[name]!.startsWith('#'));
  const ownBlocks = [
    ":root[data-mode='dark']",
    ":root[data-theme='campfire']",
    ":root[data-theme='campfire'][data-mode='dark']",
    ":root[data-theme='oled']",
  ];
  ownBlocks.forEach((selector) =>
    it(`${selector} sets every colour`, () => {
      const own = blockTokens(selector) ?? {};
      expect(all.filter((name) => !(name in own))).toEqual([]);
    }),
  );

  SHOWN.forEach(({ theme, mode }) => {
    const tokens = themeTokens(theme, mode);
    const c = (name: string): string => color(tokens, name);
    it(`keeps text readable (${theme}, ${mode})`, () => {
      ['paper', 'surface'].forEach((background) => {
        expect(contrast(c('ink'), c(background))).toBeGreaterThanOrEqual(READABLE);
        expect(contrast(c('ink-muted'), c(background))).toBeGreaterThanOrEqual(READABLE);
        expect(contrast(c('accent'), c(background))).toBeGreaterThanOrEqual(READABLE);
        expect(contrast(c('danger'), c(background))).toBeGreaterThanOrEqual(READABLE);
      });
      expect(contrast(c('on-accent'), c('accent'))).toBeGreaterThanOrEqual(READABLE);
      expect(contrast(c('accent'), c('accent-soft'))).toBeGreaterThanOrEqual(READABLE);
      expect(contrast(c('hp'), c('hp-soft'))).toBeGreaterThanOrEqual(READABLE);
      expect(contrast(c('on-hp'), c('hp'))).toBeGreaterThanOrEqual(READABLE);
      expect(contrast(c('temp'), c('temp-soft'))).toBeGreaterThanOrEqual(READABLE);
      ['pp', 'gp', 'ep', 'sp', 'cp'].forEach((coin) =>
        expect(contrast(c(coin), c(`${coin}-soft`))).toBeGreaterThanOrEqual(READABLE),
      );
    });

    // A sheet colour takes the accent's place: as text on the cards and its wash, and under the button text.
    SHEET_COLORS.forEach((sheet) =>
      it(`keeps ${sheet} readable as the accent (${theme}, ${mode})`, () => {
        const accent = c(`sheet-${sheet}`);
        expect(contrast(accent, c('surface'))).toBeGreaterThanOrEqual(READABLE);
        expect(contrast(accent, c('paper'))).toBeGreaterThanOrEqual(READABLE);
        expect(contrast(accent, c(`sheet-${sheet}-soft`))).toBeGreaterThanOrEqual(READABLE);
        expect(contrast(c('on-accent'), accent)).toBeGreaterThanOrEqual(READABLE);
      }),
    );
  });
});
