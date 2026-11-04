// A smoke test of the built app in a real browser: the start page, new characters built from scratch
// (class, armour, a weapon; a wizard's spells), the play view showing what MPMB worked out, the print sheet
// and filling MPMB's PDF. It catches
// what unit tests can't: the worker, the page's headers, the pop-ups and the routes working together.
import fs from 'node:fs';
import { expect, test } from '@playwright/test';

/** Loading MPMB's scripts on a blank sheet takes a while in a fresh browser. */
const STARTUP = 120_000;

test('a new character gets a class, armour and a weapon, and the play view shows them', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // MPMB's reminder of what a change affected ("Changes alert") may come after any step: closed, as a
  // player would.
  const changesAlert = page.getByRole('dialog', { name: 'Changes alert' });
  await page.addLocatorHandler(changesAlert, async () => {
    await changesAlert.getByRole('button', { name: 'Close', exact: true }).last().click();
  });

  await page.goto('./');
  // MPMB's condition for this site: the start page says it isn't MPMB's.
  await expect(page.getByText('not affiliated with or endorsed by', { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: 'New character' }).click();
  // MPMB asks a new sheet which sources to use; the SRD is already in.
  const sources = page.getByRole('dialog', { name: 'Source selection' });
  await sources.getByRole('button', { name: 'Apply' }).click({ timeout: STARTUP });
  const rail = page.getByRole('navigation', { name: 'Steps' });
  // Creating a character starts the engine on a blank sheet: the slowest step.
  await expect(rail).toBeVisible({ timeout: STARTUP });

  // Class & level: a fighter, through MPMB's own class field.
  await page.getByRole('button', { name: 'Choose a class' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Fighter/ })
    .click();
  await expect(rail.getByRole('button', { name: /Class & level/ })).toContainText('Fighter 1');

  // Armour & weapons: chain mail gives AC 16, a longsword gets MPMB's to hit.
  await rail.getByRole('button', { name: /Armour & weapons/ }).click();
  await page.getByRole('button', { name: /No armour/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Chain Mail/ })
    .click();
  await expect(page.locator('.ac')).toContainText('16');
  await page
    .getByRole('button', { name: /Add a weapon/ })
    .first()
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Longsword/ })
    .click();
  const row = page.locator('.weapon').filter({ hasText: 'Longsword' });
  await expect(row.locator('.hit')).toHaveText(/^[+-]\d+$/);

  // The play view: the armour class and the attack.
  await page.getByRole('link', { name: 'Done: to the play view' }).click();
  await expect(page.locator('.attack').filter({ hasText: 'Longsword' })).toBeVisible();
  await expect(page.getByText('Armor class').locator('..')).toContainText('16');

  // Print (M10): the print window offers the parts this fighter has (no spells, no notes), and the print
  // sheet appears for the browser's print with the attack on it. window.print() itself would wait for a
  // dialog the test can't answer, so the test fires the browser's "beforeprint" the way printing does.
  await page.getByRole('button', { name: /Sheet menu/ }).click();
  await page.getByRole('button', { name: /^Print/ }).click();
  const printWindow = page.getByRole('dialog', { name: 'Print' });
  await expect(printWindow.getByRole('checkbox')).toHaveCount(5);
  await expect(printWindow).not.toContainText('Every spell');
  await printWindow.getByRole('button', { name: 'Cancel' }).click();
  // A string, not a function: this file is type-checked with Node's types, which have no `window`.
  await page.evaluate("window.dispatchEvent(new Event('beforeprint'))");
  const sheet = page.locator('.print-sheet');
  await expect(sheet.locator('.attacks')).toContainText('Longsword');
  await page.evaluate("window.dispatchEvent(new Event('afterprint'))");
  await expect(sheet).toHaveCount(0);

  // Fill MPMB PDF (M10): a file that isn't a PDF gets a plain answer. With MPMB_BLANK_PDF (a blank
  // Colorful A4 v24.2.0; the repo doesn't hold MPMB's PDF) the fighter goes into it and downloads.
  await page.getByRole('button', { name: /Sheet menu/ }).click();
  await page.getByRole('button', { name: /^Fill MPMB PDF/ }).click();
  const fillWindow = page.getByRole('dialog', { name: 'Fill MPMB PDF' });
  await expect(fillWindow.getByRole('link', { name: "MPMB's website" })).toBeVisible();
  const pdfInput = fillWindow.locator('input[type="file"]');
  await pdfInput.setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') });
  await expect(fillWindow.getByRole('alert')).toContainText('not a readable PDF');
  const blankPdf = process.env.MPMB_BLANK_PDF;
  if (blankPdf) {
    const download = page.waitForEvent('download', { timeout: STARTUP });
    await pdfInput.setInputFiles(blankPdf);
    expect((await download).suggestedFilename()).toMatch(/-mpmb-\d{4}-\d\d-\d\d\.pdf$/);
    await expect(fillWindow).toContainText('is in your downloads');
  }
  await fillWindow
    .getByRole('button', { name: /^(Cancel|Close)$/ })
    .last()
    .click();
  await expect(fillWindow).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('a new wizard chooses spells on the Build screen, and the Spells tab shows them', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Choose a class' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Wizard/ })
    .click();
  await expect(rail.getByRole('button', { name: /Class & level/ })).toContainText('Wizard 1');

  // The Spells step: what MPMB's spell dialog offers, the add list next to it on a laptop.
  await rail.getByRole('button', { name: /^9 Spells/ }).click();
  const adder = page.locator('.adder');
  await adder.getByRole('button', { name: 'Cantrips' }).click();
  await adder.getByRole('button', { name: 'Add Fire Bolt' }).click();
  await adder.getByRole('button', { name: 'Level 1' }).click();
  await adder.getByRole('button', { name: 'Add Magic Missile' }).click();
  await expect(page.getByText('2 changes are not on the spell sheet yet.')).toBeVisible();

  // MPMB's own dialogs take the picks and make the spell sheet pages.
  await page.getByRole('button', { name: 'Update spell sheet' }).click();
  await expect(page.getByText('are not on the spell sheet yet')).toHaveCount(0, { timeout: STARTUP });
  await expect(rail.getByRole('button', { name: /Spells/ })).toContainText('Wizard');

  await page.getByRole('link', { name: 'Done: to the play view' }).click();
  await page.getByRole('tab', { name: 'Spells' }).click();
  await page.getByRole('button', { name: 'All spells', exact: true }).click();
  await expect(page.locator('.spell').filter({ hasText: 'Fire Bolt' }).first()).toBeVisible();
  await expect(page.locator('.spell').filter({ hasText: 'Magic Missile' }).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test('a character saved on an older sheet is updated when it opens, and the version before is kept', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // The SRD paladin as Acrobat saved it, marked as saved on the older sheet that the test build offers
  // (VITE_TEST_OLD_VERSION in playwright.config.ts), restored from a backup.
  const OLD = '24.1.0';
  const paladin = JSON.parse(fs.readFileSync('test/characters/paladin8-warlock2.json', 'utf8')) as {
    info: Record<string, string>;
  };
  paladin.info.SheetVersion = OLD;
  const day = '2026-11-01T00:00:00.000Z';
  const backup = {
    format: 'mpmb-web-backup',
    version: 1,
    created: day,
    sheet: { type: 'Colorful - A4', version: OLD },
    characters: [
      {
        meta: {
          id: 'older-paladin',
          name: 'Test Paladin / Warlock',
          classes: 'Paladin 8, Warlock 2',
          species: '',
          addOns: { files: [], manual: false },
          created: day,
          updated: day,
        },
        data: paladin,
      },
      {
        // On the current sheet: opens as it is.
        meta: {
          id: 'wizard',
          name: 'Test Wizard',
          classes: 'Wizard 10',
          species: '',
          addOns: { files: [], manual: false },
          created: day,
          updated: day,
        },
        data: JSON.parse(fs.readFileSync('test/characters/wizard10-evoker.json', 'utf8')) as unknown,
      },
    ],
  };

  await page.goto('./');
  await page
    .locator('input[accept=".json,application/json"]')
    .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole('dialog', { name: 'Restore backup?' }).getByRole('button', { name: 'Restore' }).click();
  // Leaving while the update runs stops it, and another character opened meanwhile stays itself: the
  // update must not take over its sheet once the old one has opened (review of #39: the wizard's screen
  // showed the paladin, and the next tap saved the paladin over the wizard).
  await page.getByRole('link', { name: /Test Paladin/ }).click();
  await expect(page.getByText('Moving Test Paladin / Warlock to sheet v24.2.0').first()).toBeVisible({
    timeout: STARTUP,
  });
  await page.getByRole('link', { name: /Characters/ }).click();
  await page.getByRole('link', { name: /Test Wizard/ }).click();
  await expect(page.getByText('Saved')).toBeVisible({ timeout: STARTUP });
  // Long enough for the paladin's old sheet to have opened in its own worker (about 3 s).
  await page.waitForTimeout(8_000);
  await page.getByRole('checkbox', { name: 'Heroic Inspiration' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Test Wizard');
  await expect(page.getByText('could not be moved')).toBeHidden();
  const wizardName = await page.evaluate(`new Promise((resolve) => {
    const open = indexedDB.open('mpmb-web');
    open.onsuccess = () => {
      const get = open.result.transaction('data').objectStore('data').get('wizard');
      get.onsuccess = () => resolve(get.result.fields['PC Name'].value);
    };
  })`);
  expect(wizardName).toBe('Test Wizard');
  // The next opening of the paladin tries again.
  await page.getByRole('link', { name: /Characters/ }).click();
  await page.getByRole('link', { name: /Test Paladin/ }).click();

  // Two engines start (the old sheet and the new one) and MPMB's import runs between them.
  await expect(page.getByText(`is updated from sheet v${OLD} to v24.2.0`)).toBeVisible({ timeout: STARTUP });
  await expect(page.getByText('Test Paladin / Warlock').first()).toBeVisible();
  // Saved on the current sheet, and the version before is kept.
  // As a string: the browser's IndexedDB types aren't in the e2e tests' TypeScript setup.
  const stored = await page.evaluate(`new Promise((resolve, reject) => {
    const open = indexedDB.open('mpmb-web');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(['meta', 'data', 'previous']);
      const data = tx.objectStore('data').get('older-paladin');
      const previous = tx.objectStore('previous').get('older-paladin');
      const meta = tx.objectStore('meta').get('older-paladin');
      tx.oncomplete = () =>
        resolve({
          version: data.result.info.SheetVersion,
          previous: previous.result.data.info.SheetVersion,
          update: meta.result.sheetUpdate,
        });
    };
  })`);
  expect(stored).toMatchObject({ version: '24.2.0', previous: OLD, update: { from: OLD, to: '24.2.0', seen: false } });
  expect(errors).toEqual([]);
});
