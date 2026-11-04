import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { cacheName, hex, isOldCache, precacheFiles } from './cache-plan.ts';

describe('precacheFiles', () => {
  it('keeps the page, the build and the icons, sorted', () => {
    expect(
      precacheFiles([
        'index.html',
        'assets/index-4u0E8DiQ.js',
        'assets/engine.worker-CEks2G-g.js',
        'assets/font-latin-400-normal-FfmJh7DR.woff2',
        'favicon.svg',
        'manifest.webmanifest',
        'icon-192.png',
      ]),
    ).toEqual([
      'assets/engine.worker-CEks2G-g.js',
      'assets/font-latin-400-normal-FfmJh7DR.woff2',
      'assets/index-4u0E8DiQ.js',
      'favicon.svg',
      'icon-192.png',
      'index.html',
      'manifest.webmanifest',
    ]);
  });

  it('leaves out the server settings, the service worker, old font formats and source maps', () => {
    expect(
      precacheFiles([
        '.htaccess',
        'sw.js',
        'assets/font-latin-400-normal-DPp7N0cD.woff',
        'assets/index-4u0E8DiQ.js.map',
        'index.html',
      ]),
    ).toEqual(['index.html']);
  });
});

describe('old caches', () => {
  const current = cacheName('abc123');

  it('are this app’s caches from other builds', () => {
    expect(isOldCache(cacheName('0ld0ld'), current)).toBe(true);
  });

  it('never include the current one or another app’s', () => {
    expect(isOldCache(current, current)).toBe(false);
    expect(isOldCache('photos-v2', current)).toBe(false);
  });
});

describe('hex', () => {
  it('writes a digest the way the build does (Node’s digest("hex")), so the page check compares alike', async () => {
    const page = new TextEncoder().encode('<!doctype html><title>MPMB Web</title>');
    const inWorker = hex(await crypto.subtle.digest('SHA-256', page));
    expect(inWorker).toBe(createHash('sha256').update(page).digest('hex'));
    expect(hex(new Uint8Array([0, 9, 255]).buffer)).toBe('0009ff');
  });
});
