// Find Steed in a real browser (Remph picked "the page stays", 2026-11-07): "+ Companion" opens the window that
// lists what the sheet's lists offer, the app's SRD Otherworldly Steed fills a companion page through MPMB's own
// menu, at 0 HP it is gone, and casting the spell again brings it back at full hit points with its name.
import { expect, test } from '@playwright/test';

/** Loading MPMB's scripts on a blank sheet takes a while in a fresh browser. */
const STARTUP = 120_000;

test('a steed is summoned, disappears at 0 HP and comes back when cast again', async ({ page }) => {
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

  const window = page.getByRole('dialog', { name: 'Add a companion' });
  await page.getByRole('button', { name: /Sheet menu/ }).click();
  await page.getByRole('button', { name: /^Companion/ }).click();
  await expect(window.getByRole('group', { name: 'Steed (Find Steed spell)' })).toBeVisible({ timeout: STARTUP });
  await expect(window.getByRole('group', { name: 'Familiar (Find Familiar spell)' })).toBeVisible();
  await window.getByText('Otherworldly Steed', { exact: true }).click();
  // A new character has no spell slots: the spell's own level is the one to pick.
  await expect(
    window.getByRole('radiogroup', { name: 'Spell slot level' }).getByRole('radio', { name: '2', exact: true }),
  ).toBeChecked();
  await expect(window.getByText('AC 12 · HP 25 · Speed')).toBeVisible();
  await window.getByRole('button', { name: 'Add Otherworldly Steed' }).click();

  // MPMB asks which creature type the steed is.
  const question = page.getByRole('dialog').filter({ hasText: 'Celestial' });
  await question.getByText('Fey', { exact: true }).click();
  await question.getByRole('button', { name: 'OK' }).click();

  const bar = page.getByRole('navigation', { name: 'Character and companions' });
  await expect(bar).toContainText('Otherworldly Steed 25/25 HP', { timeout: STARTUP });
  await expect(page.getByRole('heading', { name: 'Otherworldly Steed' })).toBeVisible();
  await expect(page.getByText('Steed · Large Fey')).toBeVisible();

  await page.getByRole('button', { name: 'Damage', exact: true }).click();
  const pad = page.getByRole('dialog');
  await pad.getByRole('button', { name: '3', exact: true }).click();
  await pad.getByRole('button', { name: '0', exact: true }).click();
  await pad.locator('button.primary').click();
  await expect(bar).toContainText('Otherworldly Steed gone');
  await expect(page.getByText('Gone: it disappeared at 0 HP.')).toBeVisible();

  await page.getByRole('button', { name: 'Cast Find Steed again' }).click();
  const again = page.getByRole('dialog', { name: 'Cast Find Steed again' });
  await expect(again.getByRole('radio', { name: /Otherworldly Steed/ })).toBeChecked();
  await again.getByRole('button', { name: 'Summon (25 HP)' }).click();
  await question.getByText('Celestial', { exact: true }).click();
  await question.getByRole('button', { name: 'OK' }).click();
  await expect(bar).toContainText('Otherworldly Steed 25/25 HP', { timeout: STARTUP });
  await expect(page.getByText('Steed · Large Celestial')).toBeVisible();
  await expect(page.getByText('Otherworldly Slam')).toBeVisible();
  expect(errors).toEqual([]);
});
