// The Effects card's switch in a real browser: taps that come faster than the page shows them (each one
// before the page has drawn the one before) still switch the effect on and off, and its AC bonus goes into
// the sheet once. Before the fix each such tap saw the switch as off and added the bonus again.
import { expect, test } from '@playwright/test';

/** Loading MPMB's scripts on a blank sheet takes a while in a fresh browser. */
const STARTUP = 120_000;

test('quick taps on an effect switch add its AC bonus once', async ({ page }) => {
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
  // A class first: without one the play view shows the way to the Build screen instead of the numbers.
  await page.getByRole('button', { name: 'Choose a class' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Fighter' }).first().click();
  await expect(rail.getByRole('button', { name: 'Class & level' })).toContainText('Fighter 1');
  // Chain mail: AC 16, whatever the scores.
  await rail.getByRole('button', { name: 'Armour & weapons' }).click();
  await page.getByRole('button', { name: 'No armour' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Chain Mail' }).first().click();
  await expect(page.locator('.ac')).toContainText('16');
  await page.getByRole('link', { name: 'Done: to the play view' }).click();

  const armorClass = page.getByText('Armor class').locator('..');
  await expect(armorClass).toContainText('16');
  const card = page.locator('section[aria-labelledby=effects-title]');
  await card.getByRole('button', { name: '+ Effect' }).click();
  const window = page.getByRole('dialog', { name: 'Effects' });
  await window.getByLabel('Name').fill('Made-up Stance');
  await window.getByRole('button', { name: 'AC bonus: Number: More' }).click();
  await window.getByRole('button', { name: 'AC bonus: Number: More' }).click();
  await window.getByRole('button', { name: 'Apply' }).click();

  const stance = card.getByRole('button', { name: 'Made-up Stance' });
  /**
   * Taps in one go, all before the page draws again: faster than a person, the surest way to get there. A
   * string, as in the other tests: the e2e tests are type-checked without the browser's DOM types.
   */
  const taps = (n: number): Promise<void> =>
    page.evaluate(
      `{ const b = document.querySelector('section[aria-labelledby=effects-title] .chip.switch');
         for (let i = 0; i < ${n}; i++) b.click(); }`,
    );
  // An odd number ends on, an even number where it started.
  const ODD = 3;
  const EVEN = 2;

  await taps(ODD);
  await expect(stance).toHaveAttribute('aria-pressed', 'true');
  await expect(armorClass).toContainText('18');
  await expect(page.locator('.top .status:not(.busy)')).toBeVisible();
  await expect(armorClass).toContainText('18');

  await taps(EVEN);
  await expect(page.locator('.top .status:not(.busy)')).toBeVisible();
  await expect(stance).toHaveAttribute('aria-pressed', 'true');
  await expect(armorClass).toContainText('18');

  await taps(1);
  await expect(stance).toHaveAttribute('aria-pressed', 'false');
  await expect(armorClass).toContainText('16');
  expect(errors).toEqual([]);
});
