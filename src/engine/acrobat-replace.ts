// Acrobat's JavaScript engine, an old SpiderMonkey, leaves a global RegExp's `lastIndex` alone in
// `String.prototype.replace`; today's engines set it back to 0 (ES5 and later). MPMB's scripts were
// made and tested in Acrobat, so its results depend on the old behaviour in places. Known one:
// removeSpellUpcasting (FunctionsSpells.js) tests each of a spell's descriptions with the same global
// RegExp, so after the first match the metric description is searched from the old position, isn't
// found, and keeps its "+1d6/SL" (Flaming Sphere and Wall of Fire from the evoker's Staff of the Magi,
// as Acrobat saved them in the reference PDF). Patched in the realm that runs MPMB's scripts, like
// toSource (to-source.ts).

export interface ReplaceRealm {
  String: StringConstructor;
  RegExp: RegExpConstructor;
}

export function installAcrobatReplace(realm: ReplaceRealm): void {
  const proto = realm.String.prototype;
  const replace = proto.replace;
  const RealmRegExp = realm.RegExp;
  Object.defineProperty(proto, 'replace', {
    value: function (this: string, pattern: unknown, replacement: unknown): string {
      const call = replace as (this: string, pattern: unknown, replacement: unknown) => string;
      if (!(pattern instanceof RealmRegExp) || !pattern.global) return call.call(this, pattern, replacement);
      const kept = pattern.lastIndex;
      try {
        return call.call(this, pattern, replacement);
      } finally {
        pattern.lastIndex = kept;
      }
    },
    enumerable: false,
    writable: true,
    configurable: true,
  });
}
