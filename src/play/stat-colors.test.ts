import { describe, expect, it } from 'vitest';
import { color, contrast, SHOWN, themeTokens } from '../../test/theme-css.ts';
import { STAT_KINDS, shownTiles, statColor, statSoft } from './stat-colors.ts';

// The stat tiles put coloured text on a coloured wash; every theme in each of its modes must stay readable
// (WCAG AA, 4.5:1 for the small name above the number).
describe('stat tile colours', () => {
  for (const { theme, mode } of SHOWN) {
    const tokens = themeTokens(theme, mode);
    for (const kind of STAT_KINDS) {
      it(`${kind} is readable on its wash (${theme}, ${mode})`, () => {
        expect(contrast(color(tokens, `stat-${kind}`), color(tokens, `stat-${kind}-soft`))).toBeGreaterThanOrEqual(4.5);
      });
    }
    // Initiative's advantage and disadvantage arrows sit on its wash.
    it(`initiative's arrows are readable on its wash (${theme}, ${mode})`, () => {
      const wash = color(tokens, 'stat-init-soft');
      expect(contrast(color(tokens, 'ok'), wash)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color(tokens, 'hp'), wash)).toBeGreaterThanOrEqual(4.5);
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
