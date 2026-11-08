// Bugs in MPMB's own scripts that Acrobat has too, mended in the realm after the scripts have loaded, so
// MPMB's files stay unchanged and a new upstream release drops in (see the private repo's docs/upstream.md).
// Each fix rewrites one function's source and loads it again in its place. It runs only while the faulty
// text is still there: once MPMB fixes a bug, its fix here does nothing.

import type { Realm } from './realm.ts';

export interface UpstreamFix {
  /** The global function the bug is in. */
  name: string;
  /** The faulty text; global, so every place is mended. */
  find: RegExp;
  replace: string;
}

export const UPSTREAM_FIXES: readonly UpstreamFix[] = [
  {
    // v24.2.0, Functions2.js: the loop that writes a Wild Shape's traits reads `pop` where it means its loop
    // variable `prop`, so every form with a trait, action or feature throws "pop is not defined" there: the
    // form's Traits box stays empty and MPMB's progress bar never closes. `\bpop\.` matches only the misspelt
    // reads ("pop.name"), never "prop.name" or "arr.pop()". Try it:
    // https://regex101.com/?regex=%5Cbpop%5C.&flags=g&testString=pop.name%20prop.name%20arr.pop()
    name: 'ApplyWildshape',
    find: /\bpop\./g,
    replace: 'prop.',
  },
];

/** Applies the fixes whose faulty text is still in the loaded scripts; returns the names of those it applied. */
export function applyUpstreamFixes(realm: Realm, fixes: readonly UpstreamFix[] = UPSTREAM_FIXES): string[] {
  const applied: string[] = [];
  for (const fix of fixes) {
    const fn = realm.global[fix.name];
    if (typeof fn !== 'function') continue;
    const source = Function.prototype.toString.call(fn);
    // A RegExp with the g flag keeps its lastIndex between test() calls; replace() below starts afresh.
    fix.find.lastIndex = 0;
    if (!fix.find.test(source)) continue;
    // A function declaration evaluated in the realm's global scope replaces the global of that name, and the
    // field scripts look the function up by name each time they run, so they get the mended one.
    realm.evaluate(source.replace(fix.find, fix.replace), `upstream-fix ${fix.name}`);
    applied.push(fix.name);
  }
  return applied;
}
