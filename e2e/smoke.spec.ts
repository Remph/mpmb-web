// A smoke test of the built app in a real browser: the start page, new characters built from scratch
// (class, armour, a weapon; a wizard's spells), the play view showing what MPMB worked out, and the print sheet. It catches
// what unit tests can't: the worker, the page's headers, the pop-ups and the routes working together.
import { expect, test } from '@playwright/test';

/** Loading MPMB's scripts on a blank sheet takes a while in a fresh browser. */
const STARTUP = 120_000;

test('a new character gets a class, armour and a weapon, and the play view shows them', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // MPMB's reminder of what a change affected ("Changes alert") may come after any step: closed, as a
  // player would.
  const changesAlert = page.getByRole('dialog', { name: 'Changes alert' });
  await page.addLocatorHandler(changesAlert, async () => {
    await changesAlert.getByRole('button', { name: 'Close', exact: true }).last().click();
  });

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
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Fighter/ })
    .click();
  await expect(rail.getByRole('button', { name: /Class & level/ })).toContainText('Fighter 1');

  // Armour & weapons: chain mail gives AC 16, a longsword gets MPMB's to hit.
  await rail.getByRole('button', { name: /Armour & weapons/ }).click();
  await page.getByRole('button', { name: /No armour/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Chain Mail/ })
    .click();
  await expect(page.locator('.ac')).toContainText('16');
  await page
    .getByRole('button', { name: /Add a weapon/ })
    .first()
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Longsword/ })
    .click();
  const row = page.locator('.weapon').filter({ hasText: 'Longsword' });
  await expect(row.locator('.hit')).toHaveText(/^[+-]\d+$/);

  // The play view: the armour class and the attack.
  await page.getByRole('link', { name: 'Done: to the play view' }).click();
  await expect(page.locator('.attack').filter({ hasText: 'Longsword' })).toBeVisible();
  await expect(page.getByText('Armor class').locator('..')).toContainText('16');

  // Print (M10): the print window offers the parts this fighter has (no spells, no notes), and the print
  // sheet appears for the browser's print with the attack on it. window.print() itself would wait for a
  // dialog the test can't answer, so the test fires the browser's "beforeprint" the way printing does.
  await page.getByRole('button', { name: /Sheet menu/ }).click();
  await page.getByRole('button', { name: /^Print/ }).click();
  const printWindow = page.getByRole('dialog', { name: 'Print' });
  await expect(printWindow.getByRole('checkbox')).toHaveCount(5);
  await expect(printWindow).not.toContainText('Every spell');
  await printWindow.getByRole('button', { name: 'Cancel' }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  const sheet = page.locator('.print-sheet');
  await expect(sheet.locator('.attacks')).toContainText('Longsword');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(sheet).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('a new wizard chooses spells on the Build screen, and the Spells tab shows them', async ({ page }) => {
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
  const rail = page.getByRole('navigation', { name: 'Steps' });
  await expect(rail).toBeVisible({ timeout: STARTUP });
  await page.getByRole('button', { name: 'Choose a class' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Wizard/ })
    .click();
  await expect(rail.getByRole('button', { name: /Class & level/ })).toContainText('Wizard 1');

  // The Spells step: what MPMB's spell dialog offers, the add list next to it on a laptop.
  await rail.getByRole('button', { name: /^9 Spells/ }).click();
  const adder = page.locator('.adder');
  await adder.getByRole('button', { name: 'Cantrips' }).click();
  await adder.getByRole('button', { name: 'Add Fire Bolt' }).click();
  await adder.getByRole('button', { name: 'Level 1' }).click();
  await adder.getByRole('button', { name: 'Add Magic Missile' }).click();
  await expect(page.getByText('2 changes are not on the spell sheet yet.')).toBeVisible();

  // MPMB's own dialogs take the picks and make the spell sheet pages.
  await page.getByRole('button', { name: 'Update spell sheet' }).click();
  await expect(page.getByText('are not on the spell sheet yet')).toHaveCount(0, { timeout: STARTUP });
  await expect(rail.getByRole('button', { name: /Spells/ })).toContainText('Wizard');

  await page.getByRole('link', { name: 'Done: to the play view' }).click();
  await page.getByRole('tab', { name: 'Spells' }).click();
  await page.getByRole('button', { name: 'All spells', exact: true }).click();
  await expect(page.locator('.spell').filter({ hasText: 'Fire Bolt' }).first()).toBeVisible();
  await expect(page.locator('.spell').filter({ hasText: 'Magic Missile' }).first()).toBeVisible();

  expect(errors).toEqual([]);
});
