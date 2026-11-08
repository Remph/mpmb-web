// The "Spells" Build step's own logic (M7): the player's picks per spell source while they aren't on the
// sheet yet, what changed, and which spells the add list shows. What MPMB offers comes from its own spell
// dialogs (engine/spells.ts).
import { OWN_PREFIX } from '../engine/spells.ts';
import type {
  SpellInfo,
  SpellPicks,
  SpellSheetOptions,
  SpellSheetPicks,
  SpellSource,
  SpellsInfo,
} from '../engine/spells.ts';

/** One source's picks on the step, before "Update spell sheet". */
export interface SpellDraft {
  cantrips: string[];
  spells: string[];
  /** "What spells to show?" (MPMB's radio button number), 0 when the source has none. */
  show: number;
  /** The bonus spells in the dialog's order, '' where none is chosen. */
  bonus: string[];
  /** The spells for "Prepared spells only" (show 3). */
  prepared: string[];
  /** The player's own spells for this source (keys "own …"), as extra rows that count toward nothing. */
  own: string[];
}

/**
 * An own spell's row among the bonus rows, now or before: `own` counts and sends those, so a renamed own
 * spell isn't a bonus change as well.
 */
const ownRow = (now: string | undefined, before: string | undefined): boolean =>
  (now ?? '').startsWith(OWN_PREFIX) || (before ?? '').startsWith(OWN_PREFIX);

/** The source's own spells: the extra bonus rows that hold one (own-spells.ts). */
export const ownOf = (source: SpellSource): string[] =>
  source.bonus.filter((b) => b.extra && b.chosen.startsWith(OWN_PREFIX)).map((b) => b.chosen);

export const draftOf = (source: SpellSource): SpellDraft => ({
  cantrips: [...(source.cantrips?.chosen ?? [])],
  spells: [...(source.spells?.chosen ?? [])],
  show: source.show,
  bonus: source.bonus.map((b) => b.chosen),
  prepared: [...(source.prepared?.chosen ?? [])],
  own: ownOf(source),
});

/** MPMB's "What spells to show?" choice that puts only the prepared spells on the sheet. */
const PREPARED_ONLY = 3;

/** Whether the step shows the source's prepared spells to choose: "Prepared spells only" is on. */
export const preparing = (source: SpellSource, draft: SpellDraft): boolean =>
  source.prepared !== null && draft.show === PREPARED_ONLY;

/**
 * A bonus spell the player picks: a feature or item that offers more than one. Not the extra rows a
 * player added in Acrobat's dialog (MPMB keeps those in spCast.extraBo, which the step doesn't write).
 */
export const bonusPickable = (source: SpellSource, index: number): boolean =>
  !source.bonus[index]?.extra && (source.bonus[index]?.list.length ?? 0) > 1;

/**
 * The spells the source may prepare. MPMB offers a spellbook's spells up to the highest level the
 * character casts, so for a book they follow the spellbook on the step, not the one on the sheet:
 * a spell just added can be prepared before "Update spell sheet". Other sources keep MPMB's own list.
 */
export function toPrepare(source: SpellSource, draft: SpellDraft, spells: Record<string, SpellInfo>): string[] {
  if (!source.prepared) return [];
  if (source.type !== 'book') return source.prepared.list;
  const top = source.maxLevel || Number.MAX_SAFE_INTEGER;
  return draft.spells.filter((key) => {
    const level = spells[key]?.level ?? 0;
    return level >= 1 && level <= top;
  });
}

/**
 * The draft after the spellbook changed: a spell that left the book can't stay prepared (MPMB would drop
 * it without a word, and the step would still count it).
 */
export const withBook = (source: SpellSource, draft: SpellDraft): SpellDraft =>
  source.type === 'book' ? { ...draft, prepared: draft.prepared.filter((key) => draft.spells.includes(key)) } : draft;

/** Whether the player picks this source's spells here: cantrips, spells known or a spellbook. */
export const pickable = (source: SpellSource): boolean =>
  source.cantrips !== null || (source.spells !== null && source.type !== 'list');

/** Whether the step has an add list for the source: its own spells, or the spells to prepare. */
export const hasAddList = (source: SpellSource, draft: SpellDraft): boolean =>
  pickable(source) || preparing(source, draft);

const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every((key) => b.includes(key));

/** Spells added and removed, and a changed "on the spell sheet", over all sources. */
export function changeCount(info: SpellsInfo, drafts: Record<string, SpellDraft>): number {
  return info.sources.reduce((total, source) => {
    const draft = drafts[source.key];
    if (!draft) return total;
    const was = draftOf(source);
    const diff = (now: string[], before: string[]) =>
      now.filter((k) => !before.includes(k)).length + before.filter((k) => !now.includes(k)).length;
    const bonus = draft.bonus.filter((k, i) => k !== was.bonus[i] && !ownRow(k, was.bonus[i])).length;
    // Prepared picks count only while the step shows them ("Prepared spells only").
    const prepared = preparing(source, draft) ? diff(draft.prepared, was.prepared) : 0;
    return (
      total +
      diff(draft.cantrips, was.cantrips) +
      diff(draft.spells, was.spells) +
      (draft.show !== was.show ? 1 : 0) +
      bonus +
      prepared +
      diff(draft.own, was.own)
    );
  }, 0);
}

