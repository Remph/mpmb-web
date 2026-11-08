// The house rule "background boosts anywhere" in a real browser: with its homebrew switch on, the Ability
// scores step puts a background's +2 and +1, or three +1, on abilities the background doesn't name, and MPMB
// adds them up like any other bonus in its Background column.
import { expect, test } from '@playwright/test';

/** Loading MPMB's scripts on a blank sheet takes a while in a fresh browser. */
const STARTUP = 120_000;

test('with the house rule, the background bonus goes to abilities the background does not name', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const changesAlert = page.getByRole('dialog', { name: 'Changes alert' });
  await page.addLocatorHandler(changesAlert, async () => {
    await changesAlert.getByRole('button', { name: 'Close', exact: true }).last().click();
  });

  await page.goto('./');
  await page.getByRole('button', { name: 'Homebrew rules' }).click();
  await page.getByRole('switch', { name: 'Background boosts anywhere' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await page.getByRole('button', { name: 'New character' }).click();
  await page
    .getByRole('dialog', { name: 'Source selection' })
    .getByRole('button', { name: 'Apply' })
    .click({ timeout: STARTUP });
  const rail = page.getByRole('navigation', { name: 'Steps' });
  await expect(rail).toBeVisible({ timeout: STARTUP });

  // Acolyte names Intelligence, Wisdom and Charisma.
  await rail.getByRole('button', { name: /Background/ }).click();
  // Only a handful of backgrounds in the SRD: no search box. Acolyte is shown first.
  await page.getByRole('button', { name: 'Take Acolyte' }).click();
  // Its Magic Initiate feat asks for a spellcasting ability; MPMB's default is fine here.
  await page.getByRole('dialog', { name: 'Ask user' }).getByRole('button', { name: 'OK', exact: true }).click();
  await expect(rail.getByRole('button', { name: /Background/ })).toContainText('Acolyte');

  await rail.getByRole('button', { name: /Ability scores/ }).click();
  const table = page.getByRole('table', { name: 'Ability scores' });
  const total = (ability: string) => table.getByRole('row').filter({ hasText: ability }).locator('.total');
  const strength = Number(await total('Strength').textContent());
  const constitution = Number(await total('Constitution').textContent());
  const dexterity = Number(await total('Dexterity').textContent());

  // +2 and +1, on Strength and Constitution.
  await page.getByRole('button', { name: 'Strength +2 from the background' }).click();
  await page.getByRole('button', { name: 'Constitution +1 from the background' }).click();
  await expect(page.locator('.notes .done')).toBeVisible();
  await expect(total('Strength')).toHaveText(String(strength + 2));
  await expect(total('Constitution')).toHaveText(String(constitution + 1));

  // Three +1: the abilities picked so far keep a +1, a third one makes it whole, a fourth isn't taken.
  await page
    .getByRole('group', { name: 'How the background bonus is split' })
    .getByRole('button', { name: 'Three +1' })
    .click();
  await expect(total('Strength')).toHaveText(String(strength + 1));
  await expect(page.locator('.notes .open')).toBeVisible();
  await page.getByRole('button', { name: 'Dexterity +1 from the background' }).click();
  await expect(page.locator('.notes .done')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wisdom +1 from the background' })).toBeDisabled();

  // MPMB has them: after a reload the step reads the same column back from the sheet.
  // The step sends its taps to MPMB a moment after the last one; wait until the sheet is saved.
  await page.waitForTimeout(1500);
  await expect(page.locator('.top .status:not(.busy)')).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  await rail.getByRole('button', { name: /Ability scores/ }).click({ timeout: STARTUP });
  await expect(total('Dexterity')).toHaveText(String(dexterity + 1), { timeout: STARTUP });
  await expect(total('Constitution')).toHaveText(String(constitution + 1));
  await expect(page.getByRole('button', { name: 'Strength +1 from the background' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // After the reload the mode comes from the column. Giving two +1s back leaves one +1, which on its own
  // could be either mode: the step stays on "Three +1" instead of jumping to +2 and +1 under the player.
  await page.getByRole('button', { name: 'Strength +1 from the background' }).click();
  await page.getByRole('button', { name: 'Constitution +1 from the background' }).click();
  await expect(
    page.getByRole('group', { name: 'How the background bonus is split' }).getByRole('button', { name: 'Three +1' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Strength +2 from the background' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dexterity +1 from the background' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(errors).toEqual([]);
});
