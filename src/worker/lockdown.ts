// What the scripts a sheet carries may not reach. A sheet's add-on scripts (homebrew pasted into MPMB's
// script dialog, or files imported with "Add Extra Materials") run in this worker with MPMB's own, and
// they run as soon as the sheet opens, the way Acrobat runs them. In Acrobat they stay inside the PDF;
// in a browser the worker could also read every saved character (IndexedDB is per site, not per
// sheet) and send them anywhere. The engine needs none of the browser's network or storage once it
// has loaded: the page sends the sheet and gets the fields back through postMessage. So the worker
// removes them before the first script runs.
//
// This is one of two layers. Code can still reach the network in ways no global covers (`import()`
// is syntax, not a property), which the Content Security Policy in public/.htaccess blocks.

/**
 * The worker's ways out: network, other workers, and the site's storage. FontFace and fonts load a
 * font from any address (the address can carry data); the engine draws nothing, so it needs neither.
 */
export const REMOVED_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'WebSocketStream',
  'WebTransport',
  'EventSource',
  'FontFace',
  'fonts',
  'importScripts',
  'Worker',
  'SharedWorker',
  'BroadcastChannel',
  'indexedDB',
  'caches',
] as const;

/**
 * What the worker's `navigator` offers beyond plain facts about the browser. `storage` holds the origin
 * private file system (`getDirectory()`): no network, but files there outlive the worker, so one sheet's
 * add-on script could leave something for the next character's scripts to read (tech review 2026-11-04,
 * finding 8). `locks` would let a script hold the page's per-character locks (see store/tab-lock.ts).
 */
export const REMOVED_FROM_NAVIGATOR = ['storage', 'locks'] as const;

/**
 * Removes the globals from the scope and from the prototypes it inherits from (browsers put some on
 * the global object, some on WorkerGlobalScope.prototype), and the same for `navigator`'s parts above.
 * Returns those still reachable afterwards ("navigator.storage" for a part of navigator), which should
 * be none.
 */
export function lockDown(scope: object): string[] {
  removeAll(scope, REMOVED_GLOBALS);
  const navigator = (scope as { navigator?: unknown }).navigator;
  const nav = typeof navigator === 'object' && navigator !== null ? navigator : null;
  if (nav) removeAll(nav, REMOVED_FROM_NAVIGATOR);
  return [
    ...REMOVED_GLOBALS.filter((name) => (scope as Record<string, unknown>)[name] !== undefined),
    ...(nav ? REMOVED_FROM_NAVIGATOR.filter((name) => (nav as Record<string, unknown>)[name] !== undefined) : []).map(
      (name) => `navigator.${name}`,
    ),
  ];
}

function removeAll(target: object, names: readonly string[]): void {
  const holders = prototypeChain(target);
  names.forEach((name) =>
    holders.filter((holder) => Object.hasOwn(holder, name)).forEach((holder) => removeFrom(holder, name)),
  );
}

/** The object and every prototype it inherits from, up to Object.prototype. */
function prototypeChain(start: object): object[] {
  const next = Object.getPrototypeOf(start) as object | null;
  return next ? [start, ...prototypeChain(next)] : [start];
}

function removeFrom(holder: object, name: string): void {
  if (Reflect.deleteProperty(holder, name)) return;
  // Not deletable: a property that can't be changed either stays, and lockDown reports it.
  try {
    Object.defineProperty(holder, name, { value: undefined, writable: false, configurable: false });
  } catch {
    /* reported by lockDown */
  }
}
