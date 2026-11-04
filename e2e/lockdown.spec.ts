// The security boundary for add-on scripts, checked in a real browser (tech review 2026-11-04, finding 5).
// An add-on script runs in the engine worker with MPMB's own scripts. Two layers keep it from reading the
// saved characters and sending them anywhere: the worker removes the browser's network and storage before
// any sheet script runs (src/worker/lockdown.ts), and the Content Security Policy (public/.htaccess, which
// `pnpm preview` serves too) blocks loading code from another site with `import()`. The unit test of the
// lockdown runs on a stand-in scope; this one adds a probe script to a character, as a player would, and
// reads what it found from the character's name.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';

const STARTUP = 120_000;
/** HTTP's "OK". */
const OK = 200;

/**
 * What the probe tries. Each way out it finds open goes into the character's name; `import()` settles
 * later, so its result is added when it does and shows after the next change on the sheet.
 */
const probe = (moduleUrl: string): string => `var iFileName = "MPMB Web lockdown probe.js";
RequiredSheetVersion("24.0.0");
(function () {
  var scope = globalThis;
  var nav = scope.navigator || {};
  var open = [];
  ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches", "Worker",
    "SharedWorker", "BroadcastChannel"].forEach(function (name) {
    if (typeof scope[name] !== "undefined") open.push(name);
  });
  ["storage", "locks"].forEach(function (name) {
    if (typeof nav[name] !== "undefined") open.push("navigator." + name);
  });
  Value("PC Name", "Probe: " + (open.length ? "open " + open.join(" ") : "all blocked"));
  import(${JSON.stringify(moduleUrl)}).then(
    function () { Value("PC Name", What("PC Name") + ", import open"); },
    function () { Value("PC Name", What("PC Name") + ", import blocked"); }
  );
})();
`;

test('an add-on script finds no network, no storage and no way to load code from elsewhere', async ({ page }) => {
  // Another site for import(): a server on another port is another origin. It would serve the module (with
  // the headers COEP needs), so only the CSP can stop the import; it counts the requests that reach it.
  let asked = 0;
  const other = http.createServer((_request, response) => {
    asked++;
    response.writeHead(OK, {
      'Content-Type': 'text/javascript',
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    response.end('export default 1;');
  });
  await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve));
  const { port } = other.address() as AddressInfo;

  try {
    const changesAlert = page.getByRole('dialog', { name: 'Changes alert' });
    await page.addLocatorHandler(changesAlert, async () => {
      await changesAlert.getByRole('button', { name: 'Close', exact: true }).last().click();
    });

    await page.goto('./');
    await page.getByRole('button', { name: 'New character' }).click();
    const sources = page.getByRole('dialog', { name: 'Source selection' });
    await sources.getByRole('button', { name: 'Apply' }).click({ timeout: STARTUP });
    await page.getByRole('link', { name: 'Done: to the play view' }).click({ timeout: STARTUP });

    // The player's way: Sheet menu, Add-on scripts, a script file, Apply.
    await page.getByRole('button', { name: /Sheet menu/ }).click();
    await page.getByRole('button', { name: /Add-on scripts/ }).click();
    await page.locator('dialog[open] input[type=file]').setInputFiles({
      name: 'lockdown-probe.js',
      mimeType: 'text/javascript',
      buffer: Buffer.from(probe(`http://127.0.0.1:${port}/probe.js`)),
    });
    await page.locator('dialog[open]').getByRole('button', { name: 'Apply', exact: true }).click();
    // MPMB says the script was added, then shows its source selection again.
    const added = page.locator('dialog[open]').getByRole('button', { name: 'OK', exact: true });
    await added.click({ timeout: STARTUP });
    await sources.getByRole('button', { name: 'Apply' }).click({ timeout: STARTUP });

    const name = page.locator('.top h1');
    // The import's result may already be in (or not yet).
    await expect(name).toHaveText(/^Probe: all blocked(, import blocked)?$/);

    // Any change on the sheet reports what the scripts changed meanwhile: the import's result at the latest.
    await page.getByRole('tab', { name: 'Notes' }).click();
    await page.locator('#notes').fill('Checked.');
    await page.locator('#notes').blur();
    await expect(name).toHaveText('Probe: all blocked, import blocked');
    expect(asked).toBe(0);
  } finally {
    other.close();
  }
});
