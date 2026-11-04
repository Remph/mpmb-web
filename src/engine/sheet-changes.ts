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
          !name.startsWith(EXTRAS) &&
          !name.startsWith(UNDER_THE_LINES) &&
          !name.endsWith(BOOKKEEPING) &&
          visible(field),
      )
      .map(([name, field]) => [rename(name), text(field.value)]),
  );
}

/**
 * The sheet's lists whose rows MPMB's import may fill in another order: the limited features (name, uses,
 * recovery, used) and the three action lists. Each list is compared by its rows, not field by field: a
 * feature that moved from row 1 to row 3 is the same feature (UI review 2, finding 03).
 */
interface RowList {
  /** Matches the row's first column and captures its number. */
  first: RegExp;
  columns: (n: string) => string[];
}
const ROW_LISTS: RowList[] = [
  {
    // Matches "Limited Feature 3"; rejects "Limited Feature Max Usages 3".
    // Try it: https://regex101.com/?regex=%5ELimited+Feature+(%5Cd%2B)%24&testString=Limited+Feature+3%0ALimited+Feature+Max+Usages+3
    first: /^Limited Feature (\d+)$/,
    columns: (n) => [
      `Limited Feature ${n}`,
      `Limited Feature Max Usages ${n}`,
      `Limited Feature Recovery ${n}`,
      `Limited Feature Used ${n}`,
    ],
  },
  ...['Action', 'Bonus Action', 'Reaction'].map((list) => ({
    first: new RegExp(`^${list} (\\d+)$`),
    columns: (n: string) => [`${list} ${n}`],
  })),
];

interface Row {
  /** The row's first column, which names it in the update window. */
  field: string;
  cells: string[];
}

/** The list's rows with anything in them, in the sheet's order. */
function rowsOf(list: RowList, values: FieldValues): Row[] {
  return Object.keys(values)
    .map((name) => list.first.exec(name)?.[1])
    .filter((n): n is string => n !== undefined)
    .map((n) => {
      const columns = list.columns(n);
      return { field: columns[0] ?? '', cells: columns.map((c) => values[c] ?? '') };
    })
    .filter((row) => row.cells.some((cell) => cell !== ''));
}

/** A row as one entry: "Lay on Hands · 40 · long rest". */
const rowText = (row: Row): string => row.cells.filter((cell) => cell !== '').join(' · ');

/**
 * What changed in one list, row by row: a row is matched by its name with the first unmatched row of that
 * name on the other sheet. Rows only in another order give nothing; a row whose uses changed is one entry;
 * a row that went or came is one entry.
 */
function rowChanges(list: RowList, before: FieldValues, now: FieldValues): SheetChange[] {
  const left = rowsOf(list, now);
  const changes: SheetChange[] = [];
  for (const old of rowsOf(list, before)) {
    const at = left.findIndex((row) => row.cells[0] === old.cells[0]);
    const match = left.splice(at, at === -1 ? 0 : 1)[0];
    if (!match) changes.push({ field: old.field, before: rowText(old), now: '' });
    else if (rowText(match) !== rowText(old))
      changes.push({ field: match.field, before: rowText(old), now: rowText(match) });
  }
  return [...changes, ...left.map((row) => ({ field: row.field, before: '', now: rowText(row) }))];
}

/**
 * The entries whose value differs: first those that became empty (what a player is most likely to miss),
 * then the rest in the order of the sheet after the update (then those it no longer has). The lists above
 * count by rows. With the two versions given, an entry that differs only in the sheet's version number (the
 * spell sheet's "… Character Record Sheet v24.2.0" line) doesn't count: the update is what changed it.
 */
export function sheetChanges(
  before: FieldValues,
  now: FieldValues,
  versions?: { from: string; to: string },
): SheetChange[] {
  const names = [...new Set([...Object.keys(now), ...Object.keys(before)])];
  const onlyVersion = (c: SheetChange): boolean =>
    versions !== undefined && c.before.split(versions.from).join(versions.to) === c.now;
  // filter()[0], not find(): MPMB's scripts replace Array.prototype.find in the worker (engine-code.test.ts).
  const listOf = (field: string): RowList | undefined =>
    ROW_LISTS.filter((list) => {
      const n = /\d+$/.exec(field)?.[0];
      return n !== undefined && list.columns(n).includes(field);
    })[0];
  const listed = new Set<RowList>();
  const changes = names
    .map((field) => ({ field, before: before[field] ?? '', now: now[field] ?? '' }))
    .filter((c) => c.before !== c.now && !onlyVersion(c))
    .flatMap((c) => {
      const list = listOf(c.field);
      if (!list) return [c];
      // The whole list once, where its first changed field is.
      if (listed.has(list)) return [];
      listed.add(list);
      return rowChanges(list, before, now);
    });
  return [...changes.filter((c) => c.now === ''), ...changes.filter((c) => c.now !== '')];
}
