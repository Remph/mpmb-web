// Sync between two devices in a real browser (M15, mock A): two browser contexts, each with its own storage, as
// a laptop and an iPad of the same player, on a stand-in for the sync service (test/fake-sync.ts) that Playwright
// answers in place of https://sync.remph.de. The real service's own tests are in server/sync.test.ts, the app
// against it in test/sync-real.test.ts.
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { FakeSync } from '../test/fake-sync.ts';

/** Loading MPMB's scripts on a blank sheet takes a while in a fresh browser. */
const STARTUP = 120_000;
const CODE = 'orbit-hazard-melt-ripple';
const NO_CONTENT = 204;
/** A change goes out within the sync's pace (5 s) plus a moment. */
const SYNCED = 20_000;

/** Answers the app's calls to the sync service from `service`, with the headers the real one sends (CORS, CORP). */
async function routeSync(context: BrowserContext, service: FakeSync): Promise<void> {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  };
  await context.route('https://sync.remph.de/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: NO_CONTENT, headers });
      return;
    }
    const { status, body } = service.handle(request.method(), request.url(), request.headers(), request.postDataJSON());
    await route.fulfill({
      status,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: status === NO_CONTENT ? '' : JSON.stringify(body),
    });
  });
}

/** Types the code on the start page and names the device. */
async function connect(page: Page, name: string): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Type your code' }).click();
  const window = page.getByRole('dialog', { name: 'Sync with your code' });
  await window.getByRole('textbox', { name: 'Your code' }).fill(CODE.replaceAll('-', ' '));
  await window.getByRole('textbox', { name: 'This device’s name, shown to your other devices' }).fill(name);
  await window.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('Connected as Anna: your characters are syncing.')).toBeVisible();
}

test('a character made on the laptop shows on the iPad, read only while open there, then taken over', async ({
  browser,
}) => {
  const service = new FakeSync();
  service.addPlayer('Anna', CODE);
  const laptopContext = await browser.newContext();
  const ipadContext = await browser.newContext();
  await routeSync(laptopContext, service);
  await routeSync(ipadContext, service);
  const laptop = await laptopContext.newPage();
  const ipad = await ipadContext.newPage();
  const errors: string[] = [];
  laptop.on('pageerror', (error) => errors.push(`laptop: ${error.message}`));
  ipad.on('pageerror', (error) => errors.push(`ipad: ${error.message}`));
  await Promise.all(
    [laptop, ipad].map((page) => {
      const changesAlert = page.getByRole('dialog', { name: 'Changes alert' });
      return page.addLocatorHandler(changesAlert, async () => {
        await changesAlert.getByRole('button', { name: 'Close', exact: true }).last().click();
      });
    }),
  );

  // The laptop: the code, a new character, a note; the top bar says Synced once it went out.
  await connect(laptop, 'Laptop');
  await expect(laptop.getByRole('heading', { name: 'Synced with your code' })).toBeVisible();
  await laptop.getByRole('button', { name: 'New character' }).click();
  await laptop
    .getByRole('dialog', { name: 'Source selection' })
    .getByRole('button', { name: 'Apply' })
    .click({ timeout: STARTUP });
  await laptop.getByRole('link', { name: 'Done: to the play view' }).click({ timeout: STARTUP });
  await laptop.getByRole('tab', { name: 'Notes' }).click();
  const laptopNotes = laptop.getByRole('textbox', { name: 'Notes', exact: true });
  await laptopNotes.fill('From the laptop');
  await laptopNotes.blur();
  await expect(laptop.getByText('✓ Synced', { exact: true })).toBeVisible({ timeout: SYNCED });

  // The iPad: the code brings the character; open on the laptop, it asks, and Read only shows the laptop's note.
  await connect(ipad, 'iPad');
  const card = ipad.locator('.characters li').first();
  await expect(card).toContainText('open on Laptop');
  await card.locator('a.card').click();
  const asked = ipad.getByRole('dialog', { name: 'Open on Laptop' });
  await asked.getByRole('button', { name: 'Read only' }).click();
  /**
   * The line under the top bar, whatever the time: "Open on Laptop since 18:42: read only here." matches,
   * "Open on iPad since 18:42: read only here." doesn't.
   * Try it: https://regex101.com/?regex=%5EOpen%20on%20Laptop%20since%20.*%3A%20read%20only%20here%5C.%24&testString=Open%20on%20Laptop%20since%2018%3A42%3A%20read%20only%20here.
   */
  const readOnlyLine = /^Open on Laptop since .*: read only here\.$/;
  await expect(ipad.getByText(readOnlyLine)).toBeVisible({ timeout: STARTUP });
  await expect(ipad.getByText('Read only', { exact: true })).toBeVisible();
  await ipad.getByRole('tab', { name: 'Notes' }).click();
  const ipadNotes = ipad.getByRole('textbox', { name: 'Notes', exact: true });
  await expect(ipadNotes).toHaveValue('From the laptop');
  await expect(ipadNotes).toBeDisabled();

  // Take over: the iPad changes it, and the laptop, back on its list, finds it open on the iPad.
  await ipad.getByRole('button', { name: 'Take over' }).click();
  await ipad.getByRole('tab', { name: 'Notes' }).click({ timeout: STARTUP });
  await expect(ipadNotes).toBeEnabled({ timeout: STARTUP });
  await ipadNotes.fill('From the iPad');
  await ipadNotes.blur();
  await expect(ipad.getByText('✓ Synced', { exact: true })).toBeVisible({ timeout: SYNCED });

  await laptop.getByRole('link', { name: '← Characters' }).click();
  await laptop.locator('.characters a.card').first().click();
  await laptop.getByRole('dialog', { name: 'Open on iPad' }).getByRole('button', { name: 'Read only' }).click();
  await laptop.getByRole('tab', { name: 'Notes' }).click({ timeout: STARTUP });
  await expect(laptopNotes).toHaveValue('From the iPad', { timeout: STARTUP });
  expect(errors).toEqual([]);
  await laptopContext.close();
  await ipadContext.close();
});

