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

// Empty for now. The last two (v24.2.0, ApplyWildshape: `pop.` for `prop.`, and the Perception field name without
// its dot) were fixed upstream in 6e52aba (2026-11-09) and dropped with that update. The next slip goes here.
export const UPSTREAM_FIXES: readonly UpstreamFix[] = [];

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
