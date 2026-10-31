import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// Cross-origin isolation: the engine worker waits for the answer to a pop-up with Atomics.wait on
// shared memory, which browsers only allow on isolated pages. The live site sends the same headers
// from public/.htaccess.
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

/**
 * The live site's Content Security Policy, read from public/.htaccess so `pnpm preview` tests the same
 * one. Not in `pnpm dev`: Vite's dev server needs more (its own live-reload connection).
 */
function sitePolicy(): string {
  const htaccess = readFileSync(new URL('./public/.htaccess', import.meta.url), 'utf8');
  // The quoted value after the header's name: from `Header always set Content-Security-Policy "a; b"`
  // it takes `a; b`. Try it: https://regex101.com/?regex=Content-Security-Policy%20%22(%5B%5E%22%5D%2B)%22&testString=Header%20always%20set%20Content-Security-Policy%20%22default-src%20%27self%27%22
  const policy = /Content-Security-Policy "([^"]+)"/.exec(htaccess)?.[1];
  if (!policy) throw new Error('public/.htaccess has no Content-Security-Policy header');
  return policy;
}

// The commit the build comes from, shown and linked on the start page (src/version.ts).
function git(...args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  define: {
    __MPMB_WEB_COMMIT__: JSON.stringify(git('rev-parse', 'HEAD')),
    __MPMB_WEB_COMMIT_DATE__: JSON.stringify(git('show', '-s', '--format=%cs', 'HEAD')),
  },
  // Relative asset paths: the app is served from a subfolder of the owner's website,
  // and the exact folder name shouldn't be baked into the build.
  base: './',
  plugins: [svelte()],
  server: { headers: ISOLATION_HEADERS },
  preview: { headers: { ...ISOLATION_HEADERS, 'Content-Security-Policy': sitePolicy() } },
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
