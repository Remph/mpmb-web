export const languages = ['de', 'en'] as const;
export type Lang = (typeof languages)[number];

const fallback: Lang = 'en';

function isLang(value: string | null | undefined): value is Lang {
  return languages.includes(value as Lang);
}

/**
 * The language to show: an explicit earlier choice wins, then the first browser
 * language we support ("de-AT" counts as German), then English.
 */
export function pickLanguage(browserLanguages: readonly string[], stored?: string | null): Lang {
  if (isLang(stored)) return stored;
  for (const tag of browserLanguages) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return fallback;
}

/**
 * Every visible text, in both languages. The `satisfies` check makes a missing translation a type error.
 * `\u2011` is a non-breaking hyphen, so licence names like GPL-3.0 never wrap in the middle.
 */
export const ui = {
  de: {
    title: 'MPMB Web',
    lead: 'Eine Web-Version von MPMBs Charakterbogen für D&D 5.5e (2024).',
    status: 'In Entwicklung. Noch gibt es hier nichts zu benutzen.',
    switchLanguage: 'English',
    switchLanguageLabel: 'Switch to English',
    creditsTitle: 'Herkunft',
    creditsMpmb:
      'Beruht auf dem Character Record Sheet von MorePurpleMoreBetter (Joost Wijnen), GPL\u20113.0. Nicht von MPMB erstellt oder unterstützt.',
    creditsSrd:
      'Regelinhalte aus dem System Reference Document 5.2.1 von Wizards of the Coast LLC, lizenziert unter CC\u2011BY\u20114.0.',
    source: 'Quellcode (GPL\u20113.0)',
  },
  en: {
    title: 'MPMB Web',
    lead: "A web version of MPMB's character sheet for D&D 5.5e (2024).",
    status: 'In development. Nothing to use here yet.',
    switchLanguage: 'Deutsch',
    switchLanguageLabel: 'Auf Deutsch wechseln',
    creditsTitle: 'Credits',
    creditsMpmb:
      "Based on MorePurpleMoreBetter's Character Record Sheet (Joost Wijnen), GPL\u20113.0. Not made or endorsed by MPMB.",
    creditsSrd:
      'Rules content from the System Reference Document 5.2.1 by Wizards of the Coast LLC, licensed under CC\u2011BY\u20114.0.',
    source: 'Source code (GPL\u20113.0)',
  },
} satisfies Record<Lang, Record<string, string>>;

export type UiKey = keyof (typeof ui)['en'];
