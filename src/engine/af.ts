// Acrobat's built-in format, keystroke and validate helpers that the sheet's fields call
// (AFNumber_Format, AFNumber_Keystroke, AFRange_Validate, AFDate_Format). Behaviour follows Acrobat's
// AForm.js as documented and as pdf.js reimplements it, limited to the arguments the sheet uses.
// Each helper reads the event and returns what to change on it (engine.ts applies it), plus an
// alert message where Acrobat shows one.
import { formatNumber, printd, scand } from './util.ts';

/** The part of Acrobat's `event` these helpers read. */
export interface AfEvent {
  value: unknown;
  change?: string;
  willCommit?: boolean;
  selStart?: number;
  selEnd?: number;
}

/** What to change on the event: a new value, a rejection (rc false), a message for the user. */
export interface AfResult {
  value?: string;
  rc?: boolean;
  alert?: string;
}

/** AFDate_Format's numbered formats (Acrobat's list, the same order as pdf.js). */
const DATE_FORMATS = [
  'm/d',
  'm/d/yy',
  'mm/dd/yy',
  'mm/yy',
  'd-mmm',
  'd-mmm-yy',
  'dd-mmm-yy',
  'yy-mm-dd',
  'mmm-yy',
  'mmmm-yy',
  'mmm d, yyyy',
  'mmmm d, yyyy',
  'm/d/yy h:MM tt',
  'm/d/yy HH:MM',
] as const;

/**
 * A number from a field's text, as Acrobat's AFMakeNumber reads it: a comma counts as the decimal
 * point, whatever the separator style. Field values hold plain numbers ("2.5"), and MPMB formats the
 * same value first with sepStyle 1 and then again with the player's style (format1 in Functions0.js),
 * so "2.5" must stay 2.5 in the comma styles too; null if the text isn't a number.
 */
export function parseNumber(text: unknown): number | null {
  const s = String(text ?? '').trim();
  if (s === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function AFNumber_Format(ev: AfEvent, nDec: number, sepStyle: number): AfResult {
  const n = parseNumber(ev.value);
  if (n === null) return String(ev.value ?? '').trim() === '' ? { value: '' } : {};
  return { value: formatNumber(n, Number(nDec) || 0, Number(sepStyle) || 0) };
}

/**
 * Typing into a number field: digits, one decimal separator and a leading minus. On commit, the whole
 * value must be a number; Acrobat then alerts "The value entered does not match the format of the field".
 * Matches "12", "-1.5", "3,"; not "1a" or "1-". Try it: https://regex101.com/?regex=%5E-%3F%5Cd*(%5B.%2C%5D%5Cd*)%3F%24&testString=-1.5
 */
const PARTIAL_NUMBER = /^-?\d*([.,]\d*)?$/;

export function AFNumber_Keystroke(ev: AfEvent): AfResult {
  if (ev.willCommit) {
    const text = String(ev.value ?? '').trim();
    if (text === '' || parseNumber(text) !== null) return {};
    return { rc: false, alert: 'The value entered does not match the format of the field' };
  }
  const value = String(ev.value ?? '');
  const start = ev.selStart ?? value.length;
  const end = ev.selEnd ?? start;
  const proposed = value.slice(0, start) + String(ev.change ?? '') + value.slice(end);
  return { rc: PARTIAL_NUMBER.test(proposed) };
}

export function AFRange_Validate(
  ev: AfEvent,
  bGreaterThan: boolean,
  nGreaterThan: number,
  bLessThan: boolean,
  nLessThan: number,
): AfResult {
  if (String(ev.value ?? '') === '') return {};
  const n = Number(ev.value);
  const tooSmall = bGreaterThan && n < nGreaterThan;
  const tooBig = bLessThan && n > nLessThan;
  if (!tooSmall && !tooBig) return {};
  const range = [
    bGreaterThan ? `greater than or equal to ${nGreaterThan}` : '',
    bLessThan ? `less than or equal to ${nLessThan}` : '',
  ]
    .filter((s) => s)
    .join(' and ');
  return { rc: false, alert: `The value entered must be ${range}.` };
}

export function AFDate_FormatEx(ev: AfEvent, format: string): AfResult {
  const text = String(ev.value ?? '');
  if (!text) return {};
  const date = scand(format, text) ?? parseLooseDate(text);
  return { value: date ? printd(format, date) : '' };
}

export function AFDate_Format(ev: AfEvent, index: number): AfResult {
  return AFDate_FormatEx(ev, DATE_FORMATS[index] ?? DATE_FORMATS[0]);
}

export function AFDate_KeystrokeEx(ev: AfEvent, format: string): AfResult {
  const text = String(ev.value ?? '');
  if (!ev.willCommit || !text || scand(format, text) || parseLooseDate(text)) return {};
  return {
    rc: false,
    alert: `Invalid date/time: please ensure that the date/time exists. Field should match format ${format}`,
  };
}

export function AFDate_Keystroke(ev: AfEvent, index: number): AfResult {
  return AFDate_KeystrokeEx(ev, DATE_FORMATS[index] ?? DATE_FORMATS[0]);
}

/** Acrobat also reads dates that don't fit the format exactly; the browser's parser is close enough. */
function parseLooseDate(text: string): Date | null {
  const t = Date.parse(text);
  return Number.isNaN(t) ? null : new Date(t);
}
