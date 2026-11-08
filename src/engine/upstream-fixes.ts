// Bugs in MPMB's own scripts that Acrobat has too, mended in the realm after the scripts have loaded, so
// MPMB's files stay unchanged and a new upstream release drops in (see the private repo's docs/upstream.md).
// Each fix rewrites one function's source and loads it again in its place. An edit runs only while its faulty
// text is still there: once MPMB fixes a bug, its edit here does nothing.

import type { Realm } from './realm.ts';

export interface UpstreamEdit {
  /** The faulty text; global, so every place is mended. */
  find: RegExp;
  replace: string;
}

export interface UpstreamFix {
  /** The global function the bugs are in. */
  name: string;
  edits: readonly UpstreamEdit[];
}

export const UPSTREAM_FIXES: readonly UpstreamFix[] = [
  {
    // v24.2.0, Functions2.js, the function that fills a Wild Shape form.
    name: 'ApplyWildshape',
    edits: [
      {
        // The loop that writes the form's traits reads `pop` where it means its loop variable `prop`, so every
        // form with a trait, action or feature throws "pop is not defined" there: the Traits box stays empty and
        // MPMB's progress bar never closes. `\bpop\.` matches only the misspelt reads ("pop.name"), never
        // "prop.name" or "arr.pop()". Try it:
        // https://regex101.com/?regex=%5Cbpop%5C.&flags=g&testString=pop.name%20prop.name%20arr.pop()
        find: /\bpop\./g,
        replace: 'prop.',
      },
      {
        // Passive Perception reads the form's Perception from "P6.WSfront.Wildshape.1Skills.Perc" (the dot after
        // the form's number is missing), a field that doesn't exist, so every form shows 10.
        find: /fldBase \+ "Skills\.Perc"/g,
        replace: 'fldBase + ".Skills.Perc"',
      },
    ],
  },
];

/** Applies the fixes whose faulty text is still in the loaded scripts; returns the names of those it applied. */
export function applyUpstreamFixes(realm: Realm, fixes: readonly UpstreamFix[] = UPSTREAM_FIXES): string[] {
  const applied: string[] = [];
  for (const fix of fixes) {
    const fn = realm.global[fix.name];
    if (typeof fn !== 'function') continue;
    const source = Function.prototype.toString.call(fn);
    // replace() starts a global RegExp from the beginning each time, so the edits can share their RegExps.
    const mended = fix.edits.reduce((text, edit) => text.replace(edit.find, edit.replace), source);
    if (mended === source) continue;
    // A function declaration evaluated in the realm's global scope replaces the global of that name, and the
    // field scripts look the function up by name each time they run, so they get the mended one.
    realm.evaluate(mended, `upstream-fix ${fix.name}`);
    applied.push(fix.name);
  }
  return applied;
}
