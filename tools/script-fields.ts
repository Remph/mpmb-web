// The field names MPMB's scripts spell out in full (`What("Proficiency Bonus")`), checked against a
// blank sheet. MPMB writes the scripts and the PDF together: between two releases the scripts on GitHub
// may already use fields that only the next PDF has. Copying such scripts onto the old sheet data would
// break quietly (the engine counts a missing field, the player sees nothing happen), so the update tool
// and a test list the names the sheet lacks.

export interface NamedScript {
  readonly name: string;
  readonly code: string;
}

// A call that takes a field name as its first argument: MPMB's helpers (`What`, `Value`, `Hide`, ...)
// and Acrobat's `getField`. Only a plain string literal counts, in double or single quotes (the class
// lists write `What('Wis Mod')`); names built at run time ("Text." + x) can't be checked without running
// the code. Matches `Value("HP Max", 5)`, `getField("Race")` and `How('Proficiency Bonus')` (group 2 is
// the name); rejects `What("Text." + x)`, `Value(name)` and `getField('" + name + ".1')`.
// Try it: https://regex101.com/?regex=%5Cb(%3F%3AWhat%7CValue%7CgetField%7CHide%7CShow%7CHow)%5C(%5Cs*(%5B%22%27%5D)(%5B%5E%22%27%5C%5C%5D%2B)%5C1%5Cs*%5B%2C)%5D&testString=Value(%22HP+Max%22,+5);+tDoc.getField(%22Race%22).value;+How(%27Proficiency+Bonus%27);+What(%22Text.%22+%2B+x);+getField(%27%22+%2B+name+%2B+%22.1%27)
// prettier-ignore
const FIELD_CALL = /\b(?:What|Value|getField|Hide|Show|DontPrint|ReadOnly|Editable|AddTooltip|Who|How|Checkbox)\(\s*(["'])([^"'\\]+)\1\s*[,)]/g;

/** Every field name the scripts spell out, with the scripts that use it. */
export function scriptFieldNames(scripts: readonly NamedScript[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  scripts
    .flatMap(({ name, code }) => [...code.matchAll(FIELD_CALL)].map((m) => [m[2] as string, name] as const))
    .forEach(([field, script]) => {
      const users = out.get(field) ?? [];
      if (!users.includes(script)) out.set(field, [...users, script]);
    });
  return out;
}

/** "a.b.c" -> "a", "a.b", "a.b.c": Acrobat's getField also takes the first parts of a dotted name. */
const namePrefixes = (name: string): string[] => name.split('.').map((_, i, parts) => parts.slice(0, i + 1).join('.'));

/**
 * The names a sheet has no field for. A first part of a dotted name ("Limited Feature" for all the
 * "Limited Feature.*" fields) is a field group in Acrobat, so it counts as known.
 */
export function unknownFields(scripts: readonly NamedScript[], fieldNames: Iterable<string>): Map<string, string[]> {
  const known = new Set([...fieldNames].flatMap(namePrefixes));
  return new Map([...scriptFieldNames(scripts)].filter(([field]) => !known.has(field)));
}
