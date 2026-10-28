import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths: the app is served from a subfolder of nick-scherer.de,
  // and the exact folder name shouldn't be baked into the build.
  base: './',
  plugins: [svelte()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
