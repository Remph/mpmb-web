import { describe, expect, it } from 'vitest';
import { languages, pickLanguage, ui } from './i18n';

describe('pickLanguage', () => {
  it('keeps an earlier explicit choice', () => {
    expect(pickLanguage(['en-US'], 'de')).toBe('de');
  });

  it('ignores a stored value it does not know', () => {
    expect(pickLanguage(['de-DE'], 'fr')).toBe('de');
  });

  it('uses the first supported browser language, regional tags included', () => {
    expect(pickLanguage(['fr-FR', 'de-AT', 'en'])).toBe('de');
    expect(pickLanguage(['EN-gb'])).toBe('en');
  });

  it('falls back to English', () => {
    expect(pickLanguage([])).toBe('en');
    expect(pickLanguage(['fr', 'nl'], null)).toBe('en');
  });
});

describe('ui texts', () => {
  it('has the same keys and no empty text in every language', () => {
    const keys = Object.keys(ui.en).sort();
    for (const lang of languages) {
      expect(Object.keys(ui[lang]).sort()).toEqual(keys);
      for (const text of Object.values(ui[lang])) expect(text.trim()).not.toBe('');
    }
  });
});
