// The About window (playtest 2026-11-14, note 4): opened from the start page and from the play view's sheet
// menu, it thanks the first players and carries the credits the app must show (MPMB, SRD, GPL source).
import { expect, test } from '@playwright/test';

test('the About window opens from the start page and the sheet menu', async ({ page }) => {
  await page.goto('./');
  const opener = page.getByRole('button', { name: 'About MPMB Web' });
  await opener.click();
  const about = page.getByRole('dialog', { name: 'About MPMB Web' });
  await expect(about.getByRole('heading', { name: 'Thank you' })).toBeVisible();
  await expect(about.getByText('Not made or endorsed by MPMB')).toBeVisible();
  await expect(about.getByText('CC‑BY‑4.0')).toBeVisible();
  await expect(about.getByRole('link', { name: "MPMB's sheets (PDF)" })).toHaveAttribute(
    'href',
    /flapkan\.com\/download/,
  );
  await expect(about.getByRole('link', { name: /^Source code/ })).toHaveAttribute(
    'href',
    /github\.com\/Remph\/mpmb-web/,
  );
  // Escape closes it. (Focus back to the opener comes with the shared Modal change in the phone-fit PR.)
  await page.keyboard.press('Escape');
  await expect(about).toBeHidden();

  await page.getByRole('button', { name: 'New character' }).click();
  await page
    .getByRole('dialog', { name: 'Source selection' })
    .getByRole('button', { name: 'Apply' })
    .click({ timeout: 120_000 });
  await page.getByRole('link', { name: 'Done: to the play view' }).click({ timeout: 120_000 });
  await page.getByRole('button', { name: /Sheet menu/ }).click();
  await page.getByRole('button', { name: /^About MPMB Web/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'About MPMB Web' }).getByRole('heading', { name: 'Thank you' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Sheet menu' })).toBeHidden();
});
