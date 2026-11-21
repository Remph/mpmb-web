// The group's storage, the "Lager" (M16, decisions.md 2026-11-15), as the app sees it: the service's answer, the
// small changes ("ops") the app sends, and what the panel shows (search, the place filter, suggestions). Pure, so
// it runs in the tests as it runs in the panel. The service's side is server/lager.ts; the two must agree on the
// ops, which test/sync-real.test.ts checks against the real service. Types and limits come from protocol.ts,
// which the service imports too.
import { LAGER_LIMITS, type GroupKind, type Lager, type LagerGroup, type LagerItem, type Op } from './protocol.ts';

export type { GroupKind, Lager, LagerGroup, LagerItem, Op };
export { LAGER_LIMITS };

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

/** A search's words, lowercased: "Ring  of" is ["ring", "of"]. */
function searchWords(query: string): string[] {
  // Split at runs of white space. Try it: https://regex101.com/?regex=%5Cs%2B&testString=ring%20%20of
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * The groups with their items in the Lager's order, after a search and the place filter. The search looks in the
 * name, the place and the note (review 07: the materials' texts say what they're for). The filter is about where
 * things are: materials have no place, so their groups show nothing while it's on (Nick's pick, review 06 A).
 */
export function shownGroups(
  lager: Lager,
  query: string,
  filter: PlaceFilter,
): { group: LagerGroup; items: LagerItem[]; total: number }[] {
  const words = searchWords(query);
  const matches = (item: LagerItem) => {
    const text = `${item.name} ${item.place} ${item.note}`.toLowerCase();
    return words.every((word) => text.includes(word));
  };
  return lager.groups.map((group) => {
    const all = lager.items.filter((item) => item.group === group.id);
    const placed = (item: LagerItem) =>
      filter === 'all' || (group.kind === 'place' && placeKind(item.place) === filter);
    return { group, items: all.filter((item) => placed(item) && matches(item)), total: all.length };
  });
}

/** How far into a line a hit may start before the line is cut in front of it (the row shows about 40 letters). */
const HIT_LEAD = 24;
/** How much of the line stays in front of a hit that was cut to. */
const HIT_BEFORE = 12;

/**
 * The note's line under an item's name: its first line, or, when a search found the item only through its note,
 * the line with the hit, cut in front so the hit shows in the row (review 07).
 */
export function noteLine(item: LagerItem, query: string): string {
  const lines = item.note.split('\n');
  const first = lines[0] ?? '';
  const named = `${item.name} ${item.place}`.toLowerCase();
  const words = searchWords(query).filter((word) => !named.includes(word));
  if (!words.length) return first;
  const line = lines.find((each) => words.some((word) => each.toLowerCase().includes(word)));
  if (line === undefined) return first;
  const at = Math.min(...words.map((word) => line.toLowerCase().indexOf(word)).filter((index) => index >= 0));
  if (at <= HIT_LEAD) return line;
  // Start at a word: the last space a little before the hit.
  const space = line.lastIndexOf(' ', at - HIT_BEFORE);
  return `… ${line.slice(space < 0 ? at : space + 1)}`;
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

/** What the gold box asks for: a new total, or a change by an amount (in copper, negative to take away). */
export type GoldEntry = { to: number } | { by: number };

/**
 * What was typed into the gold box, or null. A plain amount is the new total; a leading + or − changes the gold by
 * that amount ("+50" after loot, "-20" after a purchase: review 02). Accepts "1234.5", "1234,5" (German) and
 * thousands marks the other way round ("1.234,5", "1,234.5"): the last dot or comma with one or two digits after it
 * is the decimal one.
 */
export function parseGold(text: string): GoldEntry | null {
  const plain = text.trim().replaceAll(' ', '').replaceAll('\u00a0', '').replaceAll('\u202f', '');
  // An optional sign (+, the hyphen, the minus sign or a dash a phone's keyboard makes of it), then digits with dots or
  // commas, and at most two digits after the last mark.
  // Try it: https://regex101.com/?regex=%5E(%5B%2B%5C-%E2%88%92%E2%80%93%5D)%3F(%5Cd%5B%5Cd.%2C%5D*%3F)(%3F%3A%5B.%2C%5D(%5Cd%7B1%2C2%7D))%3F%24&testString=-1.234%2C5
  const match = /^([+\-−–])?(\d[\d.,]*?)(?:[.,](\d{1,2}))?$/.exec(plain);
  if (!match) return null;
  // The thousands marks out: "1.234" is "1234". Try it: https://regex101.com/?regex=%5B.%2C%5D&testString=1.234
  const whole = Number((match[2] ?? '').replace(/[.,]/g, ''));
  const cents = Number((match[3] ?? '').padEnd(GOLD_DECIMALS, '0'));
  const copper = whole * COPPER_PER_GOLD + cents;
  if (!Number.isSafeInteger(copper) || copper > LAGER_LIMITS.copper) return null;
  const sign = match[1];
  if (!sign) return { to: copper };
  return { by: sign === '+' ? copper : -copper };
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

/**
 * The whole Lager as a list file, the same kind "Import a list" reads (review 08): a copy outside the service, so
 * a group removed by mistake can be imported again into an empty Lager. Who changed what and when stays behind.
 */
export function lagerFile(lager: Lager): LagerFile {
  return {
    copper: lager.copper,
    goldNote: lager.goldNote,
    groups: lager.groups.map((group) => ({
      name: group.name,
      kind: group.kind,
      items: lager.items
        .filter((item) => item.group === group.id)
        .map(({ name, count, place, note }) =>
          group.kind === 'place' ? { name, count, place, note } : { name, count, note },
        ),
    })),
  };
}

/** The copy's file name, with the day: "mpmb-web-lager-2026-11-16.json". */
export function lagerFileName(now = new Date()): string {
  // The local day, not UTC's: a copy saved after midnight in Germany is the new day's.
  const day = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((part) => String(part).padStart(2, '0'));
  return `mpmb-web-lager-${day.join('-')}.json`;
}
