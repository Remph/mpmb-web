// The group's storage, the "Lager" (M16, decisions.md 2026-11-15), as the app sees it: the service's answer, the
// small changes ("ops") the app sends, and what the panel shows (search, the place filter, suggestions). Pure, so
// it runs in the tests as it runs in the panel. The service's side is server/lager.ts; the two must agree on the
// ops, which test/sync-real.test.ts checks against the real service.

/** A group shows a place per item (magic items: in the Lager, with a character, gone) or a count (materials). */
export type GroupKind = 'place' | 'count';

export interface LagerGroup {
  id: string;
  name: string;
  kind: GroupKind;
}

export interface LagerItem {
  id: string;
  group: string;
  name: string;
  count: number;
  /** Where it is: '' or "Lager" in the Lager, a character's name, or a word for gone ("Gone", "m.i.a"). */
  place: string;
  /** A note or the item's whole text. */
  note: string;
  /** When it changed last (ms since 1970), and who changed it ('' when that player was removed). */
  updated: number;
  by: string;
}

export interface Lager {
  version: number;
  /** The group's gold in copper: 123450 is 1,234.5 gp. */
  copper: number;
  goldNote: string;
  updated: number;
  by: string;
  groups: LagerGroup[];
  items: LagerItem[];
}

export type Op =
  | { op: 'addGroup'; id: string; name: string; kind: GroupKind }
  | { op: 'renameGroup'; id: string; name: string }
  | { op: 'removeGroup'; id: string }
  | { op: 'orderGroups'; ids: string[] }
  | { op: 'add'; id: string; group: string; name: string; count: number; place: string; note: string }
  | { op: 'count'; id: string; by: number }
  | { op: 'set'; id: string; name?: string; place?: string; note?: string; group?: string }
  | { op: 'remove'; id: string }
  | { op: 'gold'; by?: number; to?: number }
  | { op: 'goldNote'; note: string };

/** The same limits as the service's (server/lager.ts), so the app never sends what it would refuse. */
const MAX_OPS = 1000;
const GROUP_NAME_MAX = 80;
const ITEM_NAME_MAX = 200;
const PLACE_MAX = 80;
const NOTE_MAX = 20_000;
const GOLD_NOTE_MAX = 200;
const COUNT_MAX = 1_000_000;
const COPPER_MAX = 1_000_000_000_000;

export const LAGER_LIMITS = {
  ops: MAX_OPS,
  groupName: GROUP_NAME_MAX,
  itemName: ITEM_NAME_MAX,
  place: PLACE_MAX,
  note: NOTE_MAX,
  goldNote: GOLD_NOTE_MAX,
  count: COUNT_MAX,
  copper: COPPER_MAX,
} as const;

/** Gold has at most two decimals: copper is a hundredth of a gold piece. */
const GOLD_DECIMALS = 2;

/** Copper in one gold piece. */
export const COPPER_PER_GOLD = 100;

/** The place a new item gets: the Lager itself. */
export const IN_LAGER = 'Lager';

export type PlaceKind = 'lager' | 'gone' | 'character';

/** Words the group writes for an item that is gone, lowercased and without dots: "Gone", "m.i.a", "-", "weg". */
const GONE_WORDS = new Set(['gone', 'mia', '-', 'weg', 'lost', 'verloren', 'sold', 'verkauft']);

/** What a place means: in the Lager, gone, or with someone. */
export function placeKind(place: string): PlaceKind {
  const word = place.trim().toLowerCase().replaceAll('.', '');
  if (word === '' || word === 'lager' || word === 'storage') return 'lager';
  return GONE_WORDS.has(word) ? 'gone' : 'character';
}

/** The place filter over the items of place groups. */
export type PlaceFilter = 'all' | PlaceKind;

/** The groups with their items in the Lager's order, after a search and the place filter. */
export function shownGroups(
  lager: Lager,
  query: string,
  filter: PlaceFilter,
): { group: LagerGroup; items: LagerItem[]; total: number }[] {
  // Split at runs of white space: "ring  of" is ["ring", "of"].
  // Try it: https://regex101.com/?regex=%5Cs%2B&testString=ring%20%20of
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (item: LagerItem) => {
    const text = `${item.name} ${item.place}`.toLowerCase();
    return words.every((word) => text.includes(word));
  };
  return lager.groups.map((group) => {
    const all = lager.items.filter((item) => item.group === group.id);
    const items = all.filter(
      (item) => matches(item) && (group.kind !== 'place' || filter === 'all' || placeKind(item.place) === filter),
    );
    return { group, items, total: all.length };
  });
}

