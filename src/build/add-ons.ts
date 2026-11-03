// What the "Add-on scripts" window (M9, Nick picked it 2026-11-03) shows about a script without running
// it: the name MPMB knows it by, when it was added, and roughly what it adds to the lists. Also reads the
// scripts other characters in this browser carry, from their saved sheets.
import type { ScriptFile } from '../engine/add-ons.ts';

/**
 * The script's own name, as MPMB reads it in ImportUserScriptFile (`iFileName = "name.js"`); MPMB treats
 * two files with the same name (any case) as versions of one script. The regex is MPMB's own: it matches
 * `var iFileName = "Sea folk.js";` (giving "Sea folk.js") and not `var name = "Sea folk.js";`.
 * Try it: https://regex101.com/?regex=iFileName%20%3F%3D%20%3F(%22%7C%27)(.*%3F%5B%5E%5C%5C%5D)%5C1&testString=var%20iFileName%20%3D%20%22Sea%20folk.js%22%3B
 */
export function scriptName(text: string): string | null {
  const match = /iFileName ?= ?("|')(.*?[^\\])\1/.exec(text);
  return match?.[2]?.replace(/\\/g, '') ?? null;
}

/**
 * MPMB's name for a file: the date it was added, maybe a time, " - ", then the script's name. Matches
 * "2026/11/03 - Sea folk.js" and "2026/11/03 14:22 - no iFileName"; not "Sea folk.js".
 * Try it: https://regex101.com/?regex=%5E(%5Cd%7B4%7D)%5C%2F(%5Cd%5Cd)%5C%2F(%5Cd%5Cd)(%3F%3A%20%5Cd%5Cd%3A%5Cd%5Cd)%3F%20-%20(.*)%24&testString=2026%2F11%2F03%20-%20Sea%20folk.js
 */
const KEY = /^(\d{4})\/(\d\d)\/(\d\d)(?: \d\d:\d\d)? - (.*)$/;

/** The day the file was added, as 2026-11-03, or null when MPMB's name for it has no date. */
export function addedOn(key: string): string | null {
  const match = KEY.exec(key);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/** MPMB's name for the file without the date in front. */
export const fileTitle = (key: string): string => KEY.exec(key)?.[4] ?? key;

/** Whether two scripts are versions of one (MPMB replaces one with the other). */
export function sameScript(a: string, b: string): boolean {
  const one = scriptName(a);
  return one !== null && one.toLowerCase() === scriptName(b)?.toLowerCase();
}

export type AddKind =
  | 'classes'
  | 'subclasses'
  | 'species'
  | 'backgrounds'
  | 'feats'
  | 'spells'
  | 'items'
  | 'weapons'
  | 'armour'
  | 'creatures';

/** MPMB's lists (and its helper functions) by what they hold, in the order the window names them. */
const LISTS: [AddKind, string[]][] = [
  ['classes', ['ClassList']],
  ['subclasses', ['ClassSubList', 'AddSubClass']],
  ['species', ['RaceList']],
  ['backgrounds', ['BackgroundList']],
  ['feats', ['FeatsList']],
  ['spells', ['SpellsList']],
  ['items', ['MagicItemsList']],
  ['weapons', ['WeaponsList']],
  ['armour', ['ArmourList']],
  ['creatures', ['CreatureList']],
];

/**
 * The regex built below, for one list name. An entry being defined: `RaceList["sea folk"] =`, `RaceList.seafolk=` (minified files), or a call
 * `AddSubClass("paladin", "oath of zeal", {`. The key is what's counted, so a script that sets an entry
 * twice counts it once. Entries built in a loop or under a variable name aren't seen, so the counts are
 * what the script plainly defines, which is all the window claims.
 * Try it: https://regex101.com/?regex=%5Cb(RaceList%7CAddSubClass)(%3F%3A%5Cs*%5B%5B(%5D%5Cs*(%5B%22%27%5D)(%5B%5E%22%27%5D%2B)%5C2(%3F%3A%5Cs*%5C%5D%5Cs*%3D(%3F!%3D)%7C%5Cs*%2C%5Cs*(%5B%22%27%5D)(%5B%5E%22%27%5D%2B)%5C5)%7C%5C.(%5Cw%2B)%5Cs*%3D(%3F!%3D))&testString=RaceList%5B%22sea%20folk%22%5D%20%3D%20%7B%7D%3B%20RaceList.elf%3D%7B%7D%3B%20AddSubClass(%22paladin%22%2C%20%22zeal%22%2C%20%7B%7D)
 */
function definitions(text: string, name: string): Set<string> {
  const re = new RegExp(
    `\\b${name}(?:\\s*[[(]\\s*(["'])([^"']+)\\1(?:\\s*\\]\\s*=(?!=)|\\s*,\\s*(["'])([^"']+)\\3)|\\.(\\w+)\\s*=(?!=))`,
    'g',
  );
  // AddSubClass(class, subclass): both name the entry.
  const keys = Array.from(text.matchAll(re), (m) => (m[4] ? `${m[2]}/${m[4]}` : (m[2] ?? m[5] ?? '')));
  return new Set(keys.filter(Boolean).map((key) => key.toLowerCase()));
}

/** How many entries of each kind the script defines; kinds it adds nothing to are left out. */
export function scriptAdds(text: string): Partial<Record<AddKind, number>> {
  const adds: Partial<Record<AddKind, number>> = {};
  LISTS.forEach(([kind, names]) => {
    const count = names.reduce((sum, name) => sum + definitions(text, name).size, 0);
    if (count) adds[kind] = count;
  });
  return adds;
}

/** Acrobat's one-letter escapes in a `toSource()` string; any other escaped character stands for itself. */
const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };
const HEX = 16;

/**
 * A string literal in either quote with backslash escapes. Matches `"a \"b\""` and `'c'`; not `"open`.
 * Try it: https://regex101.com/?regex=%22(%3F%3A%5B%5E%22%5C%5C%5D%7C%5C%5C%5B%5Cs%5CS%5D)*%22%7C%27(%3F%3A%5B%5E%27%5C%5C%5D%7C%5C%5C%5B%5Cs%5CS%5D)*%27&testString=%22a%20%5C%22b%5C%22%22%20%27c%27
 */
const STRING = String.raw`"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'`;
/**
 * One `'key':"code"` pair and the comma after it (the last has none). Matches `'2026/11/03 - a.js':"x", `.
 * Try it: https://regex101.com/?regex=%5Cs*(%27(%3F%3A%5B%5E%27%5C%5C%5D%7C%5C%5C.)*%27)%5Cs*%3A%5Cs*(%22(%3F%3A%5B%5E%22%5C%5C%5D%7C%5C%5C.)*%22)%5Cs*(%3F%3A%2C%7C%24)&testString=%272026%2F11%2F03%20-%20a.js%27%3A%22x%22%2C%20
 */
const PAIR = new RegExp(String.raw`\s*(${STRING})\s*:\s*(${STRING})\s*(?:,|$)`, 'g');
/**
 * An escape in a string literal: `\xHH`, `\uHHHH` or a backslash and one character. Matches `\x41`,
 * `\u00e9`, `\n`; not a plain `x41`.
 * Try it: https://regex101.com/?regex=%5C%5C(x%5B0-9a-fA-F%5D%7B2%7D%7Cu%5B0-9a-fA-F%5D%7B4%7D%7C%5B%5Cs%5CS%5D)&testString=%5Cx41%20%5Cu00e9%20%5Cn
 */
const ESCAPE = /\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[\s\S])/g;
/**
 * The object literal `toSource()` wraps in parentheses. Matches `({...})` with any spaces; not `{...}`.
 * Try it: https://regex101.com/?regex=%5E%5Cs*%5C(%5Cs*%5C%7B(%5B%5Cs%5CS%5D*)%5C%7D%5Cs*%5C)%5Cs*%24&testString=(%7B%27a%27%3A%22b%22%7D)
 */
