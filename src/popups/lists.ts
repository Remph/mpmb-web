// Lists in Acrobat dialogs (popup, list_box, hier_list_box) keep their entries and the selection in
// one value: an object of entry text -> number, where a positive number marks the selected entry.
// A hier_list_box nests objects for groups: { "Group": { "Entry": -1 } }. MPMB reads the selection
// back the same way (GetPositiveElement in FunctionsResources.js), so the page keeps that shape.

export type ListValue = Record<string, unknown>;

export interface ListEntry {
  label: string;
  selected: boolean;
  /** Entries of a group in a hier_list_box; groups can't be selected themselves. */
  children?: ListEntry[];
}

const isGroup = (value: unknown): value is ListValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The entries in the order the object lists them. */
export function listEntries(value: unknown): ListEntry[] {
  if (!isGroup(value)) return [];
  return Object.entries(value).map(([label, v]) =>
    isGroup(v) ? { label, selected: false, children: listEntries(v) } : { label, selected: Number(v) > 0 },
  );
}

/**
 * The value with only the entry at `path` (labels from the top) selected. The numbers keep their size
 * and only change sign, in case a script reads them as an order.
 */
export function selectEntry(value: unknown, path: readonly string[]): ListValue {
  if (!isGroup(value)) return {};
  const [head, ...rest] = path;
  return Object.fromEntries(
    Object.entries(value).map(([label, v]) => {
      if (isGroup(v)) return [label, selectEntry(v, label === head ? rest : [])];
      const size = Math.abs(Number(v)) || 1;
      return [label, label === head && rest.length === 0 ? size : -size];
    }),
  );
}
