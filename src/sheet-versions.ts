// The older versions of MPMB's sheet this app keeps (vendor/versions/<version>/), so that characters
// saved on them still open and can be updated. Each loads only when needed: its scripts and sheet data
// are a few MB, the same as the worker's own.
import type { SheetScript } from './engine/engine.ts';
import type { PackedSheet } from './engine/sheet-data.ts';
import type { SheetPack } from './engine/sheet-pack.ts';

const scriptFiles = import.meta.glob<string>('../vendor/versions/*/{_functions,_variables}/*.js', {
  query: '?raw',
  import: 'default',
});
const sheetFiles = import.meta.glob<PackedSheet>('../vendor/versions/*/colorful-a4.json', { import: 'default' });

/**
 * "../vendor/versions/24.2.0/_functions/Startup.js" -> ["24.2.0", "Startup"].
 * Try it: https://regex101.com/?regex=versions%2F(%5B%5E%2F%5D%2B)%2F(%3F%3A_functions%7C_variables%7C)%2F%3F(%5B%5E%2F%5D%2B)%5C.js(%3Fon)%3F%24&testString=..%2Fvendor%2Fversions%2F24.2.0%2F_functions%2FStartup.js
 */
const SCRIPT_PATH = /versions\/([^/]+)\/(?:_functions|_variables)\/([^/]+)\.js$/;
/** "../vendor/versions/24.2.0/colorful-a4.json" -> "24.2.0"; rejects a script's path. */
const SHEET_PATH = /versions\/([^/]+)\/colorful-a4\.json$/;

/**
 * A test build (`VITE_TEST_OLD_VERSION=24.1.0 pnpm build`) also offers the current sheet under that
 * version, so the browser tests can update a character without a real older release. Never set for the
 * site.
 */
const TEST_VERSION = import.meta.env.VITE_TEST_OLD_VERSION as string | undefined;

/** The kept versions, oldest first. */
export function keptVersions(): string[] {
  const kept = Object.keys(sheetFiles).flatMap((path) => SHEET_PATH.exec(path)?.[1] ?? []);
  return [...kept, ...(TEST_VERSION ? [TEST_VERSION] : [])];
}

/** The scripts and sheet data of a kept version; null for a version the app doesn't keep. */
export async function loadSheetPack(version: string): Promise<SheetPack | null> {
  if (TEST_VERSION && version === TEST_VERSION) return testPack(version);
  const sheet = Object.entries(sheetFiles).find(([path]) => SHEET_PATH.exec(path)?.[1] === version)?.[1];
  if (!sheet) return null;
  const scripts = await Promise.all(
    Object.entries(scriptFiles)
      .map(([path, load]) => ({ match: SCRIPT_PATH.exec(path), load }))
      .filter(({ match }) => match?.[1] === version)
      .map(async ({ match, load }): Promise<SheetScript> => ({ name: match?.[2] ?? '', code: await load() })),
  );
  return { version, scripts, sheet: await sheet() };
}

/** The current sheet under the test version: its document info says so, as an older PDF's would. */
async function testPack(version: string): Promise<SheetPack> {
  const [{ mpmbScripts }, sheet] = await Promise.all([
    import('./engine/scripts.ts'),
    import('./engine/data/colorful-a4.json').then((m) => m.default as unknown as PackedSheet),
  ]);
  return { version, scripts: [...mpmbScripts], sheet: { ...sheet, info: { ...sheet.info, SheetVersion: version } } };
}
