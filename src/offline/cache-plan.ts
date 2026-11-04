// What the service worker keeps for offline use, and under which name. Pure, so the build (which writes
// the list into the service worker) and the service worker itself share it, and tests can check it.

/**
 * Every cache of this app starts with this. Caches belong to the whole site (remph.de), not to the app's
 * folder, so the prefix keeps the clean-up away from anything else the site might cache one day.
 */
export const CACHE_PREFIX = 'mpmb-web-';

/** The cache of one build: a new build gets a new cache, and the old one goes when the new one takes over. */
export const cacheName = (buildId: string): string => `${CACHE_PREFIX}${buildId}`;

/** A cache an older build of this app left behind (not the current one, and not someone else's). */
export const isOldCache = (name: string, current: string): boolean => name.startsWith(CACHE_PREFIX) && name !== current;

/**
 * How long a page load waits for the network before it takes the copy from the cache. Without network
 * the request fails at once; with a wifi that has no internet behind it (a hotel, a train) it can hang
 * for a minute. A few seconds keep a slow line on the newest version and still open the app quickly.
 */
export const PAGE_WAIT_MS = 4000;

/**
 * Which of the built files (paths relative to the build folder, with `/`) the service worker stores on
 * install, sorted so the same build always gives the same list:
 * - not `.htaccess` (the server's settings, never sent) and not the service worker itself;
 * - not `.woff` fonts: every browser that can run a service worker reads the `.woff2` next to them;
 * - not source maps, should a build ever make them.
 */
export function precacheFiles(paths: readonly string[]): string[] {
  return paths
    .filter((path) => path.split('/').pop() !== '.htaccess' && path !== SERVICE_WORKER)
    .filter((path) => !path.endsWith('.woff') && !path.endsWith('.map'))
    .sort();
}

/** The service worker's file, next to index.html. Its name never changes, so browsers can find updates. */
export const SERVICE_WORKER = 'sw.js';

/** Bytes as lowercase hex, as Node's `digest('hex')` writes them, so the build and the worker compare alike. */
export const hex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