/** What goes to MPMB: only the sources and parts that changed, so the rest stays exactly as MPMB has it. */
export function picksOf(info: SpellsInfo, drafts: Record<string, SpellDraft>): SpellPicks[] {
  return info.sources.flatMap((source) => {
    const draft = drafts[source.key];
    if (!draft) return [];
    const was = draftOf(source);
    const picks: SpellPicks = { key: source.key };
    if (source.cantrips && !sameSet(draft.cantrips, was.cantrips)) picks.cantrips = draft.cantrips;
    if (source.spells && !sameSet(draft.spells, was.spells)) picks.spells = draft.spells;
    if (draft.show !== was.show) picks.show = draft.show;
    if (draft.bonus.some((k, i) => k !== was.bonus[i] && !ownRow(k, was.bonus[i]))) picks.bonus = draft.bonus;
    if (preparing(source, draft) && !sameSet(draft.prepared, was.prepared)) picks.prepared = draft.prepared;
    if (!sameSet(draft.own, was.own)) picks.own = draft.own;
    return Object.keys(picks).length > 1 ? [picks] : [];
  });
}

/** Adds the spell, or takes it out when it's in already. */
export const toggled = (keys: string[], key: string): string[] =>
  keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];

/** The spells by level, then by name; spells MPMB doesn't know (an add-on removed) last, as their keys. */
export function byLevel(keys: string[], spells: Record<string, SpellInfo>): { level: number; keys: string[] }[] {
  const level = (key: string) => spells[key]?.level ?? Number.MAX_SAFE_INTEGER;
  const name = (key: string) => spells[key]?.name ?? key;
  const sorted = [...keys].sort((a, b) => level(a) - level(b) || name(a).localeCompare(name(b)));
  return sorted.reduce<{ level: number; keys: string[] }[]>((groups, key) => {
    const last = groups[groups.length - 1];
    if (last && last.level === level(key)) last.keys.push(key);
    else groups.push({ level: level(key), keys: [key] });
    return groups;
  }, []);
}

/** The parts of a source the add list adds to. */
export type SpellListPart = 'cantrips' | 'spells' | 'prepared';

/**
 * Where the add list looks: the cantrips, one spell level of the spells ("higher" = above maxLevel), or one
 * level of the spells to prepare.
 */
export type AddFilter =
  { part: 'cantrips' } | { part: 'spells'; level: number | 'higher' } | { part: 'prepared'; level: number };

/**
 * The filters the add list offers for a source: cantrips, each level it can cast, and higher if listed; or,
 * to prepare, each level the prepared list has.
 */
export function filtersOf(
  source: SpellSource,
  spells: Record<string, SpellInfo>,
  mode: 'pick' | 'prepare' = 'pick',
  draft: SpellDraft = draftOf(source),
): AddFilter[] {
  if (mode === 'prepare') {
    const levels = [...new Set(toPrepare(source, draft, spells).map((k) => spells[k]?.level ?? 0))];
    return levels.sort((a, b) => a - b).map((level): AddFilter => ({ part: 'prepared', level }));
  }
  const out: AddFilter[] = source.cantrips ? [{ part: 'cantrips' }] : [];
  if (!source.spells || source.type === 'list') return out;
  const levels = source.spells.list.map((k) => spells[k]?.level ?? 0).filter((l) => l > 0);
  const top = source.maxLevel || Math.max(0, ...levels);
  const castable = Array.from({ length: top }, (_, i) => i + 1).filter((level) => levels.includes(level));
  return [
    ...out,
    ...castable.map((level): AddFilter => ({ part: 'spells', level })),
    ...(levels.some((l) => l > top) ? [{ part: 'spells', level: 'higher' } as AddFilter] : []),
  ];
}

