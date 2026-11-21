// `pnpm test:db`: the tests that need a real MySQL or MariaDB (server/README.md, "Tests"). `pnpm test` skips them
// when no database is named, so a check that forgets them stays green; this runs them with the README's local
// defaults (three empty databases on localhost, user mpmb, password mpmb-test). A TEST_* variable that is already
// set wins, so the deploy or another machine can point it elsewhere. A database that isn't there fails the run
// instead of skipping it. Extra arguments go on to Vitest (`pnpm test:db server/lager`).
// A script rather than `VAR=… vitest` in package.json: that form doesn't work in Windows' shells.
import { spawnSync } from 'node:child_process';

/** process.argv starts with node and the script path. */
const ARGS_START = 2;

const DEFAULTS = {
  TEST_DB_HOST: 'localhost',
  TEST_DB_USER: 'mpmb',
  TEST_DB_PASSWORD: 'mpmb-test',
  // One database per test file that wipes its tables, because Vitest runs the files side by side.
  TEST_DB_NAME: 'mpmb_test',
  TEST_LAGER_DB_NAME: 'mpmb_lager_test',
  TEST_APP_DB_NAME: 'mpmb_app_test',
} as const;

/** The files that hold the database tests: the service's own and the app's sync against the real service. */
const FILES = ['server', 'test/sync-real'];

const env: NodeJS.ProcessEnv = {
  ...process.env,
  ...Object.fromEntries(Object.entries(DEFAULTS).map(([name, value]) => [name, process.env[name] || value])),
};

const extra = process.argv.slice(ARGS_START);
const result = spawnSync('pnpm', ['exec', 'vitest', 'run', ...(extra.length ? extra : FILES)], {
  env,
  stdio: 'inherit',
  // pnpm is a .cmd file on Windows, which only a shell starts.
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
