// MPMB's 27 document scripts, bundled from vendor/mpmb as text. Acrobat runs document-level scripts in
// name order; Engine.load sorts them the same way.
import type { SheetScript } from './engine.ts';

const files = import.meta.glob<string>('../../vendor/mpmb/{_functions,_variables}/*.js', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/**
 * "../../vendor/mpmb/_functions/Startup.js" -> "Startup": the script's name is its file name.
 * Try it: https://regex101.com/?regex=(%5B%5E%2F%5D%2B)%5C.js%24&testString=..%2F_functions%2FStartup.js
 */
const FILE_NAME = /([^/]+)\.js$/;

export const mpmbScripts: readonly SheetScript[] = Object.entries(files).map(([path, code]) => ({
  name: FILE_NAME.exec(path)?.[1] ?? path,
  code,
}));
