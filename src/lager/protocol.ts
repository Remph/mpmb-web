// The Lager's protocol (M16): what the service (server/lager.ts) and the app (src/lager/lager.ts) send each other,
// and the limits the service enforces. Both import this one file, so a change on one side that the other doesn't
// follow is a type error, not a refusal at the table. No imports and nothing but types and constants: esbuild
// bundles it into the service as it is, and the service's type check (server/tsconfig.json) reads it too.

/** How a group shows its items: a place per item (magic items: in the Lager, with a character, gone) or a count. */
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
  /** When it changed last (ms since 1970), and who changed it ('' when that player has been removed). */
  updated: number;
  by: string;
}

/** The answer of GET /lager. */
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

/** One small change in POST /lager's `ops`. Counts and gold move by a difference, so two players' "+1" both count. */
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

/** Ops in one request: the app's import of a whole list sends a few hundred at once. */
const MAX_OPS = 1000;
const MAX_GROUPS = 50;
const MAX_ITEMS = 3000;
const GROUP_NAME_MAX = 80;
const ITEM_NAME_MAX = 200;
const PLACE_MAX = 80;
/** Item texts (a magic item's description) run to a few hundred words. */
const NOTE_MAX = 20_000;
const GOLD_NOTE_MAX = 200;
const COUNT_MAX = 1_000_000;
/** Gold in copper (1 gp = 100 cp, so "1234.5 gp" is exact); a trillion copper is plenty. */
const COPPER_MAX = 1_000_000_000_000;
/** As long as a character's id (crypto.randomUUID is 36). */
const ID_MAX = 64;

/** What the service refuses beyond, so the app never sends it. */
export const LAGER_LIMITS = {
  ops: MAX_OPS,
  groups: MAX_GROUPS,
  items: MAX_ITEMS,
  groupName: GROUP_NAME_MAX,
  itemName: ITEM_NAME_MAX,
  place: PLACE_MAX,
  note: NOTE_MAX,
  goldNote: GOLD_NOTE_MAX,
  count: COUNT_MAX,
  copper: COPPER_MAX,
  id: ID_MAX,
} as const;
