// The Build screen's class rows and the text they become in MPMB's "Class and Levels" field. MPMB reads
// that field itself (its own matching of class and subclass names), so the app only writes what MPMB's
// Class Selection dialog would write: "Paladin (Oath of Devotion) 8, Warlock (Fiend Patron) 2".
import type { ClassInfo, KnownClass } from '../engine/builder.ts';

export interface ClassRow {
  key: string;
  /** ClassSubList key, or empty for none (yet). */
  subclass: string;
  level: number;
}

/** A character has at most 20 levels, across all classes. */
export const MAX_LEVEL = 20;

export const rowsOf = (known: KnownClass[]): ClassRow[] =>
  known.map(({ key, subclass, level }) => ({ key, subclass, level }));

export const totalLevel = (rows: ClassRow[]): number => rows.reduce((sum, row) => sum + row.level, 0);

/** "Paladin (Oath of Devotion)", or "Paladin" without a subclass; the key itself for a class MPMB lost. */
export function className(row: Pick<ClassRow, 'key' | 'subclass'>, catalog: ClassInfo[]): string {
  const info = catalog.filter((c) => c.key === row.key)[0];
  if (!info) return row.key;
  const sub = info.subclasses.filter((s) => s.key === row.subclass)[0];
  return sub ? `${info.name} (${sub.name})` : info.name;
}

/** The text for MPMB's class field; rows without a level are left out (MPMB drops them too). */
export const classFieldText = (rows: ClassRow[], catalog: ClassInfo[]): string =>
  rows
    .filter((row) => row.level > 0)
    .map((row) => `${className(row, catalog)} ${row.level}`)
    .join(', ');

/** The rows with one class's level changed, kept between 1 and what the total of 20 leaves. */
export function setLevel(rows: ClassRow[], index: number, level: number): ClassRow[] {
  const others = totalLevel(rows) - (rows[index]?.level ?? 0);
  const allowed = Math.max(1, Math.min(level, MAX_LEVEL - others));
  return rows.map((row, i) => (i === index ? { ...row, level: allowed } : row));
}

/** A new class at level 1 (multiclassing), unless the character has it already or is at level 20. */
export function addClass(rows: ClassRow[], key: string): ClassRow[] {
  if (rows.some((row) => row.key === key) || totalLevel(rows) >= MAX_LEVEL) return rows;
  return [...rows, { key, subclass: '', level: 1 }];
}

export const setClass = (rows: ClassRow[], index: number, key: string): ClassRow[] =>
  rows.map((row, i) => (i === index ? { key, subclass: '', level: row.level } : row));

export const setSubclass = (rows: ClassRow[], index: number, subclass: string): ClassRow[] =>
  rows.map((row, i) => (i === index ? { ...row, subclass } : row));

export const removeClass = (rows: ClassRow[], index: number): ClassRow[] => rows.filter((_, i) => i !== index);

/** Where the next level starts in MPMB's experience table (index 1 is level 2), or null at level 20. */
export const nextLevelXp = (level: number, table: number[]): number | null =>
  level >= MAX_LEVEL ? null : (table[level] ?? null);

const ABILITY_NAMES: Record<string, string> = {
  strength: 'Str',
  dexterity: 'Dex',
  constitution: 'Con',
  intelligence: 'Int',
  wisdom: 'Wis',
  charisma: 'Cha',
};

/**
 * Pairs like "Strength 13" in MPMB's prerequisite text: matches "Strength 13", "Charisma 13".
 * Try it: https://regex101.com/?regex=(%5Ba-z%5D%2B)%5Cs%2B(%5Cd%2B)&flags=gi&testString=Strength%2013%20or%20Dexterity%2013
 */
const PREREQ = /([a-z]+)\s+(\d+)/gi;

/**
 * Whether ability scores (by MPMB's field names, "Str") meet a multiclass prerequisite as MPMB words it:
 * "Strength 13 and Charisma 13" needs both, "Strength 13 or Dexterity 13" one. Null when the text names no
 * score (an add-on's own wording): the app can't tell, MPMB's own checks still apply.
 */
export function meetsPrereqs(text: string, scores: Record<string, number | null>): boolean | null {
  const needs = [...text.matchAll(PREREQ)]
    .map(([, name, score]) => ({ field: ABILITY_NAMES[(name ?? '').toLowerCase()], score: Number(score) }))
    .filter((need): need is { field: string; score: number } => need.field !== undefined);
  if (!needs.length) return null;
  const met = needs.map((need) => (scores[need.field] ?? 0) >= need.score);
  return /\bor\b/i.test(text) ? met.some(Boolean) : met.every(Boolean);
}
