// Another open document for MPMB's "Import from another sheet" (`DirectImport`). In Acrobat the import
// opens the old PDF with `app.openDoc` and reads it while it runs: its fields, but also its own scripts'
// globals and functions (`docFrom.CurrentVars`, `docFrom.What(...)`). So the old document must run its
// own version of MPMB's scripts, in a realm of its own: in the app another worker, in the tests another vm
// context.
//
// The two sides talk in small JSON requests, answered at once (`SourceLink`): the importing side asks,
// the source side looks it up in its realm and answers. Plain data (strings, numbers, arrays and objects
// of them) travels as a copy; anything else (functions, Field objects, objects holding functions) stays
// on the source side and travels as a numbered reference, which the importing side wraps in a Proxy.

import type { RealmTools } from './realm.ts';

/** JSON data. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** A value on the wire: plain data, undefined, or a reference to a source-side object or function. */
export type WireValue = { data: Json } | { undefined: true } | { ref: number; callable: boolean };

/** Reference 0 is the source document itself (the global object of its realm, as in Acrobat). */
export const DOCUMENT_REF = 0;

export type SourceRequest =
  | { op: 'get'; ref: number; key: string }
  | { op: 'set'; ref: number; key: string; value: WireValue }
  | { op: 'delete'; ref: number; key: string }
  | { op: 'has'; ref: number; key: string }
  | { op: 'keys'; ref: number }
  | { op: 'call'; ref: number; self: WireValue; args: WireValue[] };

export type SourceReply = { value: WireValue } | { error: string };

/** Sends a request to the source side and returns its answer (synchronously: the scripts wait). */
export type SourceLink = (request: SourceRequest) => SourceReply;

/** More nodes than this and an object travels as a reference instead (MPMB's big lists, for example). */
const MAX_COPY_NODES = 20_000;

/**
 * Whether a value can travel as a JSON copy: only plain objects and arrays (made by the realm's Object
 * or Array, no getters), strings, finite numbers, booleans and null, and no cycles.
 */
function isPlainData(value: unknown): boolean {
  const seen = new Set<object>();
  const visit = (v: unknown): boolean => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
    if (typeof v === 'number') return Number.isFinite(v);
    if (typeof v !== 'object' || seen.has(v) || seen.size > MAX_COPY_NODES) return false;
    seen.add(v);
    const proto: unknown = Object.getPrototypeOf(v);
    // A plain object's prototype is its realm's Object.prototype, whose own prototype is null.
    const plain = Array.isArray(v) || proto === null || Object.getPrototypeOf(proto) === null;
    if (!plain) return false;
    // A getter (Acrobat's case-blind `info.title`, for one) would be lost in a copy.
    return Object.values(Object.getOwnPropertyDescriptors(v)).every((d) => 'value' in d && visit(d.value));
  };
  return visit(value);
}

/**
 * The source side: answers requests about the objects of one realm. `doc` is what the importing side gets
 * from `app.openDoc` (the source engine's global object).
 */
