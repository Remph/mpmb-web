// The browser smoke test (`pnpm e2e`): the built app in Firefox, the group's browser, as `pnpm preview`
// serves it (with the live site's headers). Browsers once: `pnpm exec playwright install firefox`.
import { defineConfig, devices } from '@playwright/test';

/** Not the 4173 of a `pnpm preview` you may have running yourself. */
const PORT = 4183;

export default defineConfig({
  testDir: 'e2e',
  // One character at a time: the engine is slow to start, and the test reads like a walkthrough.
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}/`, locale: 'en-US', viewport: { width: 1440, height: 900 } },
  projects: [{ name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    // The test build also offers the current sheet as this older version (src/sheet-versions.ts), so the
    // update of a character saved on an older sheet can be tested before MPMB releases a new one.
    env: { VITE_TEST_OLD_VERSION: '24.1.0' },
    timeout: 180_000,
  },
});