/** How many items of the place groups are in the Lager, with characters and gone (the filter's numbers). */
export function placeCounts(lager: Lager): Record<PlaceFilter, number> {
  const placed = new Set(lager.groups.filter((group) => group.kind === 'place').map((group) => group.id));
  const items = lager.items.filter((item) => placed.has(item.group));
  const of = (kind: PlaceKind) => items.filter((item) => placeKind(item.place) === kind).length;
  return { all: items.length, lager: of('lager'), character: of('character'), gone: of('gone') };
}

/** The characters items are with, most used first: the place picker's suggestions. */
export function placesUsed(lager: Lager): string[] {
  const counts = lager.items
    .map((item) => item.place.trim())
    .filter((place) => placeKind(place) === 'character')
    .reduce((all, place) => all.set(place, (all.get(place) ?? 0) + 1), new Map<string, number>());
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([place]) => place);
}

/** An item of the group with this name, whatever its case and spaces ("iron ore " is "Iron Ore"). */
export function sameItem(lager: Lager, group: string, name: string): LagerItem | null {
  const key = name.trim().toLowerCase();
  return lager.items.find((item) => item.group === group && item.name.trim().toLowerCase() === key) ?? null;
}

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));

/**
 * The Lager after `ops`, as the service will make it (server/lager.ts): shown at once while the request is on its
 * way, then replaced by the service's answer. Everything the service ignores (a removed item, a group that is
 * gone, an id that exists) this ignores too.
 */
export function applyOps(lager: Lager, ops: readonly Op[], by: string, now: number): Lager {
  const next = ops.reduce<Lager>((state, op) => applyOne(state, op, by, now), {
    ...lager,
    groups: [...lager.groups],
    items: [...lager.items],
  });
  return { ...next, updated: now, by };
}

type Step<K extends Op['op']> = (
  lager: Lager,
  op: Extract<Op, { op: K }>,
  stamp: { updated: number; by: string },
) => Lager;

const changeItem = (lager: Lager, id: string, change: (item: LagerItem) => LagerItem): Lager => ({
  ...lager,
  items: lager.items.map((item) => (item.id === id ? change(item) : item)),
});

const STEPS: { [K in Op['op']]: Step<K> } = {
  addGroup: (lager, op) =>
    lager.groups.some((group) => group.id === op.id)
      ? lager
      : { ...lager, groups: [...lager.groups, { id: op.id, name: op.name, kind: op.kind }] },
  renameGroup: (lager, op) => ({
    ...lager,
    groups: lager.groups.map((group) => (group.id === op.id ? { ...group, name: op.name } : group)),
  }),
  removeGroup: (lager, op) => ({
    ...lager,
    groups: lager.groups.filter((group) => group.id !== op.id),
    items: lager.items.filter((item) => item.group !== op.id),
  }),
  orderGroups: (lager, op) => ({ ...lager, groups: orderedGroups(lager.groups, op.ids) }),
  add: (lager, op, stamp) => {
    if (lager.items.some((item) => item.id === op.id) || !lager.groups.some((group) => group.id === op.group)) {
      return lager;
    }
    const { id, group, name, count, place, note } = op;
    return { ...lager, items: [...lager.items, { id, group, name, count, place, note, ...stamp }] };
  },
  count: (lager, op, stamp) =>
    changeItem(lager, op.id, (item) => ({ ...item, count: clamp(item.count + op.by, LAGER_LIMITS.count), ...stamp })),
  set: (lager, op, stamp) =>
    changeItem(lager, op.id, (item) => ({
      ...item,
      name: op.name ?? item.name,
      place: op.place ?? item.place,
      note: op.note ?? item.note,
      group: op.group !== undefined && lager.groups.some((group) => group.id === op.group) ? op.group : item.group,
      ...stamp,
    })),
  remove: (lager, op) => ({ ...lager, items: lager.items.filter((item) => item.id !== op.id) }),
  gold: (lager, op) => ({
    ...lager,
    copper: op.to ?? clamp(lager.copper + (op.by ?? 0), LAGER_LIMITS.copper),
  }),
  goldNote: (lager, op) => ({ ...lager, goldNote: op.note }),
};

/** The groups in the order `ids` names them; any it doesn't name (added meanwhile) follow, as server/lager.ts. */
function orderedGroups(groups: readonly LagerGroup[], ids: readonly string[]): LagerGroup[] {
  const at = (group: LagerGroup) => {
    const index = ids.indexOf(group.id);
    return index < 0 ? ids.length + groups.indexOf(group) : index;
  };
  return [...groups].sort((a, b) => at(a) - at(b));
}

/** The group order after moving one group a step up (-1) or down (+1), or null at the end of the list. */
export function movedGroup(lager: Lager, id: string, by: -1 | 1): string[] | null {
  const ids = lager.groups.map((group) => group.id);
  const from = ids.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  [ids[from], ids[to]] = [ids[to] as string, ids[from] as string];
  return ids;
}

