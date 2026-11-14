// The house rule "double advantage and disadvantage" in a real browser (playtest 2026-11-14, note 8): with
// its homebrew switch on, the advantage window offers three d20 too, the roll shows two arrows, and the mark
// stays after a reload. The PDF's own boxes show plain advantage.
import { expect, test } from '@playwright/test';

/** Loading MPMB's scripts on a blank sheet takes a while in a fresh browser. */
const STARTUP = 120_000;

test('a skill marked with double advantage shows two arrows, also after a reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const changesAlert = page.getByRole('dialog', { name: 'Changes alert' });
  await page.addLocatorHandler(changesAlert, async () => {
    await changesAlert.getByRole('button', { name: 'Close', exact: true }).last().click();
  });

  await page.goto('./');
  await page.getByRole('button', { name: 'Homebrew rules' }).click();
  await page.getByRole('switch', { name: 'Double advantage and disadvantage' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await page.getByRole('button', { name: 'New character' }).click();
  await page
    .getByRole('dialog', { name: 'Source selection' })
    .getByRole('button', { name: 'Apply' })
    .click({ timeout: STARTUP });
  await page.getByRole('link', { name: 'Done: to the play view' }).click({ timeout: STARTUP });

  const stealth = page.locator('button.skill', { hasText: 'Stealth' });
  await stealth.click();
  const window = page.getByRole('dialog', { name: 'Stealth' });
  await expect(window.getByRole('button')).toHaveText([
    'Normal',
    '▲ Advantage',
    '▲▲ Double Advantagethree d20, keep the highest',
    '▼ Disadvantage',
    '▼▼ Double Disadvantagethree d20, keep the lowest',
    '',
  ]);
  await window.getByRole('button', { name: /Double Advantage/ }).click();
  await expect(stealth.locator('.edge')).toHaveText('▲▲');
  await expect(stealth.getByLabel('double advantage')).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator('button.skill', { hasText: 'Stealth' }).locator('.edge')).toHaveText('▲▲', {
    timeout: STARTUP,
  });
  // Plain advantage takes the double away; the window shows it as the one picked.
  await page.locator('button.skill', { hasText: 'Stealth' }).click();
  await expect(window.getByRole('button', { name: /Double Advantage/ })).toHaveAttribute('aria-pressed', 'true');
  await window.getByRole('button', { name: 'Advantage', exact: true }).click();
  await expect(page.locator('button.skill', { hasText: 'Stealth' }).locator('.edge')).toHaveText('▲');
  expect(errors).toEqual([]);
});
