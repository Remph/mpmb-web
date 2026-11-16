// M17 potions (Nick picked mock A, 2026-11-16): a Drink button on a healing potion's gear row opens a window; an
// action heals the full value, a bonus action rolls the dice. The healing and one potion fewer reach the sheet at
// once, and the dice card offers Undo. The SRD reference paladin carries 5 Potion of Healing (2d4+2).
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STARTUP = 120_000;
const LAPTOP = { width: 1440, height: 900 };
/** 92 hit points less 31 damage. */
const HURT = 61;
const FULL_POTION = 10;
const LEAST = 4;

async function openPaladin(page: Page): Promise<void> {
  const paladin: unknown = JSON.parse(fs.readFileSync('test/characters/paladin8-warlock2.json', 'utf8'));
  const day = '2026-11-16T00:00:00.000Z';
  const backup = {
    format: 'mpmb-web-backup',
    version: 1,
    created: day,
    sheet: { type: 'Colorful - A4', version: '24.2.0' },
    characters: [
      {
        meta: {
          id: 'potion-paladin',
          name: 'Test Potion Paladin',
          classes: 'Paladin 8, Warlock 2',
          species: '',
          addOns: { files: [], manual: false },
          created: day,
          updated: day,
        },
        data: paladin,
      },
    ],
  };
  await page.goto('./');
  await page
    .locator('input[accept=".json,application/json"]')
    .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole('dialog', { name: 'Restore backup?' }).getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('link', { name: 'Test Potion Paladin' }).first().click();
  await expect(page.locator('.now').first()).toBeVisible({ timeout: STARTUP });
}

const hitPoints = async (page: Page): Promise<number> => Number(await page.locator('.now').first().textContent());
/** The count on the Potion of Healing row: its stepper is a group named after the item. */
const count = (page: Page) => page.getByRole('group', { name: 'Potion of Healing', exact: true });

test('a potion drunk as an action heals its full value, Undo puts it back, a bonus action rolls', async ({ page }) => {
  await page.setViewportSize(LAPTOP);
  await openPaladin(page);
  await page.getByRole('button', { name: 'Damage', exact: true }).click();
  await page.keyboard.type('31');
  await page.keyboard.press('Enter');
  await expect(page.locator('.now').first()).toHaveText(String(HURT));

  await page.getByRole('tab', { name: 'Inventory' }).click();
  await expect(count(page)).toContainText('5');
  await page.getByRole('button', { name: 'Drink Potion of Healing', exact: true }).click();
  const window = page.getByRole('dialog', { name: 'Potion of Healing' });
  await expect(window).toContainText('Heals 2d4+2 hit points · 5 left · you have 61 / 92');
  await window.getByRole('button', { name: /Drink as an action/ }).click();

  const card = page.getByRole('region', { name: 'Dice roll' });
  await expect(card.getByRole('heading', { name: 'Potion of Healing · action' })).toBeVisible();
  await expect(card.locator('.total')).toHaveText(`+${FULL_POTION}`);
  await expect(page.locator('.now').first()).toHaveText(String(HURT + FULL_POTION));
  await expect(count(page)).toContainText('4');

  await card.getByRole('button', { name: 'Undo Potion of Healing · action' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('.now').first()).toHaveText(String(HURT));
  await expect(count(page)).toContainText('5');

  await page.getByRole('button', { name: 'Drink Potion of Healing', exact: true }).click();
  await window.getByRole('button', { name: /Drink as a bonus action/ }).click();
  await expect(card.getByRole('heading', { name: 'Potion of Healing · bonus action' })).toBeVisible();
  const healed = Number((await card.locator('.total').textContent())?.replace('+', ''));
  expect(healed).toBeGreaterThanOrEqual(LEAST);
  expect(healed).toBeLessThanOrEqual(FULL_POTION);
  expect(await card.locator('.die').count()).toBe(2);
  await expect(page.locator('.now').first()).toHaveText(String(HURT + healed));
  expect(await hitPoints(page)).toBe(HURT + healed);
  await expect(count(page)).toContainText('4');
  const undo = card.getByRole('button', { name: 'Undo Potion of Healing · bonus action' });
  await expect(undo).toBeVisible();

  // Damage after the drink: Undo would write the old hit points back and wipe the damage out, so it goes.
  await page.getByRole('button', { name: 'Damage', exact: true }).click();
  await page.keyboard.type('3');
  await page.keyboard.press('Enter');
  await expect(page.locator('.now').first()).toHaveText(String(HURT + healed - 3));
  await expect(card).toBeVisible();
  await expect(undo).toHaveCount(0);
});
