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
