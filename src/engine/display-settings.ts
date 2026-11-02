// MPMB's Format scripts write the sheet's unit and decimal separator into many fields' text ("0 kg").
// A field's Format runs when its value changes, so after a units or decimal switch the fields whose
// value stayed the same (an empty weight) would keep the old unit. Acrobat redraws every field then;
// the app runs every Format script again (M6.5 fix round).
import type { Engine } from './engine.ts';

/** The fields that hold the sheet's display settings, which MPMB's units dialog sets. */
const DISPLAY_SETTINGS = ['Unit System', 'Decimal Separator'] as const;

/** The display settings as one text, to compare before and after a command. */
export const displaySettings = (engine: Engine): string =>
  DISPLAY_SETTINGS.map((name) => String(engine.doc.states.get(name)?.value ?? '')).join('|');

/** Runs every Format script again when the display settings differ from `before`. */
export function refreshFormats(engine: Engine, before: string): boolean {
  if (displaySettings(engine) === before) return false;
  engine.doc.formatAll();
  return true;
}
