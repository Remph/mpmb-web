// The last of the phone layout (M13 step 5) at 360 px: the start page's one Settings button, the weapon rows in
// Build -> Armour & weapons, and the companions' "+1 ▾" switcher in the top bar.
// Names are matched as parts of the accessible name (Playwright's default without `exact`), so no patterns needed.
import { expect, test, type Page } from '@playwright/test';

/** Loading MPMB's scripts on a blank sheet takes a while in a fresh browser. */
const STARTUP = 120_000;
/** A small Android phone; the phone layout ends at 700 px. */
const PHONE_WIDTH = 360;
const PHONE_HEIGHT = 800;
const PHONE = { width: PHONE_WIDTH, height: PHONE_HEIGHT };
const LAPTOP_WIDTH = 1024;
const LAPTOP_HEIGHT = 768;
const LAPTOP = { width: LAPTOP_WIDTH, height: LAPTOP_HEIGHT };
/** One row of 44 px buttons plus the header's padding; the old two rows were 113 px. */
const ONE_ROW = 70;
const TARGET = 44;
/** A weapon's name and line with the row to themselves (224 px at 360): the old column was about 90 px. */
const NAME_ROOM = 200;
const WEAPONS = ['Dagger', 'Light Crossbow'];

type Box = { x: number; y: number; width: number; height: number };
/** Two boxes that cover each other (by more than a pixel). */
const overlapping = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

/** One after another: each step clicks on the page the next one reads. */
const oneByOne = <T>(items: T[], run: (item: T) => Promise<void>): Promise<void> =>
  items.reduce<Promise<void>>(async (done, item) => {
    await done;
    await run(item);
  }, Promise.resolve());

/** The play view's address without "/build…", as a script (this file has Node's types, no `location`). */
const TO_PLAY = "location.hash = location.hash.split('/build')[0]";
const TO_GEAR = "location.hash = location.hash.split('/build')[0] + '/build/gear'";

async function closeChangesAlerts(page: Page): Promise<void> {
  const changesAlert = page.getByRole('dialog', { name: 'Changes alert' });
  await page.addLocatorHandler(changesAlert, async () => {
    await changesAlert.getByRole('button', { name: 'Close', exact: true }).last().click();
  });
}

test('on a phone, the start page has one Settings button for house rules, look and language', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('./');
  const header = page.getByRole('banner');
  const settings = header.getByRole('button', { name: 'Settings' });
  // One row: the three buttons needed two at 360 px (UI review 3, finding 08); on a phone they are out of the way.
  expect((await header.boundingBox())?.height ?? 0).toBeLessThan(ONE_ROW);
  await expect(header.getByRole('button', { name: 'Look', exact: true })).toBeHidden();
  const box = await settings.boundingBox();
  expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(TARGET);

  await settings.click();
  const window = page.getByRole('dialog', { name: 'Settings' });
  await expect(window.getByRole('button', { name: 'Homebrew rules' })).toBeVisible();
  await expect(window.getByRole('button', { name: 'Look' })).toContainText('Purple');
  // The language switches at once and the window stays, now in German.
  await window.getByRole('button', { name: 'Auf Deutsch wechseln' }).click();
  const einstellungen = page.getByRole('dialog', { name: 'Einstellungen' });
  await expect(einstellungen).toBeVisible();
  await einstellungen.getByRole('button', { name: 'Aussehen' }).click();
  await expect(page.getByRole('dialog', { name: 'Aussehen' })).toBeVisible();
  // The Look window takes the Settings window's place; Escape goes back to the button that opened them.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(header.getByRole('button', { name: 'Einstellungen' })).toBeFocused();

  // From 700 px the three buttons are back and Settings goes.
  await page.setViewportSize(LAPTOP);
  await expect(header.getByRole('button', { name: 'Aussehen', exact: true })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Einstellungen' })).toBeHidden();
});

test('on a phone, weapon rows keep their buttons clear and the companions switch from the top bar', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await closeChangesAlerts(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'New character' }).click();
  await page
    .getByRole('dialog', { name: 'Source selection' })
    .getByRole('button', { name: 'Apply' })
    .click({ timeout: STARTUP });
  await expect(page.getByRole('button', { name: 'Choose a class' })).toBeVisible({ timeout: STARTUP });

  // Two weapons in Build -> Armour & weapons (the address the Combat tab's "Change weapons" uses).
  await page.evaluate(TO_GEAR);
  await oneByOne(WEAPONS, async (weapon) => {
    await page.getByRole('button', { name: 'Add a weapon' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: weapon }).first().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
  const rows = page.locator('li.weapon:not(.empty)');
  await expect(rows).toHaveCount(WEAPONS.length);
  // Below 500 px Change and ✕ sit under the weapon (UI review 2, finding 15): nothing lies over them.
  await oneByOne(await rows.all(), async (row) => {
    const boxes = (await Promise.all((await row.getByRole('button').all()).map((b) => b.boundingBox()))).filter(
      (b): b is Box => b !== null,
    );
    const clashes = boxes.flatMap((a, i) => boxes.slice(i + 1).filter((b) => overlapping(a, b)));
    expect(clashes, 'buttons that overlap').toEqual([]);
    expect((await row.locator('.name').boundingBox())?.width ?? 0, 'the name has the row').toBeGreaterThan(NAME_ROOM);
  });

  // A steed, from the Sheet menu.
  await page.evaluate(TO_PLAY);
  await page.getByRole('button', { name: 'Sheet menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Sheet menu' }).getByRole('button', { name: 'Companion' }).first().click();
  const add = page.getByRole('dialog', { name: 'Add a companion' });
  await add.getByText('Otherworldly Steed', { exact: true }).click({ timeout: STARTUP });
  await add.getByRole('button', { name: 'Add Otherworldly Steed' }).click();
  const question = page.getByRole('dialog').filter({ hasText: 'Celestial' });
  await question.getByText('Fey', { exact: true }).click();
  await question.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('heading', { name: 'Otherworldly Steed' })).toBeVisible({ timeout: STARTUP });

  // On the steed's page the bar keeps the way back; the list lives behind "+1 ▾" after the name.
  const bar = page.getByRole('navigation', { name: 'Character and companions' });
  await expect(bar.getByRole('button', { name: 'Back to' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'list' })).toHaveCount(0);
  const switcher = page.getByRole('banner').getByRole('button', { name: 'Character and companions' });
  await expect(switcher).toHaveText('+1 ▾');
  await switcher.click();
  const sheet = page.getByRole('dialog', { name: 'Character and companions' });
  await expect(sheet.getByRole('button', { name: 'Otherworldly Steed' })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'Character', exact: false }).first().click();
  // The character's own page (no class yet, so no hit points strip): no bar, the sheet closed.
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Otherworldly Steed' })).toHaveCount(0);
  await expect(bar).toHaveCount(0);
  await switcher.click();
  await page.keyboard.press('Escape');
  await expect(switcher).toBeFocused();

  // + Companion from the sheet: its window hands the focus back to "+1 ▾", not to the page (review of #99).
  await switcher.click();
  await sheet.getByRole('button', { name: '+ Companion' }).click();
  await expect(page.getByRole('dialog', { name: 'Add a companion' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(switcher).toBeFocused();

  // Turned to a laptop width with the sheet open, and back: the sheet stays closed.
  await switcher.click();
  await expect(sheet).toBeVisible();
  await page.setViewportSize(LAPTOP);
  await page.setViewportSize(PHONE);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
