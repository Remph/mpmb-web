/* eslint-disable ts-patterns/no-magic-numbers -- counts, gold and sizes are the test data */
// The group's Lager (M16) in a real browser, on the stand-in sync service (test/fake-sync.ts): the line at the end
// of the Inventory tab, the side panel, adding (a new group, a second of the same material), moving an item, the
// gold, a change from another device showing within a poll, and read only without a connection. Made-up items only.
import { expect, test } from '@playwright/test';
import { applyOps } from '../src/lager/lager.ts';
import { FakeSync } from '../test/fake-sync.ts';
import { CODE, connect, routeSync } from './fake-service.ts';

/** Loading MPMB's scripts on a blank sheet takes a while in a fresh browser. */
const STARTUP = 120_000;
/** A change from elsewhere shows within the panel's pace (5 s) plus a moment. */
const POLLED = 15_000;
/** A small phone: the panel is a bottom sheet there. */
const PHONE = { width: 360, height: 800 };

/**
 * Text boxes and selects in open windows whose text is under 16 px (phones zoom into them; e2e/phone.spec.ts has
 * the long story). A string, not a function: this file is type-checked with Node's types, which have no `document`.
 */
const SMALL_FIELDS = `[...document.querySelectorAll('dialog[open] input, dialog[open] textarea, dialog[open] select')]
  .filter((field) => !field.matches('[type=radio], [type=file]'))
  .filter((field) => field.getClientRects().length > 0 && parseFloat(getComputedStyle(field).fontSize) < 16)
  .map((field) => field.outerHTML.slice(0, 80))`;

