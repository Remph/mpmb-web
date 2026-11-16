// When the Lager changed last, as the panel's top line says it: "just now", a time today, or a date with the time.
import type { Texts } from '../../i18n.ts';

/** A change less than this long ago is "just now". */
const JUST_NOW_MS = 60_000;

export function changedWhen(updated: number, now: number, t: Pick<Texts, 'lagerChangedNow' | 'locale'>): string {
  if (now - updated < JUST_NOW_MS) return t.lagerChangedNow;
  const then = new Date(updated);
  const today = new Date(now).toDateString() === then.toDateString();
  const format = today
    ? new Intl.DateTimeFormat(t.locale, { timeStyle: 'short' })
    : new Intl.DateTimeFormat(t.locale, { dateStyle: 'medium', timeStyle: 'short' });
  return format.format(then);
}
