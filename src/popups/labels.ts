import type { Texts } from '../i18n.ts';

/**
 * The text Acrobat shows for a dialog element's name. Acrobat's dialogs use Windows' mnemonics: a
 * single "&" underlines the next letter (the keyboard shortcut) and isn't shown, "&&" shows one "&".
 * MPMB writes "Change Available Classes && Archetypes" for that reason.
 */
export function acrobatLabel(name: string): string {
  return name
    .split('&&')
    .map((part) => part.split('&').join(''))
    .join('&');
}

/**
 * MPMB's names for its dialogs' closing buttons that are plain commands, in the player's language: the app
 * already writes Cancel, Yes and No in it, and "Abbrechen" next to MPMB's "Apply" read like a slip (UI review
 * 2, finding 04). Names that say what the button makes ("Generate the Spell Sheet") are part of MPMB's
 * English dialog and stay as they are.
 */
const CLOSER_NAMES: Record<string, (t: Texts) => string> = {
  Apply: (t) => t.dlgApply,
  'Apply changes': (t) => t.dlgApplyChanges,
  Cancel: (t) => t.cancel,
  'Cancel changes': (t) => t.dlgCancelChanges,
  'Cancel and Stop': (t) => t.dlgCancelStop,
  Close: (t) => t.close,
  'Continue to Next Dialog': (t) => t.dlgNext,
  Done: (t) => t.dlgDone,
  OK: (t) => t.ok,
  Select: (t) => t.dlgSelect,
};

/** MPMB's "Continue to Next Dialog >>": the arrows stay after the translated name. */
const ARROWS = /\s*>>$/;

/** A closing button's text: MPMB's name, translated when it is one of the plain commands above. */
export function closerLabel(name: string, t: Texts): string {
  const shown = acrobatLabel(name).trim();
  const arrows = ARROWS.test(shown) ? ' >>' : '';
  const translate = CLOSER_NAMES[shown.replace(ARROWS, '')];
  return translate ? translate(t) + arrows : shown;
}

/** MPMB names every dialog in capitals and ends with " DIALOG" ("IMPORT CUSTOM SCRIPT DIALOG"). */
const DIALOG_SUFFIX = / DIALOG$/;

/** Names and abbreviations in MPMB's dialog names that keep their own case ("Import from PDF"). */
const KEEP_CASE = new Map(['PDF', 'XFDF', 'MPMB', 'Acrobat', 'Patreon'].map((word) => [word.toLowerCase(), word]));

/**
 * A dialog's title as the app shows it: MPMB's name without " DIALOG", in sentence case, so it reads
 * like the app's own titles ("Import custom script"). A name that isn't all capitals stays as it is.
 */
export function dialogTitle(name: string): string {
  const bare = name.trim().replace(DIALOG_SUFFIX, '');
  if (!bare) return 'MPMB';
  if (bare !== bare.toUpperCase()) return bare;
  const lower = bare.toLowerCase();
  const sentence = lower.charAt(0).toUpperCase() + lower.slice(1);
  return sentence.replace(/[a-z]+/gi, (word) => KEEP_CASE.get(word.toLowerCase()) ?? word);
}

/**
 * MPMB's advice for Acrobat's fixed-size windows, a line of its own in square brackets: matches "[Can't see
 * the bottom of this dialog? Use ENTER to confirm or ESC to cancel]" and "[Can't see the 'OK' button at the
 * bottom? Use ENTER to close this dialog]"; rejects "Can't see the spell? Add it below". The app's windows
 * scroll and keep their buttons in view, so the advice is only noise (UI review 2, finding 09).
 * Try it: https://regex101.com/?regex=%5E%5C%5BCan%27t+see+the+%5B%5E%5C%5D%5Cn%5D*%5C%5D%5B+%5Ct%5D*%5Cn*&flags=gm&testString=%5BCan%27t+see+the+bottom+of+this+dialog%3F+Use+ENTER+to+confirm+or+ESC+to+cancel%5D%0A%0AWelcome%0ACan%27t+see+the+spell%3F+Add+it+below
 */
const ACROBAT_HINT = /^\[Can't see the [^\]\n]*\][ \t]*\n*/gm;

/** MPMB's text without its advice for Acrobat's windows. */
export const withoutAcrobatHints = (text: string): string => text.replace(ACROBAT_HINT, '');