test('the Lager: open it from the Inventory tab, add, move, count, and see what others change', async ({ browser }) => {
  const service = new FakeSync();
  service.addPlayer('Anna', CODE);
  const context = await browser.newContext();
  await routeSync(context, service);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const changesAlert = page.getByRole('dialog', { name: 'Changes alert' });
  await page.addLocatorHandler(changesAlert, async () => {
    await changesAlert.getByRole('button', { name: 'Close', exact: true }).last().click();
  });

  await connect(page, 'Laptop');
  await page.getByRole('button', { name: 'New character' }).click();
  await page
    .getByRole('dialog', { name: 'Source selection' })
    .getByRole('button', { name: 'Apply' })
    .click({ timeout: STARTUP });
  await page.getByRole('link', { name: 'Done: to the play view' }).click({ timeout: STARTUP });
  await page.getByRole('tab', { name: 'Inventory' }).click();

  // The line at the end of the tab, and the panel.
  const line = page.getByRole('region', { name: 'Lager' });
  await expect(line).toContainText('shared by everyone with a sync code');
  await line.getByRole('button', { name: 'Open the Lager' }).click();
  const panel = page.getByRole('dialog', { name: 'Lager' });
  await expect(panel.getByText('The Lager is empty.')).toBeVisible();

  // The first item makes its group.
  await panel.getByRole('button', { name: '+ Add' }).click();
  let add = page.getByRole('dialog', { name: 'Add to the Lager' });
  await add.getByRole('textbox', { name: 'Name', exact: true }).fill('Goggles of Night');
  await add.getByRole('textbox', { name: 'The new group’s name' }).fill('Magic items');
  await add.getByRole('button', { name: 'Add to the Lager' }).click();
  await expect(add).toBeHidden();
  await expect(panel.getByRole('button', { name: 'Where is Goggles of Night?' })).toHaveText('Lager');

  // Materials: a group with counts; the same name again counts up instead of a second row.
  await panel.getByRole('button', { name: '+ Add' }).click();
  add = page.getByRole('dialog', { name: 'Add to the Lager' });
  await add.getByRole('textbox', { name: 'Name', exact: true }).fill('Iron Ore');
  await add.getByRole('combobox', { name: 'Group' }).selectOption({ label: 'New group …' });
  await add.getByRole('textbox', { name: 'The new group’s name' }).fill('Materials');
  await add.getByRole('radio', { name: 'a count' }).check();
  await add.getByRole('spinbutton', { name: 'How many' }).fill('3');
  await add.getByRole('button', { name: 'Add to the Lager' }).click();
  await panel.getByRole('button', { name: '+ Add' }).click();
  add = page.getByRole('dialog', { name: 'Add to the Lager' });
  await add.getByRole('combobox', { name: 'Group' }).selectOption({ label: 'Materials' });
  await add.getByRole('textbox', { name: 'Name', exact: true }).fill('iron ore');
  await expect(add.getByText('Iron Ore is in this group already (3).')).toBeVisible();
  await add.getByRole('spinbutton', { name: 'How many' }).fill('2');
  await add.getByRole('button', { name: 'Add 2 to Iron Ore' }).click();
  const materials = panel.getByRole('region', { name: 'Materials' });
  await expect(materials.getByRole('listitem')).toHaveCount(1);
  await expect(materials.getByRole('listitem')).toContainText('5');

  // Moving the ring to a character, and the gold.
  await panel.getByRole('button', { name: 'Where is Goggles of Night?' }).click();
  const where = page.getByRole('dialog', { name: 'Where is Goggles of Night?' });
  await where.getByRole('textbox', { name: 'With whom (a character)' }).fill('Aria');
  await where.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByRole('button', { name: 'Where is Goggles of Night?' })).toHaveText('Aria');
  const gold = panel.getByRole('textbox', { name: 'Gold in the Lager' });
  await gold.fill('1,234.5');
  await gold.press('Enter');
  await expect.poll(() => service.lager.copper).toBe(123_450);
  expect(service.lager.items.map((item) => [item.name, item.place, item.count])).toEqual([
    ['Goggles of Night', 'Aria', 1],
    ['Iron Ore', '', 5],
  ]);

  // Someone else's change shows within a poll.
  const ore = service.lager.items[1]?.id ?? '';
  service.lager = { ...applyOps(service.lager, [{ op: 'count', id: ore, by: 4 }], 'Bram', service.now), version: 99 };
  await expect(materials.getByRole('listitem')).toContainText('9', { timeout: POLLED });
  await expect(panel.getByText('Last changed by Bram')).toBeVisible();

  // Without a connection: the last copy, read only.
  service.offline = true;
  await expect(panel.getByText('No connection: this is the last copy, read only.')).toBeVisible({ timeout: POLLED });
  await expect(panel.getByRole('button', { name: '+ Add' })).toBeDisabled();
  service.offline = false;
  await expect(panel.getByRole('button', { name: '+ Add' })).toBeEnabled({ timeout: POLLED });

  // Materials first, for everyone: the group's window moves it up the list (not without a connection).
  await panel.getByRole('button', { name: 'Change the group Materials' }).click();
  const groupWindow = page.getByRole('dialog', { name: 'Materials' });
  const moveUp = groupWindow.getByRole('button', { name: '↑ Move up' });
  const moveDown = groupWindow.getByRole('button', { name: '↓ Move down' });
  await expect(moveDown).toBeDisabled();
  service.offline = true;
  await expect(moveUp).toBeDisabled({ timeout: POLLED });
  service.offline = false;
  await expect(moveUp).toBeEnabled({ timeout: POLLED });
  await moveUp.click();
  await expect(moveUp).toBeDisabled();
  // At the top the focus goes to the way back down, not to the page behind the window.
  await expect(moveDown).toBeFocused();
  await groupWindow.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(panel.locator('section.group').first()).toHaveAccessibleName('Materials');
  await expect.poll(() => service.lager.groups.map((group) => group.name)).toEqual(['Materials', 'Magic items']);

  // On a phone: a bottom sheet whose boxes are big enough not to zoom.
  await page.setViewportSize(PHONE);
  await panel.getByRole('button', { name: '+ Add' }).click();
  expect(await page.evaluate(SMALL_FIELDS)).toEqual([]);
  await page.getByRole('dialog', { name: 'Add to the Lager' }).getByRole('button', { name: 'Cancel' }).click();
  await panel.getByRole('button', { name: 'Goggles of Night', exact: true }).click();
  // Opened to read its text: Save has the focus, not the text box (no keyboard over the text on a tablet).
  await expect(
    page.getByRole('dialog', { name: 'Goggles of Night' }).getByRole('button', { name: 'Save' }),
  ).toBeFocused();
  expect(await page.evaluate(SMALL_FIELDS)).toEqual([]);

  expect(errors).toEqual([]);
  await context.close();
});
