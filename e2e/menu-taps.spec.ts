// A second tap on an item's ··· before its menu shows (playtest 2026-11-14, on the slower iPad): the menu
// opens once, and "Delete line" removes that one item. Before the fix the second tap opened the menu again
// right after the first was answered, and the second "Delete line" took the next item too.
import { expect, test } from '@playwright/test';

/** Loading MPMB's scripts on a blank sheet takes a while in a fresh browser. */
const STARTUP = 120_000;

test('two quick taps on an item menu open it once and delete one line', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const changesAlert = page.getByRole('dialog', { name: 'Changes alert' });
  await page.addLocatorHandler(changesAlert, async () => {
    await changesAlert.getByRole('button', { name: 'Close', exact: true }).last().click();
  });

  await page.goto('./');
  await page.getByRole('button', { name: 'New character' }).click();
  await page
    .getByRole('dialog', { name: 'Source selection' })
    .getByRole('button', { name: 'Apply' })
    .click({ timeout: STARTUP });
  await page.getByRole('link', { name: 'Done: to the play view' }).click({ timeout: STARTUP });
  await page.getByRole('tab', { name: 'Inventory' }).click();

  const items = page.getByRole('textbox', { name: 'Item name' });
  const add = page.getByRole('textbox', { name: 'Add an item …' });
  for (const [i, name] of ['Rope', 'Torch', 'Lantern'].entries()) {
    await add.fill(name);
    await add.press('Enter');
    await expect(items).toHaveCount(i + 1);
  }
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  // Both taps land before the worker has built the menu, as on the iPad.
  await page.getByRole('button', { name: 'Options for Rope' }).evaluate((button: { click: () => void }) => {
    button.click();
    button.click();
  });
  await page.getByRole('menuitem', { name: 'Delete line' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Delete line' })).toHaveCount(0);
  await expect(items).toHaveCount(2);
  expect(await items.evaluateAll((boxes) => boxes.map((box) => (box as unknown as { value: string }).value))).toEqual([
    'Torch',
    'Lantern',
  ]);
  expect(errors).toEqual([]);
});