export function serveDocument(doc: object): SourceLink {
  const refs: unknown[] = [doc];
  const index = new Map<unknown, number>([[doc, DOCUMENT_REF]]);
  const toWire = (value: unknown): WireValue => {
    if (value === undefined) return { undefined: true };
    if (isPlainData(value)) return { data: JSON.parse(JSON.stringify(value)) as Json };
    let ref = index.get(value);
    if (ref === undefined) {
      ref = refs.push(value) - 1;
      index.set(value, ref);
    }
    return { ref, callable: typeof value === 'function' };
  };
  const fromWire = (wire: WireValue): unknown => {
    if ('ref' in wire) return refs[wire.ref];
    return 'data' in wire ? wire.data : undefined;
  };
  const target = (ref: number): Record<string, unknown> => refs[ref] as Record<string, unknown>;
  const handlers: { [Op in SourceRequest['op']]: (request: Extract<SourceRequest, { op: Op }>) => unknown } = {
    get: (r) => target(r.ref)[r.key],
    // Reflect: a property the scripts can't change (a `var` global can't be deleted) answers false, as in
    // the sloppy-mode scripts, instead of throwing as this strict-mode module would.
    set: (r) => Reflect.set(target(r.ref), r.key, fromWire(r.value)),
    delete: (r) => Reflect.deleteProperty(target(r.ref), r.key),
    has: (r) => r.key in target(r.ref),
    keys: (r) => Object.keys(target(r.ref)),
    call: (r) => (refs[r.ref] as (...a: unknown[]) => unknown).apply(fromWire(r.self), r.args.map(fromWire)),
  };
  const answer = (request: SourceRequest): unknown => (handlers[request.op] as (r: SourceRequest) => unknown)(request);
  return (request) => {
    try {
      return { value: toWire(answer(request)) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  };
}

/**
 * The importing side: the source document as an object of this realm. Reading a property asks the source
 * side; plain data comes back as a copy made in this realm, everything else as another Proxy.
 */
export function sourceDocument(tools: RealmTools, link: SourceLink): object {
  const RealmError = tools.realm.global.Error as ErrorConstructor;
  const proxies = new Map<number, object>();
  const refOf = new WeakMap<object, number>();

  const ask = (request: SourceRequest): unknown => {
    const reply = link(request);
    if ('error' in reply) throw new RealmError(reply.error);
    return fromWire(reply.value);
  };
  const toWire = (value: unknown): WireValue => {
    if (value === undefined) return { undefined: true };
    const ref = typeof value === 'object' || typeof value === 'function' ? refOf.get(value as object) : undefined;
    if (ref !== undefined) return { ref, callable: typeof value === 'function' };
    if (typeof value === 'function') throw new RealmError('A function can not be handed to the other document');
    return { data: JSON.parse(JSON.stringify(value)) as Json };
  };
  const fromWire = (wire: WireValue): unknown => {
    if ('data' in wire) return tools.copy(wire.data);
    if ('undefined' in wire) return undefined;
    return proxyFor(wire.ref, wire.callable);
  };
  // Symbols (Symbol.toPrimitive, Symbol.iterator, ...) never cross over: the realm then falls back to
  // toString and valueOf, which do.
  const key = (k: string | symbol): string | null => (typeof k === 'string' ? k : null);
  function proxyFor(ref: number, callable: boolean): object {
    const known = proxies.get(ref);
    if (known) return known;
    // A function target makes the Proxy callable; an object target keeps typeof "object".
    const shell: object = callable ? function () {} : {};
    const proxy = new Proxy(shell, {
      get: (_, k) => (key(k) === null ? undefined : ask({ op: 'get', ref, key: k as string })),
      set: (_, k, value) => {
        if (key(k) !== null) ask({ op: 'set', ref, key: k as string, value: toWire(value) });
        return true;
      },
      deleteProperty: (_, k) => key(k) === null || Boolean(ask({ op: 'delete', ref, key: k as string })),
      has: (_, k) => key(k) !== null && Boolean(ask({ op: 'has', ref, key: k as string })),
      ownKeys: () => [...(ask({ op: 'keys', ref }) as string[]), ...(callable ? ['prototype'] : [])],
      // for...in asks for each key's descriptor; every key the source lists is enumerable there.
      getOwnPropertyDescriptor: (_, k) =>
        k === 'prototype' && callable
          ? Reflect.getOwnPropertyDescriptor(shell, k)
          : {
              value: key(k) === null ? undefined : ask({ op: 'get', ref, key: k as string }),
              enumerable: true,
              configurable: true,
              writable: true,
            },
      apply: (_, self, args: unknown[]) => ask({ op: 'call', ref, self: toWire(self), args: args.map(toWire) }),
    });
    proxies.set(ref, proxy);
    refOf.set(proxy, ref);
    return proxy;
  }
  return proxyFor(DOCUMENT_REF, false);
}
