// Rolling back to a restore point in a real browser (Remph's pick, 2026-11-08): opening a character keeps it
// as it was, and the Sheet menu's "Roll back to an earlier save" brings that sheet back after a change.
import { expect, test } from '@playwright/test';

/** Loading MPMB's scripts on a blank sheet takes a while in a fresh browser. */
const STARTUP = 120_000;

test('a change made after opening is rolled back from the Sheet menu', async ({ page }) => {
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

  /** Types into the Notes tab's notes field, which saves when it loses focus. */
  const notes = page.getByRole('textbox', { name: 'Notes', exact: true });
  const writeNotes = async (text: string): Promise<void> => {
    await notes.fill(text);
    await notes.blur();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  };
  await page.getByRole('tab', { name: 'Notes' }).click();
  await writeNotes('Before the session');

  // Opened again from the list: this opening keeps the sheet as a restore point.
  await page.getByRole('link', { name: /Characters/ }).click();
  await page.locator('.characters a.card').first().click();
  await page.getByRole('tab', { name: 'Notes' }).click({ timeout: STARTUP });
  await expect(notes).toHaveValue('Before the session', { timeout: STARTUP });
  await writeNotes('A mistake');

  await page.getByRole('button', { name: /Sheet menu/ }).click();
  await page.getByRole('button', { name: /^Roll back to an earlier save/ }).click();
  const window = page.getByRole('dialog', { name: 'Roll back to an earlier save' });
  await expect(window.getByRole('listitem').first()).toContainText('Opened');
  await window.getByRole('button', { name: 'Roll back', exact: true }).first().click();
  await page
    .getByRole('dialog', { name: /^Roll back to .*\?$/ })
    .getByRole('button', { name: 'Roll back' })
    .click();

  await page.getByRole('tab', { name: 'Notes' }).click({ timeout: STARTUP });
  await expect(notes).toHaveValue('Before the session', { timeout: STARTUP });
  // The sheet from before the rollback is the newest point now: the rollback can be undone.
  await page.getByRole('button', { name: /Sheet menu/ }).click();
  await page.getByRole('button', { name: /^Roll back to an earlier save/ }).click();
  await expect(window.getByRole('listitem').first()).toContainText('Before rolling back');
  expect(errors).toEqual([]);
});
