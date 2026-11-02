// A smoke test of the built app in a real browser: the start page, a new character built from scratch
// (class, armour, a weapon) and the play view showing what MPMB worked out. It catches what unit tests
// can't: the worker, the page's headers, the pop-ups and the routes working together.
import { expect, test } from '@playwright/test';

/** Loading MPMB's scripts on a blank sheet takes a while in a fresh browser. */
const STARTUP = 120_000;

test('a new character gets a class, armour and a weapon, and the play view shows them', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('./');
  // MPMB's condition for this site: the start page says it isn't MPMB's.
  await expect(page.getByText('not affiliated with or endorsed by', { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: 'New character' }).click();
  // MPMB asks a new sheet which sources to use; the SRD is already in.
  const sources = page.getByRole('dialog', { name: 'Source selection' });
  await sources.getByRole('button', { name: 'Apply' }).click({ timeout: STARTUP });
  const rail = page.getByRole('navigation', { name: 'Steps' });
  // Creating a character starts the engine on a blank sheet: the slowest step.
  await expect(rail).toBeVisible({ timeout: STARTUP });

  // Class & level: a fighter, through MPMB's own class field.
  await page.getByRole('button', { name: 'Choose a class' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Fighter/ }).click();
  await expect(rail.getByRole('button', { name: /Class & level/ })).toContainText('Fighter 1');

  // Armour & weapons: chain mail gives AC 16, a longsword gets MPMB's to hit.
  await rail.getByRole('button', { name: /Armour & weapons/ }).click();
  await page.getByRole('button', { name: /No armour/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Chain Mail/ }).click();
  await expect(page.locator('.ac')).toContainText('16');
  await page.getByRole('button', { name: /Add a weapon/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Longsword/ }).click();
  const row = page.locator('.weapon').filter({ hasText: 'Longsword' });
  await expect(row.locator('.hit')).toHaveText(/^[+-]\d+$/);

  // The play view: the armour class and the attack.
  await page.getByRole('link', { name: 'Done: to the play view' }).click();
  await expect(page.locator('.attack').filter({ hasText: 'Longsword' })).toBeVisible();
  await expect(page.getByText('Armor class').locator('..')).toContainText('16');

  expect(errors).toEqual([]);
});
