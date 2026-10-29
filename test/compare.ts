// Compares the engine's sheet with what Acrobat saved in a reference PDF, field by field.
import type { SheetSnapshot } from '../src/engine/types.ts';
import { FF } from '../src/engine/types.ts';

export interface Difference {
  field: string;
  /** Page of the field's first widget on a real page (-1: only on a template). */
  page: number;
  what: 'value' | 'submitName' | 'userName' | 'display' | 'missing' | 'extra';
  acrobat: string;
  ours: string;
}

const EMPTY = new Set(['', 'Off']);
const text = (v: unknown): string => {
  if (Array.isArray(v)) return v.join('\n');
  return v === undefined || v === null ? '' : String(v);
};
/** How much of a value a difference report shows. */
const SHOWN_CHARS = 80;
const SHOWN_DIFFS = 30;
const firstPage = (s: SheetSnapshot, name: string): number =>
  s.fields[name]?.widgets.map((w) => w.page).find((p) => p >= 0) ?? -1;

/** Value, submitName and userName of every field, and fields that exist on only one side. */
export function compareSheets(
  acrobat: SheetSnapshot,
  ours: SheetSnapshot,
  parts: Difference['what'][] = ['value', 'missing', 'extra'],
): Difference[] {
  const out: Difference[] = [];
  Object.entries(acrobat.fields).forEach(([field, want]) => {
    const got = ours.fields[field];
    const page = firstPage(acrobat, field);
    if (!got) {
      if (parts.includes('missing')) out.push({ field, page, what: 'missing', acrobat: text(want.value), ours: '' });
      return;
    }
    // Push buttons have no value of their own.
    if (want.type === 'Btn' && want.flags & FF.pushButton) return;
    const pairs: [Difference['what'], unknown, unknown][] = [
      ['value', want.value, got.value],
      ['submitName', want.submitName, got.submitName],
      ['userName', want.userName, got.userName],
    ];
    pairs.forEach(([what, a, b]) => {
      if (!parts.includes(what)) return;
      const ta = text(a);
      const tb = text(b);
      if (ta === tb || (EMPTY.has(ta) && EMPTY.has(tb))) return;
      out.push({ field, page, what, acrobat: ta, ours: tb });
    });
    if (parts.includes('display')) {
      const da = want.widgets.map((w) => w.flags).join(',');
      const db = got.widgets.map((w) => w.flags).join(',');
      if (da !== db) out.push({ field, page, what: 'display', acrobat: da, ours: db });
    }
  });
  if (parts.includes('extra')) {
    Object.keys(ours.fields)
      .filter((f) => !(f in acrobat.fields))
      .forEach((field) =>
        out.push({
          field,
          page: firstPage(ours, field),
          what: 'extra',
          acrobat: '',
          ours: text(ours.fields[field]?.value),
        }),
      );
  }
  return out;
}

export function byPage(diffs: Difference[]): Record<number, number> {
  return diffs.reduce<Record<number, number>>((acc, d) => ({ ...acc, [d.page]: (acc[d.page] ?? 0) + 1 }), {});
}

export const show = (diffs: Difference[], max = SHOWN_DIFFS): string =>
  diffs
    .slice(0, max)
    .map(
      (d) =>
        `p${d.page} ${d.what} ${JSON.stringify(d.field)} acrobat=${JSON.stringify(d.acrobat.slice(0, SHOWN_CHARS))} ours=${JSON.stringify(d.ours.slice(0, SHOWN_CHARS))}`,
    )
    .join('\n');
