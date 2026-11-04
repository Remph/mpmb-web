// What a sheet update changed (M11): the values the player sees, before MPMB's import moved the character to
// the new sheet and after. MPMB's import applies the old sheet's choices again, so text changed by hand can
// come out differently; the update note lists these entries so the player can check them, or undo.
//
// Spawned pages are named by template and order ("SSfront#0.") on both sides: the import may spawn them in
// another order, and the page number in a spawned field's name ("P6.SSfront.") would differ.
import { AF, FF } from './types.ts';
import type { FieldDef, SheetSnapshot } from './types.ts';

/** The values a player sees, by field name (spawned pages by template and order). */
export type FieldValues = Record<string, string>;

export interface SheetChange {
  field: string;
  /** '' for empty (also an unchecked box). */
  before: string;
  now: string;
}

/** MPMB's lists of the pages it spawned from each template: "Template.extras.SSfront" holds "P6.SSfront.,…". */
const EXTRAS = 'Template.extras.';
/** MPMB's own bookkeeping, stored as text in fields nobody sees ("CurrentVars.Stringified"). */
const BOOKKEEPING = '.Stringified';
/**
 * Text fields under the sheet's printed lines (a test text left in MPMB's PDF, "Line.fixed"): never shown,
 * and the import doesn't copy them.
 */
const UNDER_THE_LINES = 'Line.';
/** A check box's value when it is not ticked. */
const UNCHECKED = 'Off';

/**
 * A spawned page's prefix: matches "P6.SSfront." in "P6.SSfront.spells.name.1"; rejects "Spell Slots".
 * Try it: https://regex101.com/?regex=%5EP%5Cd%2B%5C.%5BA-Za-z%5D%2B%5C.&testString=P6.SSfront.spells.name.1%0ASpell+Slots
 */
const SPAWNED_PREFIX = /^P\d+\.[A-Za-z]+\./;

const text = (value: FieldDef['value']): string => {
  const joined = Array.isArray(value) ? value.join(', ') : String(value ?? '');
  return joined === UNCHECKED ? '' : joined;
};

/** Shown on some page: not a push button, not only on hidden template pages, not hidden itself. */
const visible = (field: FieldDef): boolean =>
  !(field.flags & FF.pushButton) &&
  field.type !== 'Sig' &&
  field.widgets.some((w) => w.page >= 0 && !(w.flags & (AF.hidden | AF.invisible | AF.noView)));

/** Renames "P6.SSfront.x" to "SSfront#0.x" by MPMB's own lists of spawned pages. */
function templateNames(sheet: SheetSnapshot): (name: string) => string {
  const renames = new Map(
    Object.entries(sheet.fields)
      .filter(([name]) => name.startsWith(EXTRAS))
      .flatMap(([name, field]) =>
        text(field.value)
          .split(',')
          .filter(Boolean)
          .map((prefix, i) => [prefix, `${name.slice(EXTRAS.length)}#${i}.`] as const),
      ),
  );
  return (name) => {
    const prefix = SPAWNED_PREFIX.exec(name)?.[0];
    const to = prefix === undefined ? undefined : renames.get(prefix);
    return to === undefined ? name : to + name.slice((prefix ?? '').length);
  };
}

/** The values a player sees on this sheet. */
export function fieldValues(sheet: SheetSnapshot): FieldValues {
  const rename = templateNames(sheet);
  return Object.fromEntries(
    Object.entries(sheet.fields)
      .filter(
        ([name, field]) =>
          !name.startsWith(EXTRAS) && !name.startsWith(UNDER_THE_LINES) && !name.endsWith(BOOKKEEPING) && visible(field),
      )
      .map(([name, field]) => [rename(name), text(field.value)]),
  );
}

/** The entries whose value differs, in the order of the sheet after the update (then those it no longer has). */
export function sheetChanges(before: FieldValues, now: FieldValues): SheetChange[] {
  const names = [...new Set([...Object.keys(now), ...Object.keys(before)])];
  return names
    .map((field) => ({ field, before: before[field] ?? '', now: now[field] ?? '' }))
    .filter((c) => c.before !== c.now);
}
