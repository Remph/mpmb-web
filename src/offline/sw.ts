// The service worker: keeps the app usable without network (Nick, 2026-11-04: "Build it").
//
// On install it stores every file of its own build in one cache (the list is written in by the build,
// tools/offline-plugin.ts). Then:
// - the page (index.html) comes from the network first, so a new version shows at once when online, and
//   from the cache only when the network fails or takes too long;
// - the build's other files come from the cache. Their names carry a content hash, so a cached file is
//   never out of date; a new build has new names and a new cache.
// Everything else (other sites, other folders of remph.de) is left to the browser.
//
// A new build's service worker takes over at once (skipWaiting) and removes the old cache. An old tab
// still open then fetches its own old files from the server, as it did before there was a service worker.
//
// The cached answers keep the server's headers, the isolation headers (COOP/COEP) included: without them
// the engine worker can't wait for pop-up answers (src/worker/channel.ts).
//
// Built on its own, as a classic script without imports (tools/offline-plugin.ts), and type-checked with
// the worker's types (tsconfig.sw.json), not the page's.
import { PAGE_WAIT_MS, cacheName, isOldCache } from './cache-plan.ts';

declare const self: ServiceWorkerGlobalScope;
/** The build's files, relative to this script (filled in by the build). */
declare const __OFFLINE_FILES__: string[];
/** A hash of those files' contents: a new build, a new cache (filled in by the build). */
declare const __OFFLINE_BUILD__: string;

const CACHE = cacheName(__OFFLINE_BUILD__);
const FILES = __OFFLINE_FILES__.map((file) => new URL(file, self.location.href).href);
const KNOWN = new Set(FILES);
const PAGE = new URL('index.html', self.location.href).href;
/**
 * The server sends `Vary: Accept-Encoding` with compressed files, and the browser sets that header
 * itself, out of the script's sight: matching on it could miss a file that is there.
 */
const MATCH: CacheQueryOptions = { ignoreVary: true };
/** HTTP status codes from here on are the server's failures (500 Internal Server Error and up). */
const SERVER_ERROR = 500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // 'no-cache' asks the server whether a file changed instead of trusting the browser's own copy,
      // which for the page and the icons could be from an older build.
      await cache.addAll(FILES.map((url) => new Request(url, { cache: 'no-cache' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => isOldCache(name, CACHE)).map((name) => caches.delete(name)));
      // Also serve the tab that installed this worker, so it keeps working if the network goes before
      // its first sheet loads the engine.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') event.respondWith(page(request));
  else if (KNOWN.has(request.url)) event.respondWith(file(request));
});

/** The page: the network's when it answers in time, else the stored one. */
async function page(request: Request): Promise<Response> {
  const network = fetch(request);
  try {
    const response = await within(network, PAGE_WAIT_MS);
    // A server error isn't a page; a stored one is better. A 404 or a redirect is the server's answer.
    if (response.status < SERVER_ERROR) return response;
  } catch {
    // No network, or too slow: the stored page below.
  }
  const stored = await (await caches.open(CACHE)).match(PAGE, MATCH);
  return stored ?? network;
}

/** One of the build's files: the stored one, or the network's should the cache have lost it. */
async function file(request: Request): Promise<Response> {
  const stored = await (await caches.open(CACHE)).match(request, MATCH);
  return stored ?? fetch(request);
}

/** The promise's result, or a rejection when it takes longer than `ms`. */
async function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  try {
    return await Promise.race([promise, late]);
  } finally {
    clearTimeout(timer);
  }
}
