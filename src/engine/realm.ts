// The JavaScript realm that runs MPMB's scripts: the worker's global scope in the app, a Node vm
// context in the tests. Acrobat makes the document the global object (`var tDoc = this;`), so the
// stand-in installs the document API onto the realm's global object.
//
// MPMB adds methods to the realm's built-in prototypes (its own `Array.prototype.find`, for example),
// so arrays and objects that the stand-in hands to the scripts must be made in that realm. The helpers
// below do that; in the worker they cost a copy, in the tests they make the vm behave like the worker.

export interface Realm {
  readonly global: Record<string, unknown>;
  /** Runs code in the realm's global scope (an indirect eval), so `var` declarations become globals. */
  evaluate(code: string, filename?: string): unknown;
}

export interface RealmTools {
  realm: Realm;
  /** A copy of plain data (arrays, objects, strings, numbers, booleans, null) made in the realm. */
  copy<T>(value: T): T;
  /** A shallow array made in the realm. */
  array<T>(items: readonly T[]): T[];
  /** A plain object made in the realm, with these properties. */
  object<T extends object>(props: T): T;
}

export function realmTools(realm: Realm): RealmTools {
  const parse = realm.evaluate('JSON.parse') as (s: string) => unknown;
  const RealmArray = realm.global.Array as ArrayConstructor;
  const RealmObject = realm.global.Object as ObjectConstructor;
  return {
    realm,
    copy: <T>(value: T): T => (value === undefined ? value : (parse(JSON.stringify(value)) as T)),
    array: <T>(items: readonly T[]): T[] => RealmArray.from(items),
    object: <T extends object>(props: T): T => RealmObject.assign(new RealmObject(), props) as T,
  };
}

/** The realm of the code that calls it: the worker's global scope. */
export function currentRealm(): Realm {
  const global = globalThis as unknown as Record<string, unknown>;
  // Indirect eval runs in the global scope; the sourceURL names the script in error stacks.
  const indirectEval = eval;
  return {
    global,
    evaluate: (code, filename = 'eval') => indirectEval(`${code}\n//# sourceURL=${filename}`),
  };
}
