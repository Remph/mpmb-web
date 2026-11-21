// Which build of the service is running (tech review 3, finding 09): `pnpm build:server` (server/build.ts) writes
// the commit and the build time into the bundle, and /health and /admin show them, so "is the new zip live?" is
// one look instead of a note about who uploaded what when. Outside the bundle (the tests, `node server/main.ts`)
// nothing is written in, and both stay empty.

// Filled in by esbuild's `define` (server/build.ts). `typeof` keeps an unbundled run from throwing on the name.
declare const __SYNC_COMMIT__: string | undefined;
declare const __SYNC_BUILT__: string | undefined;

export interface BuildInfo {
  /** The full commit hash the bundle was built from, with "-modified" when files differed from it; '' if unknown. */
  commit: string;
  /** When the bundle was built, as an ISO time in UTC; '' if unknown. */
  built: string;
}

export const BUILD: BuildInfo = {
  commit: typeof __SYNC_COMMIT__ === 'string' ? __SYNC_COMMIT__ : '',
  built: typeof __SYNC_BUILT__ === 'string' ? __SYNC_BUILT__ : '',
};