/** The entries of the add list: the filter's spells, or with a search every spell of the source's lists. */
export function addList(
  source: SpellSource,
  filter: AddFilter,
  query: string,
  spells: Record<string, SpellInfo>,
  draft: SpellDraft = draftOf(source),
): { key: string; part: SpellListPart }[] {
  const words = query.trim().toLowerCase();
  // To prepare: only the prepared list. Otherwise the cantrips and the spells to choose from.
  const own = [
    ...(source.cantrips?.list ?? []).map((key) => ({ key, part: 'cantrips' as const })),
    ...(source.type === 'list' ? [] : (source.spells?.list ?? [])).map((key) => ({ key, part: 'spells' as const })),
  ];
  const prepare = toPrepare(source, draft, spells).map((key) => ({ key, part: 'prepared' as const }));
  const entries = (filter.part === 'prepared' ? prepare : own).filter((e) => spells[e.key]);
  const top = source.maxLevel || Number.MAX_SAFE_INTEGER;
  const fits = (e: { key: string; part: SpellListPart }): boolean => {
    if (words) return `${spells[e.key]?.name ?? ''} ${spells[e.key]?.school ?? ''}`.toLowerCase().includes(words);
    if (filter.part !== e.part) return false;
    if (filter.part === 'cantrips') return true;
    const level = spells[e.key]?.level ?? 0;
    return filter.level === 'higher' ? level > top : level === filter.level;
  };
  return entries
    .filter(fits)
    .sort(
      (a, b) =>
        (spells[a.key]?.level ?? 0) - (spells[b.key]?.level ?? 0) ||
        (spells[a.key]?.name ?? '').localeCompare(spells[b.key]?.name ?? ''),
    );
}

/** Whether a part still waits for picks (fewer than MPMB gives), is full, or has more than that. */
export function fillState(chosen: number, count: number): 'open' | 'full' | 'over' {
  if (chosen < count) return 'open';
  return chosen === count ? 'full' : 'over';
}

/**
 * MPMB's full spell text as paragraphs of plain and bold pieces: it marks headings inside the text with
 * three asterisks ("***Using a Higher-Level Spell Slot***. ") and words with two.
 */
export function textParts(full: string): { text: string; bold: boolean }[][] {
  // The marked piece and its asterisks, two or three. Try it:
  // https://regex101.com/?regex=(%5C*%7B2%2C3%7D)(.%2B%3F)%5C1&flags=g&testString=***Cantrip%20Upgrade***.%20The%20damage%20**increases**.
  const MARKED = /(\*{2,3})(.+?)\1/;
  return (
    full
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      // split() with the two groups gives [plain, asterisks, marked, plain, asterisks, marked, …].
      .map((line) =>
        line
          .split(MARKED)
          .map((text, i) => ({ text, bold: i % 3 === 2, asterisks: i % 3 === 1 }))
          .filter((part) => !part.asterisks && part.text)
          .map(({ text, bold }) => ({ text, bold })),
      )
  );
}

/** The order dialog's choices while the player changes them ("Spell sheet" on the step). */
export interface SheetDraft {
  included: string[];
  excluded: string[];
  options: SpellSheetOptions;
}

export const sheetDraftOf = (info: SpellsInfo): SheetDraft | null =>
  info.options ? { included: [...info.included], excluded: [...info.excluded], options: { ...info.options } } : null;

/** The order dialog's options in MPMB's order, for the step's check boxes. */
export const SHEET_OPTIONS: (keyof SpellSheetOptions)[] = [
  'amendSpellDescriptions',
  'allowSpellAdd',
  'useDependencies',
  'dashEmptyFields',
  'glossary',
];

/** A new order counts once; each source moved on or off the sheet and each option changed counts too. */
export function sheetChangeCount(info: SpellsInfo, draft: SheetDraft | null): number {
  const options = info.options;
  if (!draft || !options) return 0;
  const offNow = draft.excluded.filter((k) => !info.excluded.includes(k)).length;
  const backOn = info.excluded.filter((k) => !draft.excluded.includes(k)).length;
  const order = (keys: string[], other: string[]) => keys.filter((k) => other.includes(k)).join('|');
  const reordered = order(draft.included, info.included) !== order(info.included, draft.included) ? 1 : 0;
  return offNow + backOn + reordered + SHEET_OPTIONS.filter((k) => draft.options[k] !== options[k]).length;
}

/** What goes to MPMB's order dialog: null when nothing changed, so MPMB keeps what it has. */
export const sheetPicksOf = (info: SpellsInfo, draft: SheetDraft | null): SpellSheetPicks | null =>
  draft && sheetChangeCount(info, draft) > 0
    ? { included: draft.included, excluded: draft.excluded, options: draft.options }
    : null;

/** The list with the key one place up (-1) or down (+1). */
export function moved(keys: string[], key: string, by: -1 | 1): string[] {
  const from = keys.indexOf(key);
  const to = from + by;
  const other = keys[to];
  if (from < 0 || other === undefined) return keys;
  return keys.map((k, i) => (i === from ? other : i === to ? key : k));
}

/** On the sheet or off it: the key goes to the end of the other list. */
export function switched(draft: SheetDraft, key: string): SheetDraft {
  return draft.included.includes(key)
    ? { ...draft, included: draft.included.filter((k) => k !== key), excluded: [...draft.excluded, key] }
    : { ...draft, excluded: draft.excluded.filter((k) => k !== key), included: [...draft.included, key] };
}
