// M1 spike: bundles the PDF reader for the plain-HTML spike pages (they have no module resolution).
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'spike/web/dist',
    emptyOutDir: true,
    lib: { entry: 'spike/web/pdf-read.js', formats: ['es'], fileName: 'pdf-read' },
  },
});
