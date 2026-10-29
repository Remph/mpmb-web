// The blank Colorful A4 sheet (v24.2.0) that ships with the app, and characters opened on it.
import blankData from './data/colorful-a4.json';
import { applyCharacter, unpackSheet } from './sheet-data.ts';
import type { CharacterData, PackedSheet } from './sheet-data.ts';
import type { SheetSnapshot } from './types.ts';

let blank: SheetSnapshot | null = null;

/** The blank sheet. Unpacked once; callers get their own copy only through applyCharacter. */
export function blankSheet(): SheetSnapshot {
  blank ??= unpackSheet(blankData as unknown as PackedSheet);
  return blank;
}

/** A character's full sheet: the blank sheet with the character's differences. */
export function characterSheet(data: CharacterData): SheetSnapshot {
  return applyCharacter(blankSheet(), data);
}
