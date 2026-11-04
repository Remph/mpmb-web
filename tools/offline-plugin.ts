// Builds the service worker (src/offline/sw.ts) after the app: it lists what the build wrote, then bundles
// the service worker on its own into `sw.js` next to index.html, with that list written in. So every new
// build of the app gets a service worker that stores exactly its own files, and nothing has to be kept
// by hand.
//
// Built separately because a service worker must be one classic script at a fixed address (sw.js),
// while the app's own build splits code into files with hashed names.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import type { Plugin } from 'vite';
import { SERVICE_WORKER, precacheFiles } from '../src/offline/cache-plan.ts';

/** How many hex digits of the content hash name a build's cache: enough to never repeat in practice. */
const BUILD_ID_LENGTH = 12;

/** Every file under `dir`, as paths relative to it with `/` (also on Windows). */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
}

/** A short hash of the files' names and contents: it changes whenever any stored file does. */
function buildId(dir: string, files: readonly string[]): string {
  return files
    .reduce(
      (hash, file) =>
        hash
          .update(file)
          .update('\0')
          .update(readFileSync(path.join(dir, file))),
      createHash('sha256'),
    )
    .digest('hex')
    .slice(0, BUILD_ID_LENGTH);
}

export function offline(): Plugin {
  let root = '';
  let outDir = '';
  return {
    name: 'mpmb-offline',
    // Only for `pnpm build`: the dev server has no service worker (src/offline/register.ts).
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      // A failed build leaves nothing worth storing.
      if (!existsSync(path.join(outDir, 'index.html'))) return;
      const files = precacheFiles(filesUnder(outDir));
      await build({
        configFile: false,
        root,
        logLevel: 'warn',
        define: {
          __OFFLINE_FILES__: JSON.stringify(files),
          __OFFLINE_BUILD__: JSON.stringify(buildId(outDir, files)),
        },
        build: {
          outDir,
          emptyOutDir: false,
          copyPublicDir: false,
          lib: {
            entry: path.join(root, 'src/offline/sw.ts'),
            formats: ['iife'],
            name: 'mpmbOffline',
            fileName: () => SERVICE_WORKER,
          },
        },
      });
    },
  };
}
