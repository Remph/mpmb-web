import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STAT_KINDS, shownTiles, statColor, statSoft } from './stat-colors.ts';

// The stat tiles put coloured text on a coloured wash; both themes must stay readable (WCAG AA, 4.5:1 for
// the small name above the number).
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const light = css.slice(0, css.indexOf('@media (prefers-color-scheme: dark)'));
const dark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));

function token(block: string, name: string): string {
  const value = new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, 'i').exec(block)?.[1];
  if (!value) throw new Error(`no --${name} in app.css`);
  return value;
}

/** Relative luminance and contrast ratio as WCAG 2 defines them. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('stat tile colours', () => {
  for (const [theme, block] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    for (const kind of STAT_KINDS) {
      it(`${kind} is readable on its wash (${theme})`, () => {
        expect(contrast(token(block, `stat-${kind}`), token(block, `stat-${kind}-soft`))).toBeGreaterThanOrEqual(4.5);
      });
    }
    // Initiative's advantage and disadvantage arrows sit on its wash.
    it(`initiative's arrows are readable on its wash (${theme})`, () => {
      const wash = token(block, 'stat-init-soft');
      expect(contrast(token(block, 'ok'), wash)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token(block, 'hp'), wash)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('shownTiles', () => {
  it('leaves out numbers the sheet keeps empty, in order', () => {
    const tiles = shownTiles([
      { label: 'AC', value: '18', kind: 'ac' },
      { label: 'Spell save DC', value: '', kind: 'dc' },
      { label: 'Speed', value: '9 m', kind: 'speed' },
    ]);
    expect(tiles.map((t) => t.label)).toEqual(['AC', 'Speed']);
  });

  it('names the tokens app.css defines', () => {
    expect(statColor('init')).toBe('var(--stat-init)');
    expect(statSoft('init')).toBe('var(--stat-init-soft)');
  });
});
