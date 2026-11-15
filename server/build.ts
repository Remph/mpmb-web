// Bundles the service into dist/app.cjs (`pnpm build:server`, run as `node server/build.ts`): one CommonJS file
// with its libraries inside, so the webspace needs no npm install and Passenger's require() loads it on any Node.
// Next to it, dist/LICENSES.txt holds the licence of every library that went into the bundle (MIT and Apache-2.0,
// both fine with the GPL): both ask that their notice travels with every copy.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const MODULES = 'node_modules/';
const SCOPE = '@';

/** "node_modules/.pnpm/mysql2@3.24.6/node_modules/mysql2/lib/x.js" -> its package folder (the last node_modules/…). */
function packageOf(input: string): string | null {
  const at = input.lastIndexOf(MODULES);
  if (at < 0) return null;
  const [first = '', second = ''] = input.slice(at + MODULES.length).split('/');
  const name = first.startsWith(SCOPE) ? `${first}/${second}` : first;
  return input.slice(0, at + MODULES.length) + name;
}

/** The licence text in a package folder (LICENSE, LICENSE.md, license…), or a note when it ships none. */
function licenceOf(folder: string): string {
  const file = readdirSync(folder).find((name) => name.toLowerCase().startsWith('licen'));
  return file ? readFileSync(join(folder, file), 'utf8').trim() : '(no licence file in the package)';
}

const result = await build({
  entryPoints: [join(here, 'main.ts')],
  outfile: join(here, 'dist/app.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Plesk offers several Node versions; this keeps the bundle loadable on old ones too.
  target: 'node18',
  legalComments: 'eof',
  metafile: true,
  logLevel: 'info',
});

const folders = [...new Set(Object.keys(result.metafile.inputs).map(packageOf))].filter((f): f is string => !!f);
const notices = folders.sort().map((folder) => {
  const { name, version, license } = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
    license?: string;
  };
  return `${name} ${version} (${license ?? 'see below'})\n\n${licenceOf(folder)}`;
});
const header =
  'Libraries bundled into app.cjs, MPMB Web sync service (GPL-3.0-or-later, source: github.com/Remph/mpmb-web)';
writeFileSync(join(here, 'dist/LICENSES.txt'), `${header}\n\n${notices.join('\n\n-----\n\n')}\n`);
console.log(`dist/LICENSES.txt: ${folders.length} libraries`);