const WRAPPED = /^\s*\(\s*\{([\s\S]*)\}\s*\)\s*$/;

/** A string literal's text: quotes off, escapes resolved (`\x41` and `\u0041` are "A"). */
function unquote(literal: string): string {
  return literal
    .slice(1, -1)
    .replace(ESCAPE, (_, e: string) =>
      e.length > 1 ? String.fromCharCode(parseInt(e.slice(1), HEX)) : (ESCAPES[e] ?? e),
    );
}

/**
 * The files in a saved sheet's `User_Imported_Files.Stringified`: MPMB stores them with Acrobat's
 * `toSource()`, `({'2026/11/03 - a.js':"code", ...})`, quotes either way, `\xHH` and `\uHHHH` escapes.
 * Read as data, never run: the code belongs to another character and runs only in a sheet's worker.
 * Returns no files for anything that isn't exactly this shape.
 */
export function parseScriptFiles(stringified: string): ScriptFile[] {
  const body = WRAPPED.exec(stringified)?.[1];
  if (body === undefined) return [];
  const pairs = Array.from(body.matchAll(PAIR));
  // Every character must belong to a pair, or this isn't a list of files.
  const read = pairs.reduce((sum, m) => sum + m[0].length, 0);
  if (read !== body.length && body.trim() !== '') return [];
  return pairs.map((m) => ({ key: unquote(m[1] ?? "''"), text: unquote(m[2] ?? "''") }));
}
