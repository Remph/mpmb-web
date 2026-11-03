// The "Spells" Build step's own logic (M7): the player's picks per spell source while they aren't on the
// sheet yet, what changed, and which spells the add list shows. What MPMB offers comes from its own spell
// dialogs (engine/spells.ts).
import type { SpellInfo, SpellPicks, SpellSource, SpellsInfo } from '../engine/spells.ts';

/** One source's picks on the step, before "Update spell sheet". */
export interface SpellDraft {
  cantrips: string[];
  spells: string[];
  /** "What spells to show?" (MPMB's radio button number), 0 when the source has none. */
  show: number;
}

export const draftOf = (source: SpellSource): SpellDraft => ({
  cantrips: [...(source.cantrips?.chosen ?? [])],
  spells: [...(source.spells?.chosen ?? [])],
  show: source.show,
});

/** Whether the player picks this source's spells here: cantrips, spells known or a spellbook. */
export const pickable = (source: SpellSource): boolean =>
  source.cantrips !== null || (source.spells !== null && source.type !== 'list');

const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every((key) => b.includes(key));

/** Spells added and removed, and a changed "on the spell sheet", over all sources. */
export function changeCount(info: SpellsInfo, drafts: Record<string, SpellDraft>): number {
  return info.sources.reduce((total, source) => {
    const draft = drafts[source.key];
    if (!draft) return total;
    const was = draftOf(source);
    const diff = (now: string[], before: string[]) =>
      now.filter((k) => !before.includes(k)).length + before.filter((k) => !now.includes(k)).length;
    return (
      total + diff(draft.cantrips, was.cantrips) + diff(draft.spells, was.spells) + (draft.show !== was.show ? 1 : 0)
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

/** Where the add list looks: the cantrips, or one spell level of the spells ("higher" = above maxLevel). */
export type AddFilter = { part: 'cantrips' } | { part: 'spells'; level: number | 'higher' };

/** The filters the add list offers for a source: cantrips, each level it can cast, and higher if listed. */
export function filtersOf(source: SpellSource, spells: Record<string, SpellInfo>): AddFilter[] {
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
): { key: string; part: 'cantrips' | 'spells' }[] {
  const words = query.trim().toLowerCase();
  const entries = [
    ...(source.cantrips?.list ?? []).map((key) => ({ key, part: 'cantrips' as const })),
    ...(source.type === 'list' ? [] : (source.spells?.list ?? [])).map((key) => ({ key, part: 'spells' as const })),
  ].filter((e) => spells[e.key]);
  const top = source.maxLevel || Number.MAX_SAFE_INTEGER;
  const fits = (e: { key: string; part: 'cantrips' | 'spells' }): boolean => {
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
