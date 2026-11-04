// Offline use: after one visit online, the service worker (src/offline/sw.ts) has stored the app, so it
// opens again without network, still cross-origin isolated (the engine's pop-ups need it), and can start
// a new character, which loads the 5 MB engine from the stored copy.
import { expect, test, type Page } from '@playwright/test';

const STARTUP = 120_000;

// Strings, not functions: this file is type-checked with Node's types, which have no `navigator`.
/** True once a service worker serves the page, which it does only after storing every file. */
const SERVED_BY_WORKER = 'navigator.serviceWorker.controller !== null';
/** Shared memory for the engine's pop-ups works only on an isolated page. */
const ISOLATED = 'crossOriginIsolated';

async function newFighter(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New character' }).click();
  await page
    .getByRole('dialog', { name: 'Source selection' })
    .getByRole('button', { name: 'Apply' })
    .click({ timeout: STARTUP });
  const rail = page.getByRole('navigation', { name: 'Steps' });
  await expect(rail).toBeVisible({ timeout: STARTUP });
  await page.getByRole('button', { name: 'Choose a class' }).click();
  // The class list's button starting with "Fighter" ("Fighter (SRD)"), not "Eldritch Knight (Fighter)".
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Fighter/ })
    .click();
  // The rail's step whose name contains "Class & level" ("Class & level Fighter 1"), not "Abilities".
  await expect(rail.getByRole('button', { name: /Class & level/ })).toContainText('Fighter 1');
}

test('after one visit the app opens and makes a new character without network', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const changesAlert = page.getByRole('dialog', { name: 'Changes alert' });
  await page.addLocatorHandler(changesAlert, async () => {
    await changesAlert.getByRole('button', { name: 'Close', exact: true }).last().click();
  });

  await page.goto('./');
  await expect(page.getByRole('button', { name: 'New character' })).toBeVisible();
  await page.waitForFunction(SERVED_BY_WORKER, null, { timeout: STARTUP });

  await context.setOffline(true);

  // A reload: the page comes from the stored copy, with its isolation headers.
  await page.reload();
  await expect(page.getByRole('button', { name: 'New character' })).toBeVisible();
  expect(await page.evaluate(ISOLATED)).toBe(true);

  // The first sheet of this page: the engine was never loaded online, so it comes from the stored copy.
  await newFighter(page);

  // A new tab, as when the app is opened again later.
  const again = await context.newPage();
  await again.goto('./');
  await expect(again.getByText('Fighter 1').first()).toBeVisible();
  expect(await again.evaluate(ISOLATED)).toBe(true);

  expect(errors).toEqual([]);
});
