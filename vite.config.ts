import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// Cross-origin isolation: the engine worker waits for the answer to a pop-up with Atomics.wait on
// shared memory, which browsers only allow on isolated pages. The live site sends the same headers
// from public/.htaccess.
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
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
