// Nothing may be wider than a phone. One box that sticks out past the right edge makes the page scroll
// sideways, and Chrome on Android then zooms the whole page out to fit it and keeps that zoom after the
// box is gone: the top bar ends short of the right edge and its top is cut off until a reload (Remph's
// report, 2026-11-04). The check walks a new character's Build steps and play tabs at 360 px.
import { expect, test, type Page } from '@playwright/test';

const STARTUP = 120_000;
/** A small Android phone (many are 360 px wide); wider phones have more room, not less. */
const PHONE = { width: 360, height: 800 };

/**
 * The outermost elements whose right edge passes the screen's, leaving out those inside something that
 * scrolls or clips sideways (the tab strip, a table that scrolls on its own): those don't widen the page.
 * Not the app's own element: it clips everything (app.css), so that a too-wide box can't break the page,
 * but the box is still a bug.
 * A string, not a function: this file is type-checked with Node's types, which have no `document`.
 */
const STICKING_OUT = `(() => {
  const width = document.documentElement.clientWidth;
  const contained = (element) => {
    for (let up = element.parentElement; up && up.id !== 'app' && up !== document.body; up = up.parentElement) {
      if (getComputedStyle(up).overflowX !== 'visible') return true;
    }
    return false;
  };
  const out = [...document.body.querySelectorAll('*')].filter((element) => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.right > width + 1 && !contained(element);
  });
  return out
    .filter((element) => !out.includes(element.parentElement))
    .map((element) => element.tagName.toLowerCase() + '.' + [...element.classList].filter((c) => !c.startsWith('svelte-')).join('.'));
})()`;

/** One after another: each check clicks on the page the next one reads. */
const oneByOne = <T>(items: T[], run: (item: T) => Promise<void>): Promise<void> =>
  items.reduce<Promise<void>>((done, item) => done.then(() => run(item)), Promise.resolve());

async function expectNothingWider(page: Page, where: string) {
  // Opened <details> show what a player would open at the table.
  await page.evaluate("document.querySelectorAll('details').forEach((details) => (details.open = true))");
  expect.soft(await page.evaluate(STICKING_OUT), where).toEqual([]);
}

test('on a phone, no Build step and no play tab is wider than the screen', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const changesAlert = page.getByRole('dialog', { name: 'Changes alert' });
  await page.addLocatorHandler(changesAlert, async () => {
    await changesAlert.getByRole('button', { name: 'Close', exact: true }).last().click();
  });

  await page.goto('./');
  await expectNothingWider(page, 'start page');
  await page.getByRole('button', { name: 'New character' }).click();
  await page
    .getByRole('dialog', { name: 'Source selection' })
    .getByRole('button', { name: 'Apply' })
    .click({ timeout: STARTUP });
  const rail = page.getByRole('navigation', { name: 'Steps' });
  await expect(rail).toBeVisible({ timeout: STARTUP });
  // A class, so that the steps after it have something to show.
  await page.getByRole('button', { name: 'Choose a class' }).click();
  // The class list's button whose name starts with "Wizard": "Wizard (SRD 5.2.1)" yes, "Bard" no.
  // Try it: https://regex101.com/?regex=%5EWizard&testString=Wizard%20(SRD%205.2.1)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Wizard/ })
    .click();
  await expect(rail.getByRole('button', { name: 'Class & level' })).toContainText('Wizard 1');

  await oneByOne(await rail.getByRole('button').all(), async (step) => {
    const name = (await step.innerText()).split('\n')[1] ?? '';
    await step.click();
    await expect(step).toHaveAttribute('aria-current', 'step');
    await expectNothingWider(page, `Build step ${name}`);
  });

  await page.getByRole('link', { name: 'Done: to the play view' }).click();
  await oneByOne(await page.getByRole('tab').all(), async (tab) => {
    const name = await tab.innerText();
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expectNothingWider(page, `play tab ${name}`);
  });
});
