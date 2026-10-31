import { execFileSync } from 'node:child_process';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// Cross-origin isolation: the engine worker waits for the answer to a pop-up with Atomics.wait on
// shared memory, which browsers only allow on isolated pages. The live site sends the same headers
// from public/.htaccess.
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

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
  preview: { headers: ISOLATION_HEADERS },
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
