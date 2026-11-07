// A smoke test of the built app in a real browser: the start page, new characters built from scratch
// (class, species, armour, a weapon; a wizard's spells), the play view showing what MPMB worked out, the print sheet
// and filling MPMB's PDF. It catches
// what unit tests can't: the worker, the page's headers, the pop-ups and the routes working together.
import fs from 'node:fs';
import { expect, test } from '@playwright/test';

/** Loading MPMB's scripts on a blank sheet takes a while in a fresh browser. */
const STARTUP = 120_000;

test('a new character gets a class, a species, armour and a weapon, and the play view shows them', async ({ page }) => {
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

  // Species: a dwarf, for the walking speed MPMB fills in.
  await rail.getByRole('button', { name: /Species/ }).click();
  await page.getByRole('searchbox', { name: 'Search species …' }).fill('Dwarf');
  await page
    .getByRole('button', { name: /^Dwarf/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Take Dwarf' }).click();
  // MPMB asks for the dwarf's two languages; its defaults are fine here.
  await page.getByRole('dialog', { name: 'Ask user' }).getByRole('button', { name: 'OK', exact: true }).click();
  await expect(rail.getByRole('button', { name: /Species/ })).toContainText('Dwarf');

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

  // Speed (2026-11-07): the tile opens a window with MPMB's sources; a typed speed goes onto the sheet as in the
  // PDF, and MPMB keeps it.
  await page.getByRole('button', { name: /^Speed 30 ft, change$/ }).click();
  const speedWindow = page.getByRole('dialog', { name: 'Speed' });
  await expect(speedWindow.locator('li')).toContainText(['Dwarf [30 ft]']);
  // MPMB reads a typed number in the sheet's unit, so the window names it.
  await expect(speedWindow).toContainText("the sheet's unit (ft)");
  // An empty speed would hide the tile and the way back to this window.
  await speedWindow.getByRole('textbox', { name: 'Speed', exact: true }).fill(' ');
  await expect(speedWindow.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await speedWindow.getByRole('textbox', { name: 'Speed', exact: true }).fill('35 ft');
  await speedWindow.getByRole('button', { name: 'Apply' }).click();
  await expect(speedWindow).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Speed 35 ft, change$/ })).toBeVisible();

  // The parity leftovers: arrows from MPMB's list, two shots, half of them picked up again; the attack
  // rolls with advantage; experience points added in the Profile tab, without the Build screen. (Without ability scores this
  // fighter has no initiative to mark.)
  await page.getByRole('button', { name: '+ Ammunition' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Arrows', exact: true }).click();
  const countPad = page.getByRole('dialog', { name: 'How many Arrows?' });
  await countPad.getByRole('button', { name: '2', exact: true }).click();
  await countPad.getByRole('button', { name: '0', exact: true }).click();
  await countPad.getByRole('button', { name: 'Apply' }).click();
  const arrows = page.getByRole('group', { name: 'Arrows' });
  await expect(arrows).toContainText('20');
  await arrows.getByRole('button', { name: 'Arrows: Fewer' }).click();
  await expect(arrows).toContainText('19');
  await arrows.getByRole('button', { name: 'Arrows: Fewer' }).click();
  await expect(page.getByText('2 used')).toBeVisible();
  await page.getByRole('button', { name: 'Pick up' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Half: 1' }).click();
  await expect(arrows).toContainText('19');
  await expect(page.getByText('2 used')).toHaveCount(0);
  await page.getByRole('button', { name: /^Longsword attack roll/ }).click();
  await page
    .getByRole('dialog', { name: 'Attack rolls' })
    .getByRole('button', { name: /Advantage/ })
    .click();
  await expect(page.getByRole('button', { name: /^Longsword attack roll .*, advantage$/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Profile' }).click();
  await page.getByRole('button', { name: '+ XP' }).click();
  const xpPad = page.getByRole('dialog', { name: 'Add experience points' });
  await xpPad.getByRole('button', { name: '1', exact: true }).click();
  await xpPad.getByRole('button', { name: '0', exact: true }).click();
  await xpPad.getByRole('button', { name: '0', exact: true }).click();
  await xpPad.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('100 XP', { exact: true })).toBeVisible();
  // Magic items in place (session fixes, 2026-11-04): added from MPMB's list on the Inventory tab, then removed.
  await page.getByRole('tab', { name: 'Inventory' }).click();
  await page.getByRole('button', { name: 'Change magic items' }).click();
  const magicWindow = page.getByRole('dialog', { name: 'Magic items' });
  await magicWindow.getByRole('button', { name: '+ Add a magic item' }).click({ timeout: STARTUP });
  const magicPick = page.getByRole('dialog', { name: 'Add a magic item' });
  await magicPick.getByRole('searchbox').fill('Bag of Holding');
  await magicPick.getByRole('button', { name: /^Bag of Holding/ }).click();
  await expect(magicWindow.getByText('Bag of Holding')).toBeVisible();
  // On the card, a tap on the item's tile opens its text under the tiles, and a second tap closes it.
  await magicWindow.getByRole('button', { name: 'Close', exact: true }).last().click();
  const magicCard = page.locator('section[aria-labelledby=magic-title]');
  await magicCard.getByRole('button', { name: 'Bag of Holding' }).click();
  await expect(magicCard.locator('#magic-text')).toContainText('Bag of Holding');
  await magicCard.getByRole('button', { name: 'Bag of Holding' }).click();
  await expect(magicCard.locator('#magic-text')).toHaveCount(0);
  await page.getByRole('button', { name: 'Change magic items' }).click();
  await magicWindow.getByRole('button', { name: 'Remove Bag of Holding' }).click();
  await expect(magicWindow.getByText('Bag of Holding')).toHaveCount(0);
  // An item in several forms: closing MPMB's "which armor?" pop-up cancels the whole add (fix, 2026-11-04).
  await magicWindow.getByRole('button', { name: '+ Add a magic item' }).click();
  await magicPick.getByRole('searchbox').fill('Adamantine Armor');
  await magicPick.getByRole('button', { name: /^Adamantine Armor/ }).click();
  const formQuestion = page.getByRole('dialog').filter({ hasText: 'Select Type of Armor' });
  await formQuestion.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(formQuestion).toHaveCount(0);
  await expect(magicWindow.getByText('Adamantine')).toHaveCount(0);
  await expect(magicWindow.getByText('Nothing listed.')).toBeVisible();
  await magicWindow.getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.getByRole('tab', { name: 'Combat' }).click();

  // Session fixes (2026-11-04): the Actions card folds MPMB's basic actions away and opens a feature's rule
  // on a tap; the top bar folds away and the name pill in the tab row brings it back.
  const actionsCard = page.locator('section[aria-labelledby=actions-title]');
  await expect(actionsCard.getByRole('button', { name: '+ 13 basic actions' })).toBeVisible();
  await expect(actionsCard.getByText('Dash', { exact: true })).toHaveCount(0);
  await actionsCard.getByRole('button', { name: 'Second Wind: show the rule' }).click();
  await expect(actionsCard.locator('.rule')).toContainText('Second Wind');
  await actionsCard.getByRole('button', { name: 'Second Wind: show the rule' }).click();
  await expect(actionsCard.locator('.rule')).toHaveCount(0);
  await page.getByRole('button', { name: 'Fold the bar away' }).click();
  await expect(page.getByRole('button', { name: 'Short rest' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Show the bar/ }).click();
  await expect(page.getByRole('button', { name: 'Short rest' })).toBeVisible();

  // Homebrew: the ult charges card shows only with its switch on. A quick double tap at one short of full
  // fills the meter but doesn't use the ult at once, and a double tap on "Use ult" leaves it empty.
  const ult = page.locator('.ult');
  await expect(ult).toHaveCount(0);
  const homebrewSwitch = async () => {
    await page.getByRole('button', { name: 'Sheet menu' }).click();
    await page.getByRole('button', { name: 'Homebrew rules' }).click();
    await page.getByRole('switch', { name: 'Ult charges' }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
  };
  await homebrewSwitch();
  await ult.getByRole('button', { name: '+1 charge' }).click();
  await ult.getByRole('button', { name: 'Ult charges: 1 of 30' }).click();
  const ultPad = page.getByRole('dialog', { name: 'Ult charges' });
  await ultPad.getByRole('button', { name: '2', exact: true }).click();
  await ultPad.getByRole('button', { name: '9', exact: true }).click();
  await ultPad.getByRole('button', { name: 'Apply' }).click();
  await ult.getByRole('button', { name: '+1 charge' }).dblclick();
  await expect(ult.getByRole('button', { name: 'Ult charges: 30 of 30' })).toBeVisible();
  await expect(ult.getByText('Ready')).toBeVisible();
  await ult.getByRole('button', { name: 'Use ult' }).dblclick();
  await expect(ult.getByRole('button', { name: 'Ult charges: 0 of 30' })).toBeVisible();
  // The ult as a tile among the actions (2026-11-07): off the card until the player picks a row; a tap on the
  // tile shows the description they typed.
  await expect(actionsCard.locator('.chip.ult')).toHaveCount(0);
  await ult.getByRole('button', { name: 'Edit', exact: true }).click();
  const ultWindow = page.getByRole('dialog', { name: 'Ultimate ability' });
  await ultWindow.getByLabel('Name', { exact: true }).fill('Battle Roar');
  await ultWindow.getByRole('button', { name: 'Bonus action', exact: true }).click();
  await ultWindow.getByText('Description', { exact: true }).click();
  await ultWindow
    .getByRole('textbox', { name: 'Description' })
    .fill('You roar.\n\nEach enemy within 9 m is Frightened.');
  await ultWindow.getByRole('button', { name: 'Apply', exact: true }).click();
  const ultTile = actionsCard.getByRole('button', { name: 'Battle Roar: show the rule' });
  await expect(actionsCard.locator('.group.bonus .chip').first()).toContainText('Battle Roar0/30');
  await ultTile.click();
  await expect(actionsCard.locator('.rule p')).toHaveText(['You roar.', 'Each enemy within 9 m is Frightened.']);
  // Taking the tile off the card while its rule is open closes the rule, rather than opening the rule of the
  // tile that moves into its place (Second Wind; review of #61).
  await ult.getByRole('button', { name: 'Edit', exact: true }).click();
  await ultWindow.getByRole('button', { name: 'Don’t show', exact: true }).click();
  await ultWindow.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(actionsCard.locator('.chip.ult')).toHaveCount(0);
  await expect(actionsCard.locator('.rule')).toHaveCount(0);

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
  // Homebrew stays in the app.
  await expect(sheet).not.toContainText('Ult charges');
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

  // The switch off again: the card goes.
  await homebrewSwitch();
  await expect(ult).toHaveCount(0);

  // "No ammunition counting" hides the ammunition on the Combat tab, and switching it off brings it back.
  const ammoSwitch = async () => {
    await page.getByRole('button', { name: 'Sheet menu' }).click();
    await page.getByRole('button', { name: 'Homebrew rules' }).click();
    await page.getByRole('switch', { name: 'No ammunition counting' }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
  };
  const ammo = page.getByRole('button', { name: '+ Ammunition' });
  await expect(ammo).toBeVisible();
  await ammoSwitch();
  await expect(ammo).toHaveCount(0);
  await ammoSwitch();
  await expect(ammo).toBeVisible();

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
  // A hit that lowers the maximum too (Life Drain, session fixes 2026-11-04): the card says so, and Restore
  // makes it whole again.
  await page.getByRole('button', { name: 'Damage', exact: true }).click();
  const damagePad = page.getByRole('dialog', { name: 'Take damage' });
  await damagePad.getByRole('button', { name: '3', exact: true }).click();
  await damagePad.getByRole('checkbox', { name: /^Lowers max HP too/ }).check();
  await damagePad.getByRole('button', { name: 'Take damage' }).click();
  await expect(page.getByText('Max lowered by 3')).toBeVisible();
  await page.getByRole('button', { name: /^Restore max HP to/ }).click();
  await expect(page.getByText(/^Max lowered by/)).toHaveCount(0);
  // The next opening of the paladin tries again.
  await page.getByRole('link', { name: /Characters/ }).click();
  await page.getByRole('link', { name: /Test Paladin/ }).click();

  // Two engines start (the old sheet and the new one) and MPMB's import runs between them. The line under the
  // top bar says so (M11, the owner's pick A).
  const line = page.getByRole('status').filter({ hasText: "Updated to MPMB's sheet v24.2.0." });
  await expect(line).toBeVisible({ timeout: STARTUP });
  // MPMB's import only moves the paladin's limited features and bonus actions to other rows, which the app
  // doesn't count, and empties its main Notes, which the app brings back (UI review 2, findings 01 and 03).
  await expect(line).toContainText('Everything you see is as before.');
  await expect(page.getByText('Test Paladin / Warlock').first()).toBeVisible();
  // Saved on the current sheet, and the version before is kept.
  const stored = await page.evaluate(STORED);
  expect(stored).toMatchObject({ version: '24.2.0', previous: OLD, update: { from: OLD, to: '24.2.0', seen: false } });

  await page.getByRole('tab', { name: 'Notes' }).click();
  await expect(page.getByRole('tabpanel').locator('textarea#notes')).toHaveValue('Test Notes');
  const notes = await page.evaluate(`new Promise((resolve) => {
    const open = indexedDB.open('mpmb-web');
    open.onsuccess = () => {
      const get = open.result.transaction('data').objectStore('data').get('older-paladin');
      get.onsuccess = () => resolve(get.result.fields['Extra.Notes'].value);
    };
  })`);
  expect(notes).toBe('Test Notes');

  // What changed: nothing to check.
  await line.getByRole('button', { name: 'See what changed' }).click();
  const window = page.getByRole('dialog', { name: "Updated to MPMB's sheet v24.2.0" });
  await expect(window).toContainText('Every entry you see is as before.');
  await window.getByRole('button', { name: "MPMB's notes on the import (English)" }).click();
  await expect(window).toContainText('might not have transferred');
  // Undo: back on the old sheet, where it stays, and the line offers the update again.
  await window.getByRole('button', { name: `Undo: back to v${OLD}` }).click();
  const stays = page.getByRole('status').filter({ hasText: `stays on MPMB's sheet v${OLD}` });
  await expect(stays).toBeVisible({ timeout: STARTUP });
  expect(await page.evaluate(STORED)).toMatchObject({ version: OLD, previous: null });
  await stays.getByRole('button', { name: 'Update to v24.2.0' }).click();
  await expect(line).toBeVisible({ timeout: STARTUP });
  // ✕ keeps the update: the line goes, and the list no longer marks the character.
  await line.getByRole('button', { name: 'Keep the update and close this line' }).click();
  await expect(line).toBeHidden();
  expect(await page.evaluate(STORED)).toMatchObject({ version: '24.2.0', previous: OLD, update: { seen: true } });
  await page.getByRole('link', { name: /Characters/ }).click();
  await expect(page.getByText('Updated to sheet v24.2.0')).toBeHidden();
  expect(errors).toEqual([]);
});

/**
 * The older paladin in the browser's storage: its sheet version, its copy from before the update, its update
 * entry. As a string: the browser's IndexedDB types aren't in the e2e tests' TypeScript setup.
 */
const STORED = `new Promise((resolve, reject) => {
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
          previous: previous.result ? previous.result.data.info.SheetVersion : null,
          update: meta.result.sheetUpdate,
        });
    };
  })`;
