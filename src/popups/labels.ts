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
