// SpiderMonkey's `toSource()`, which only Acrobat's JavaScript engine has. MPMB stores objects as
// `toSource()` strings in form fields (often in `submitName`) and compares them, so the output must be
// stable and match what Acrobat wrote into existing sheets: `({a:1, 'b c':"x", d:[1, 2]})`.
//
// The methods go onto the prototypes of the realm that runs MPMB's scripts (the worker's global scope,
// or a Node vm context in the tests), which is why the constructors are passed in.

export interface RealmConstructors {
  Object: ObjectConstructor;
  Array: ArrayConstructor;
  Function: FunctionConstructor;
  Date: DateConstructor;
  RegExp: RegExpConstructor;
  String: StringConstructor;
  Number: NumberConstructor;
  Boolean: BooleanConstructor;
}

const ESCAPES: Record<string, string> = {
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\b': '\\b',
  '\f': '\\f',
  '\v': '\\v',
  '\\': '\\\\',
};
const HEX = 16;
const BYTE_HEX_DIGITS = 2;
const CHAR_HEX_DIGITS = 4;
const BYTE_MAX = 0xff;

/**
 * Characters that need escaping in a SpiderMonkey string literal: backslash, control characters,
 * quotes and anything outside printable ASCII. Matches "\n", "\"", "é"; leaves "a" and " ".
 * Try it: https://regex101.com/?regex=%5B%5C%5C%5Cn%5Cr%5Ct%5Cb%5Cf%5Cv%22'%5D%7C%5B%5E%5Cx20-%5Cx7e%5D&testString=caf%C3%A9%20%22x%22
 */
const NEEDS_ESCAPE = /[\\\n\r\t\b\f\v"']|[^\x20-\x7e]/g;

/** A string literal in `quote`, escaped the way SpiderMonkey does. */
export function quote(s: string, q: '"' | "'"): string {
  const body = s.replace(NEEDS_ESCAPE, (c) => {
    const known = ESCAPES[c];
    if (known) return known;
    if (c === q) return '\\' + c;
    if (c === '"' || c === "'") return c;
    const code = c.charCodeAt(0);
    const hex = code.toString(HEX).toUpperCase();
    return code <= BYTE_MAX ? '\\x' + hex.padStart(BYTE_HEX_DIGITS, '0') : '\\u' + hex.padStart(CHAR_HEX_DIGITS, '0');
  });
  return q + body + q;
}

/**
 * Property names that SpiderMonkey writes without quotes: "abc", "_x1"; not "b c" or "1a".
 * Try it: https://regex101.com/?regex=%5E%5BA-Za-z_%24%5D%5BA-Za-z0-9_%24%5D*%24&testString=b%20c
 */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const tagOf = (v: object): string => Object.prototype.toString.call(v);

/** The source text of any value, as SpiderMonkey's uneval() writes it (without the outer parentheses). */
export function sourceOf(v: unknown, seen: readonly object[] = []): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return quote(v, '"');
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  if (typeof v === 'boolean' || typeof v === 'undefined') return String(v);
  if (typeof v === 'function') return '(' + Function.prototype.toString.call(v) + ')';
  if (typeof v !== 'object') return String(v);
  // A cycle: SpiderMonkey writes sharp variables; MPMB never stores those, so a marker is enough.
  const at = seen.indexOf(v);
  if (at !== -1) return `#${at}#`;
  const inner = [...seen, v];
  // Cross-realm safe checks: the value may come from the scripts' realm.
  if (tagOf(v) === '[object Date]') return `(new Date(${(v as Date).getTime()}))`;
  if (tagOf(v) === '[object RegExp]') return String(v);
  if (Array.isArray(v)) {
    const items = Array.from({ length: v.length }, (_, i) => (i in v ? sourceOf(v[i], inner) : ''));
    return '[' + items.join(', ') + ']';
  }
  const record = v as Record<string, unknown>;
  const props = Object.keys(record).map(
    (k) => (IDENTIFIER.test(k) ? k : quote(k, "'")) + ':' + sourceOf(record[k], inner),
  );
  return '{' + props.join(', ') + '}';
}

export function installToSource(realm: RealmConstructors): void {
  const define = (proto: object, fn: (this: unknown) => string): void => {
    Object.defineProperty(proto, 'toSource', { value: fn, enumerable: false, writable: true, configurable: true });
  };
  // Objects get the wrapping parentheses SpiderMonkey adds at the top level only.
  define(realm.Object.prototype, function () {
    const s = sourceOf(this);
    return s.startsWith('{') ? '(' + s + ')' : s;
  });
  [realm.Array, realm.Function, realm.Date, realm.RegExp].forEach((ctor) =>
    define(ctor.prototype, function () {
      return sourceOf(this);
    }),
  );
  define(realm.String.prototype, function () {
    return quote(String(this), '"');
  });
  define(realm.Number.prototype, function () {
    return `(new Number(${Number(this)}))`;
  });
  define(realm.Boolean.prototype, function () {
    return `(new Boolean(${Boolean(this)}))`;
  });
}
