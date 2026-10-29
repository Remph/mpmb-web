// M1 spike: drive the page in headless Chromium and print the findings as JSON.
//   node run-browser.mjs [--upstream] [--no-coi]
import { createRequire } from 'node:module';
import { startServer } from './serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const scripts = process.argv.includes('--upstream') ? 'upstream' : 'pdf';
const coi = !process.argv.includes('--no-coi');

const { server, port } = await startServer({ coi });
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
page.on(
  'console',
  (m) => ['error', 'warning'].includes(m.type()) && console.log('console', m.type(), m.text().slice(0, 300)),
);
const thr = process.argv.find((a) => a.startsWith('--throttle='));
if (thr)
  await (
    await page.context().newCDPSession(page)
  ).send('Emulation.setCPUThrottlingRate', { rate: Number(thr.split('=')[1]) });
await page.goto(`http://127.0.0.1:${port}/web/index.html`);
await page.waitForFunction(() => window.runBlank);
const result = {
  coi,
  blank: await page.evaluate((s) => window.runBlank({ scripts: s }), scripts),
  openPaladin: await page.evaluate((s) => window.runOpen({ char: 'paladin.json', scripts: s }), scripts),
  importPaladin: await page.evaluate((s) => window.runImport({ scripts: s }), scripts),
  importWizard: await page.evaluate(
    (s) => window.runImport({ pdf: 'wizard10-evoker.pdf', char: 'wizard.json', scripts: s }),
    scripts,
  ),
  openWizard: await page.evaluate((s) => window.runOpen({ char: 'wizard.json', scripts: s }), scripts),
};
console.log(JSON.stringify(result, null, 1));
await browser.close();
server.close();
