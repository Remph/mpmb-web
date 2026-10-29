// M1 spike: check the two test pages in headless Chromium against a local server that does or
// does not send the isolation headers (standing in for the host with and without a working .htaccess).
import { createRequire } from 'node:module';
import { startServer } from '../web/serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const rows = [];
for (const coi of [true, false]) {
  const { server, port } = await startServer({ coi });
  for (const variant of ['htaccess', 'serviceworker']) {
    const ctx = await browser.newContext(); // fresh: no service worker from the last run
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/coop-test/${variant}/index.html`);
    await page.waitForFunction(() => /PASS|FAIL/.test(document.getElementById('verdict').textContent), null, {
      timeout: 15000,
    });
    const verdict = await page.textContent('#verdict');
    const text = await page.textContent('#out');
    rows.push({ serverSendsHeaders: coi, page: variant, verdict, isolated: /crossOriginIsolated: true/.test(text) });
    if (process.argv.includes('-v')) console.log(text);
    await ctx.close();
  }
  server.close();
}
console.table(rows);
await browser.close();
