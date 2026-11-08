// The Look window in a real browser: a theme picked there shows at once, survives a reload without a
// flash of the old one (public/look.js runs before the first paint), and "Like the device" follows the device.
import { expect, test } from '@playwright/test';

test('a theme picked in the Look window shows at once and after a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'purple');
  await expect(html).toHaveAttribute('data-mode', 'light');

  await page.getByRole('button', { name: 'Look' }).click();
  const look = page.getByRole('dialog', { name: 'Look' });
  await look.getByRole('button', { name: 'OLED black' }).click();
  await expect(html).toHaveAttribute('data-theme', 'oled');
  // OLED is dark whatever the device says; its light and dark buttons are off.
  await expect(html).toHaveAttribute('data-mode', 'dark');
  await expect(look.getByRole('button', { name: 'Light', exact: true })).toBeDisabled();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');

  await look.getByRole('button', { name: 'Campfire' }).click();
  await look.getByRole('button', { name: 'Dark', exact: true }).click();
  await look.getByRole('button', { name: 'Done' }).click();

  // The look.js script sets the attributes before the app's own code: check them before the app has run.
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'campfire');
  await expect(html).toHaveAttribute('data-mode', 'dark');
  await page.unroute('**/assets/*.js');

  // Back to "Like the device": the page follows the device's switch while it is open.
  await page.reload();
  await page.getByRole('button', { name: 'Look' }).click();
  await page.getByRole('dialog', { name: 'Look' }).getByRole('button', { name: 'Like the device' }).click();
  await expect(html).toHaveAttribute('data-mode', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveAttribute('data-mode', 'dark');
});
