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
 * Removes the globals from the scope and from the prototypes it inherits from (browsers put some on
 * the global object, some on WorkerGlobalScope.prototype). Returns those still reachable afterwards,
 * which should be none.
 */
export function lockDown(scope: object): string[] {
  const holders = prototypeChain(scope);
  REMOVED_GLOBALS.forEach((name) =>
    holders.filter((holder) => Object.hasOwn(holder, name)).forEach((holder) => removeFrom(holder, name)),
  );
  return REMOVED_GLOBALS.filter((name) => (scope as Record<string, unknown>)[name] !== undefined);
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