function applyOne(lager: Lager, op: Op, by: string, now: number): Lager {
  // TypeScript can't pair a member of the union with its entry in the table, hence the cast.
  return (STEPS[op.op] as Step<Op['op']>)(lager, op as never, { updated: now, by });
}

/** The service's answer, checked enough that a broken one can't break the panel. */
export function isLager(value: unknown): value is Lager {
  const lager = value as Lager | null;
  return (
    typeof lager === 'object' &&
    lager !== null &&
    typeof lager.version === 'number' &&
    typeof lager.copper === 'number' &&
    Array.isArray(lager.groups) &&
    Array.isArray(lager.items)
  );
}

/** An empty Lager, before the first answer. */
export const EMPTY_LAGER: Lager = { version: 0, copper: 0, goldNote: '', updated: 0, by: '', groups: [], items: [] };

/** Gold as people read it: "1,234.5" (copper shown as hundredths, without trailing zeros). */
export function goldText(copper: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: GOLD_DECIMALS }).format(copper / COPPER_PER_GOLD);
}

/**
 * A typed amount of gold in copper, or null. Accepts "1234.5", "1234,5" (German) and thousands marks the
 * other way round ("1.234,5", "1,234.5"): the last dot or comma with one or two digits after it is the decimal one.
 */
export function parseGold(text: string): number | null {
  const plain = text.trim().replaceAll(' ', '').replaceAll(' ', '');
  // "1.234,5" or "1,234.50": digits with dots or commas, and at most two digits after the last mark.
  // Try it: https://regex101.com/?regex=%5E(%5Cd%5B%5Cd.%2C%5D*%3F)(%3F%3A%5B.%2C%5D(%5Cd%7B1%2C2%7D))%3F%24&testString=1.234%2C5
  const match = /^(\d[\d.,]*?)(?:[.,](\d{1,2}))?$/.exec(plain);
  if (!match) return null;
  // The thousands marks out: "1.234" is "1234". Try it: https://regex101.com/?regex=%5B.%2C%5D&testString=1.234
  const whole = Number((match[1] ?? '').replace(/[.,]/g, ''));
  const cents = Number((match[2] ?? '').padEnd(GOLD_DECIMALS, '0'));
  const copper = whole * COPPER_PER_GOLD + cents;
  return Number.isSafeInteger(copper) && copper <= LAGER_LIMITS.copper ? copper : null;
}

/** The file an import reads: what the panel's "Import a list" accepts (the group's list was made into one). */
export interface LagerFile {
  copper?: number;
  goldNote?: string;
  groups: { name: string; kind: GroupKind; items: { name: string; count?: number; place?: string; note?: string }[] }[];
}

/**
 * The ops that put a list file into the Lager, with new ids, or null when the file isn't one. Texts are cut to the
 * service's limits rather than refused: a long item text shouldn't stop the whole import.
 */
export function importOps(value: unknown, newId: () => string): Op[] | null {
  const file = value as LagerFile | null;
  if (typeof file !== 'object' || file === null || !Array.isArray(file.groups)) return null;
  const text = (input: unknown, max: number) => (typeof input === 'string' ? input.trim().slice(0, max) : '');
  const groupOps = file.groups.map((group): Op[] | null => {
    const name = text(group?.name, LAGER_LIMITS.groupName);
    if (!name || (group.kind !== 'place' && group.kind !== 'count') || !Array.isArray(group.items)) return null;
    const id = newId();
    const items = group.items
      .filter((item) => text(item?.name, LAGER_LIMITS.itemName))
      .map((item): Op => ({
        op: 'add',
        id: newId(),
        group: id,
        name: text(item.name, LAGER_LIMITS.itemName),
        count: Number.isSafeInteger(item.count) ? clamp(item.count as number, LAGER_LIMITS.count) : 1,
        place: group.kind === 'place' ? text(item.place, LAGER_LIMITS.place) || IN_LAGER : '',
        note: text(item.note, LAGER_LIMITS.note),
      }));
    return [{ op: 'addGroup', id, name, kind: group.kind }, ...items];
  });
  if (groupOps.some((ops) => ops === null)) return null;
  const ops: Op[] = groupOps.flatMap((group) => group ?? []);
  if (Number.isSafeInteger(file.copper))
    ops.push({ op: 'gold', to: clamp(file.copper as number, LAGER_LIMITS.copper) });
  if (typeof file.goldNote === 'string') ops.push({ op: 'goldNote', note: text(file.goldNote, LAGER_LIMITS.goldNote) });
  return ops.length && ops.length <= LAGER_LIMITS.ops ? ops : null;
}
