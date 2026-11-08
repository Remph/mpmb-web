// Notes pages in a real browser: an empty line the player leaves between two blocks shows as a gap when the
// page is read (Remph's pick "in notes only", 2026-11-07), and it stays in the sheet's field.
import { expect, test } from '@playwright/test';

/** Loading MPMB's scripts on a blank sheet takes a while in a fresh browser. */
const STARTUP = 120_000;
/** About half a line of 15 px text: how much more space a gap must add than the usual line spacing. */
const MIN_GAP_PX = 8;

test('an empty line on a notes page shows as a gap', async ({ page }) => {
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

  await page.getByRole('tab', { name: 'Notes' }).click();
  await page.getByRole('button', { name: '+ Add page' }).click();
  const left = page.getByLabel('Left column');
  await left.fill('Camp\nWatch order\n\n\nNext session');
  await left.blur();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  const lines = page.getByRole('tabpanel').locator('.col p');
  await expect(lines).toHaveText(['Camp', 'Watch order', 'Next session']);
  // Three empty lines make one gap, above the line after them only.
  const gaps = await lines.evaluateAll((all) => all.map((line) => line.classList.contains('gap')));
  expect(gaps).toEqual([false, false, true]);
  const [camp, watch, next] = await Promise.all([0, 1, 2].map((i) => lines.nth(i).boundingBox()));
  if (!camp || !watch || !next) throw new Error('the lines have no size');
  // The gap is clearly wider than the space between two lines that follow each other.
  const usual = watch.y - (camp.y + camp.height);
  expect(next.y - (watch.y + watch.height)).toBeGreaterThan(usual + MIN_GAP_PX);

  // The empty lines stay in the page's field, for the PDF export.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Left column')).toHaveValue('Camp\nWatch order\n\n\nNext session');
  expect(errors).toEqual([]);
});
