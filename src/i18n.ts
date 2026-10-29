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
    status: 'In Entwicklung: Charaktere importieren und sichern geht schon, die Spielansicht kommt als Nächstes.',
    switchLanguage: 'English',
    switchLanguageLabel: 'Switch to English',
    creditsTitle: 'Herkunft',
    creditsMpmb:
      'Beruht auf dem Character Record Sheet von MorePurpleMoreBetter (Joost Wijnen), GPL\u20113.0. Nicht von MPMB erstellt oder unterstützt.',
    creditsSrd:
      'Regelinhalte aus dem System Reference Document 5.2.1 von Wizards of the Coast LLC, lizenziert unter CC\u2011BY\u20114.0.',
    source: 'Quellcode (GPL\u20113.0)',
    supportMpmb: 'MPMB auf Patreon unterstützen',

    charactersTitle: 'Charaktere',
    importPdf: 'PDF importieren',
    importHint:
      'Importiere einen ausgefüllten Bogen von MPMB als PDF: Colorful A4, Version {version}. Mitgebrachte Zusatzskripte (Homebrew) kommen mit.',
    storedHere:
      'Charaktere bleiben in diesem Browser auf diesem Gerät. Mit einer Sicherung nimmst du sie auf ein anderes Gerät mit.',
    noCharacters: 'Noch keine Charaktere.',
    unnamed: 'Ohne Namen',
    addOnCountOne: '1 Zusatzskript',
    addOnCount: '{count} Zusatzskripte',
    changedOn: 'Geändert am {date}',
    open: 'Öffnen',
    backUp: 'Sichern',
    delete: 'Löschen',
    backUpAll: 'Alle sichern',
    restore: 'Sicherung einspielen',
    reading: '{file} wird gelesen …',
    imported: '{name} importiert.',
    importedAddOnsOne: '{name} importiert, mit 1 Zusatzskript.',
    importedAddOns: '{name} importiert, mit {count} Zusatzskripten.',
    importFailed: '{file}: {reason}',
    unreadablePdf: 'Das ist keine lesbare PDF-Datei.',
    wrongSheet: 'Das ist kein Colorful-A4-Bogen in Version {version}{found}.',
    wrongSheetFound: ' (sondern {what})',
    engineFailed: 'Der Bogen ließ sich nicht öffnen: {reason}',
    sameCharacterTitle: 'Diesen Charakter gibt es schon',
    sameCharacter: '„{name}“ ({classes}) ist schon da. Durch den Import ersetzen oder als weiteren Charakter behalten?',
    replace: 'Ersetzen',
    keepBoth: 'Beide behalten',
    cancel: 'Abbrechen',
    deleteTitle: 'Charakter löschen?',
    deleteConfirm:
      '„{name}“ wird aus diesem Browser gelöscht. Das lässt sich nicht rückgängig machen; eine Sicherung bleibt erhalten.',
    restoreTitle: 'Sicherung einspielen?',
    restoreNew: '{name}: neu',
    restoreReplaces: '{name}: ersetzt den Charakter hier',
    restoreOlder: '{name}: ersetzt den Charakter hier, der hier ist neuer!',
    restoreFrom: 'Sicherung vom {date}:',
    restoreButton: 'Einspielen',
    restoredOne: '1 Charakter eingespielt.',
    restored: '{count} Charaktere eingespielt.',
    notABackup: 'Diese Datei ist keine Sicherung von MPMB Web.',
    newerBackup:
      'Diese Sicherung kommt aus einer neueren Version von MPMB Web. Lade die Seite neu und versuche es noch einmal.',
    wrongSheetBackup: 'Diese Sicherung gehört zu einem anderen Bogen ({what}); hier geht {version}.',
    storageFailed: 'Speichern im Browser hat nicht geklappt: {reason}',

    backToList: 'Charaktere',
    opening: 'Bogen wird geöffnet …',
    saving: 'Wird gespeichert …',
    saved: 'Gespeichert',
    working: 'MPMBs Skripte laufen …',
    level: 'Stufe',
    hitPoints: 'Max. TP',
    armorClass: 'RK',
    proficiency: 'Übungsbonus',
    speed: 'Bewegung',
    addOnsTitle: 'Zusatzskripte',
    noAddOns: 'Keine',
    pastedScript: 'Eingefügtes Skript',
    playViewSoon:
      'Die Spielansicht kommt im nächsten Schritt. Bis dahin gibt es hier MPMBs Menü (auf Englisch, wie im PDF).',
    mpmbMenu: 'MPMBs Menü',
    notIsolated:
      'Dieser Browser lässt die Seite nicht auf Antworten warten: Fragen von MPMBs Skripten werden nur angezeigt und mit „Abbrechen“ beantwortet.',
    notFound: 'Diesen Charakter gibt es in diesem Browser nicht (mehr).',

    ok: 'OK',
    yes: 'Ja',
    no: 'Nein',
    other: 'Weitere',
    close: 'Schließen',
    back: 'Zurück',
    menuTitle: 'Auswahl',
    dontShowAgain: 'Nicht mehr anzeigen',
  },
  en: {
    title: 'MPMB Web',
    lead: "A web version of MPMB's character sheet for D&D 5.5e (2024).",
    status: 'In development: importing and backing up characters works, the play view comes next.',
    switchLanguage: 'Deutsch',
    switchLanguageLabel: 'Auf Deutsch wechseln',
    creditsTitle: 'Credits',
    creditsMpmb:
      "Based on MorePurpleMoreBetter's Character Record Sheet (Joost Wijnen), GPL\u20113.0. Not made or endorsed by MPMB.",
    creditsSrd:
      'Rules content from the System Reference Document 5.2.1 by Wizards of the Coast LLC, licensed under CC\u2011BY\u20114.0.',
    source: 'Source code (GPL\u20113.0)',
    supportMpmb: 'Support MPMB on Patreon',

    charactersTitle: 'Characters',
    importPdf: 'Import PDF',
    importHint:
      'Import a filled MPMB sheet as a PDF: Colorful A4, version {version}. Add-on scripts (homebrew) in it come along.',
    storedHere: 'Characters stay in this browser on this device. A backup takes them to another device.',
    noCharacters: 'No characters yet.',
    unnamed: 'Unnamed',
    addOnCountOne: '1 add-on script',
    addOnCount: '{count} add-on scripts',
    changedOn: 'Changed {date}',
    open: 'Open',
    backUp: 'Back up',
    delete: 'Delete',
    backUpAll: 'Back up all',
    restore: 'Restore a backup',
    reading: 'Reading {file} …',
    imported: '{name} imported.',
    importedAddOnsOne: '{name} imported, with 1 add-on script.',
    importedAddOns: '{name} imported, with {count} add-on scripts.',
    importFailed: '{file}: {reason}',
    unreadablePdf: 'This is not a readable PDF file.',
    wrongSheet: 'This is not a Colorful A4 sheet, version {version}{found}.',
    wrongSheetFound: ' (it is {what})',
    engineFailed: 'The sheet could not be opened: {reason}',
    sameCharacterTitle: 'This character is already here',
    sameCharacter: '“{name}” ({classes}) is already here. Replace it with the import, or keep both?',
    replace: 'Replace',
    keepBoth: 'Keep both',
    cancel: 'Cancel',
    deleteTitle: 'Delete character?',
    deleteConfirm: '“{name}” will be deleted from this browser. This can’t be undone; backups are not affected.',
    restoreTitle: 'Restore backup?',
    restoreNew: '{name}: new',
    restoreReplaces: '{name}: replaces the character here',
    restoreOlder: '{name}: replaces the character here, which is newer!',
    restoreFrom: 'Backup of {date}:',
    restoreButton: 'Restore',
    restoredOne: '1 character restored.',
    restored: '{count} characters restored.',
    notABackup: 'This file is not an MPMB Web backup.',
    newerBackup: 'This backup comes from a newer version of MPMB Web. Reload the page and try again.',
    wrongSheetBackup: 'This backup belongs to another sheet ({what}); this app reads {version}.',
    storageFailed: 'Saving in the browser failed: {reason}',

    backToList: 'Characters',
    opening: 'Opening the sheet …',
    saving: 'Saving …',
    saved: 'Saved',
    working: 'MPMB’s scripts are running …',
    level: 'Level',
    hitPoints: 'HP max',
    armorClass: 'AC',
    proficiency: 'Proficiency',
    speed: 'Speed',
    addOnsTitle: 'Add-on scripts',
    noAddOns: 'None',
    pastedScript: 'Pasted script',
    playViewSoon: 'The play view comes in the next step. Until then, here is MPMB’s menu (in English, as in the PDF).',
    mpmbMenu: 'MPMB’s menu',
    notIsolated:
      'This browser doesn’t let the page wait for answers: questions from MPMB’s scripts are only shown and answered with “Cancel”.',
    notFound: 'This character is not (or no longer) in this browser.',

    ok: 'OK',
    yes: 'Yes',
    no: 'No',
    other: 'Other',
    close: 'Close',
    back: 'Back',
    menuTitle: 'Choose',
    dontShowAgain: 'Don’t show again',
  },
} satisfies Record<Lang, Record<string, string>>;

export type UiKey = keyof (typeof ui)['en'];
export type Texts = (typeof ui)[Lang];

/**
 * A {name} placeholder: matches "{count}" in "{count} left", not "{ count }" or "{}".
 * Try it: https://regex101.com/?regex=%5C%7B(%5Cw%2B)%5C%7D&testString=%7Bcount%7D%20left
 */
const PLACEHOLDER = /\{(\w+)\}/g;

/** Puts values into a text's {placeholders}: fill('{count} left', { count: 3 }) is "3 left". */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(PLACEHOLDER, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

/** A text with a count: the `one` text for 1, else `many` with {count} filled in. */
export function counted(
  one: string,
  many: string,
  count: number,
  values: Record<string, string | number> = {},
): string {
  return fill(count === 1 ? one : many, { ...values, count });
}
