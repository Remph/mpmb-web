import type { CharacterData } from '../engine/sheet-data.ts';

/** A field's text in the saved character; the blank sheet's fields are empty where these are read. */
export const textOf = (data: CharacterData, field: string): string => {
  const value: unknown = data.fields[field]?.value;
  // String(): a calculated field (Character Level) may hold a number at run time, whatever the type says.
  return (Array.isArray(value) ? value.join(', ') : String(value ?? '')).trim();
};