test('with auto sync off, a change stays on this device until Sync now sends it', async ({ browser }) => {
  const service = new FakeSync();
  service.addPlayer('Anna', CODE);
  const context = await browser.newContext();
  await routeSync(context, service);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const changesAlert = page.getByRole('dialog', { name: 'Changes alert' });
  await page.addLocatorHandler(changesAlert, async () => {
    await changesAlert.getByRole('button', { name: 'Close', exact: true }).last().click();
  });
  const puts = (): number => service.log.filter((line) => line.startsWith('PUT')).length;

  await connect(page, 'PC');
  await page.getByRole('button', { name: 'New character' }).click();
  await page
    .getByRole('dialog', { name: 'Source selection' })
    .getByRole('button', { name: 'Apply' })
    .click({ timeout: STARTUP });
  await page.getByRole('link', { name: 'Done: to the play view' }).click({ timeout: STARTUP });
  await expect(page.getByText('✓ Synced', { exact: true })).toBeVisible({ timeout: SYNCED });

  // The switch off; a try-out on the sheet says it is saved on this device only, and nothing goes out.
  await page.getByRole('link', { name: '← Characters' }).click();
  const auto = page.getByRole('switch', { name: 'Sync automatically' });
  await auto.click();
  await expect(auto).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('heading', { name: 'Syncs when you say so' })).toBeVisible();
  const sent = puts();
  await page.locator('.characters a.card').first().click();
  await page.getByRole('tab', { name: 'Notes' }).click({ timeout: STARTUP });
  const notes = page.getByRole('textbox', { name: 'Notes', exact: true });
  await notes.fill('A try-out');
  await notes.blur();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible({ timeout: SYNCED });
  await page.getByRole('link', { name: '← Characters' }).click();
  await expect(page.locator('.characters li').first()).toContainText('only on this device so far');
  await expect(page.getByText(/^1 character changed here/)).toBeVisible();

  // Sync now, keeping it here: still nothing out. Then sending it.
  const syncNow = page.getByRole('button', { name: 'Sync now' });
  const window = page.getByRole('dialog', { name: 'Sync now' });
  await syncNow.click();
  await window.getByRole('combobox').selectOption('keep');
  await window.getByRole('button', { name: 'Sync now' }).click();
  await expect(window).toBeHidden();
  await expect(page.getByText(/^1 character changed here · last sync/)).toBeVisible();
  expect(puts()).toBe(sent);
  await syncNow.click();
  await window.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.locator('.characters li').first()).toContainText('☁ synced');
  expect(puts()).toBe(sent + 1);

  // Back on: nothing waits, so no question; it syncs by itself again.
  await auto.click();
  await expect(auto).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('heading', { name: 'Synced with your code' })).toBeVisible({ timeout: SYNCED });
  await expect(syncNow).toBeHidden();
  expect(errors).toEqual([]);
  await context.close();
});
