// M14 dice rolls (mock B, Nick 2026-11-15): a tap on a to-hit, a skill or initiative rolls at once with the mark on
// the sheet, and the roll card at the bottom shows the dice; damage and the advantage window come from the card.
// The SRD reference paladin: +2 Halberd +8 / 1d10+4, Stealth marked with disadvantage (heavy armour).
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Loading MPMB's scripts in a fresh browser takes a while. */
const STARTUP = 120_000;
const LAPTOP_WIDTH = 1440;
const LAPTOP_HEIGHT = 900;
const LAPTOP = { width: LAPTOP_WIDTH, height: LAPTOP_HEIGHT };
const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;
const PHONE = { width: PHONE_WIDTH, height: PHONE_HEIGHT };
/** The smallest phone, where German needs the most room. */
const SMALL_WIDTH = 320;
const SMALL_HEIGHT = 640;
const SMALL_PHONE = { width: SMALL_WIDTH, height: SMALL_HEIGHT };
const TARGET = 44;
const HALBERD_BONUS = 8;
const HALBERD_DAMAGE_BONUS = 4;
const D10 = 10;
const D20 = 20;
const TWO_DICE = 2;

/** The paladin as a backup file, restored on the start page. */
async function openPaladin(page: Page): Promise<void> {
  const paladin: unknown = JSON.parse(fs.readFileSync('test/characters/paladin8-warlock2.json', 'utf8'));
  const day = '2026-11-15T00:00:00.000Z';
  const backup = {
    format: 'mpmb-web-backup',
    version: 1,
    created: day,
    sheet: { type: 'Colorful - A4', version: '24.2.0' },
    characters: [
      {
        meta: {
          id: 'dice-paladin',
          name: 'Test Dice Paladin',
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
  await page.getByRole('link', { name: 'Test Dice Paladin' }).first().click();
  await expect(page.locator('button.badge').first()).toBeVisible({ timeout: STARTUP });
}

/** The card's total, its dice (struck ones too) and which are struck, read in the page. */
interface Card {
  total: number;
  dice: number[];
  dropped: number[];
  line: string;
}
const READ_CARD = `(() => {
  const card = document.querySelector('section.card');
  const num = (el) => parseInt(el.childNodes[0].textContent, 10);
  const dice = [...card.querySelectorAll('.die')];
  return {
    total: parseInt(card.querySelector('.total').textContent, 10),
    dice: dice.map(num),
    dropped: dice.filter((d) => d.classList.contains('drop')).map(num),
    line: card.querySelector('.line').textContent,
  };
})()`;
const readCard = async (page: Page): Promise<Card> => (await page.evaluate(READ_CARD)) as Card;

/** Each button in the card that is smaller than a finger, or whose text doesn't fit. */
const CARD_PROBLEMS = `(() => [...document.querySelectorAll('section.card button')]
  .filter((b) => { const r = b.getBoundingClientRect(); return r.width < ${TARGET} || r.height < ${TARGET} || b.scrollWidth > b.clientWidth + 1; })
  .map((b) => b.textContent.trim()))()`;

test('a tap on the to-hit rolls it, the card rolls the damage, a marked skill rolls two dice', async ({ page }) => {
  await page.setViewportSize(LAPTOP);
  await openPaladin(page);
  const card = page.getByRole('region', { name: 'Dice roll' });

  await page.getByRole('button', { name: '+2 Halberd attack roll +8', exact: true }).click();
  await expect(card.getByRole('heading', { name: '+2 Halberd attack roll' })).toBeVisible();
  // The number the roll came from is ringed while the card shows it (mock B).
  const hit = page.getByRole('button', { name: '+2 Halberd attack roll +8', exact: true });
  await expect(hit).toHaveAttribute('data-rolled');
  const attack = await readCard(page);
  expect(attack.dice).toHaveLength(1);
  expect(attack.total).toBe((attack.dice[0] ?? 0) + HALBERD_BONUS);
  expect(await page.evaluate(CARD_PROBLEMS)).toEqual([]);
  // After a natural 20 the damage button offers the doubled dice.
  const crit = attack.dice[0] === D20;
  await card.getByRole('button', { name: crit ? 'Critical damage 2d10+4' : 'Damage 1d10+4' }).click();
  await expect(
    card.getByRole('heading', { name: crit ? '+2 Halberd critical damage' : '+2 Halberd damage' }),
  ).toBeVisible();
  const damage = await readCard(page);
  expect(damage.dice).toHaveLength(crit ? TWO_DICE : 1);
  expect(damage.dice.every((d) => d >= 1 && d <= D10)).toBe(true);
  expect(damage.total).toBe(damage.dice.reduce((a, b) => a + b, 0) + HALBERD_DAMAGE_BONUS);
  // The damage badge rolls on its own too.
  await page.getByRole('button', { name: '+2 Halberd damage 1d10+4 Slashing' }).click();
  await expect(card.getByRole('heading', { name: '+2 Halberd damage' })).toBeVisible();

  // Stealth carries disadvantage: two dice, the higher struck, the lower counts.
  const stealth = page.locator('button.skill', { hasText: 'Stealth' });
  await stealth.click();
  await expect(card.getByRole('heading', { name: 'Stealth' })).toBeVisible();
  const check = await readCard(page);
  expect(check.dice).toHaveLength(TWO_DICE);
  expect(check.dropped).toHaveLength(1);
  expect(check.total).toBe(Math.min(...check.dice));
  expect(check.line).toContain('with disadvantage');
  await expect(page.getByText(`Stealth: ${check.total}`, { exact: true })).toBeAttached();
  // Once more with advantage: the higher counts.
  await card.getByRole('button', { name: 'Again with advantage' }).click();
  const again = await readCard(page);
  expect(again.total).toBe(Math.max(...again.dice));
  expect(again.line).toContain('with advantage');

  // Mark opens the advantage window the tap used to open; closing it hands the focus to the skill.
  await card.getByRole('button', { name: 'Mark Stealth with advantage or disadvantage' }).click();
  const window = page.getByRole('dialog', { name: 'Stealth' });
  await expect(window.getByRole('button', { name: 'Disadvantage', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(window).toHaveCount(0);
  await expect(stealth).toBeFocused();
  // Escape with no window open closes the card.
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);

  await expect(stealth).not.toHaveAttribute('data-rolled');

  // Initiative rolls from its tile. Closing the card from its own buttons hands the focus back to the tile (review
  // of #100: it fell to the top of the page), with Escape after "Again" and with ✕.
  const initiative = page.getByRole('button', { name: 'Initiative 0', exact: true });
  await initiative.click();
  await expect(card.getByRole('heading', { name: 'Initiative' })).toBeVisible();
  await expect(initiative).toHaveAttribute('data-rolled');
  await card.getByRole('button', { name: 'Roll again' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(initiative).toBeFocused();
  await initiative.click();
  await card.getByRole('button', { name: 'Close' }).focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveCount(0);
  await expect(initiative).toBeFocused();
  await initiative.click();
  await expect(card.getByRole('heading', { name: 'Initiative' })).toBeVisible();
  // Another tab closes the card: its Mark belongs to the place it was rolled from.
  await page.getByRole('tab', { name: 'Spells' }).click();
  await expect(card).toHaveCount(0);
});

test('on a phone the card sits on the tab bar and fits in German', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openPaladin(page);
  const card = page.getByRole('region', { name: 'Dice roll' });
  await page.getByRole('button', { name: '+2 Halberd attack roll +8', exact: true }).click();
  const box = await card.boundingBox();
  const bar = await page.getByRole('navigation', { name: 'Parts of the sheet' }).boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(bar?.y ?? 0);
  expect(await page.evaluate(CARD_PROBLEMS)).toEqual([]);
  // Another place from the tab bar closes the card.
  await page.getByRole('navigation', { name: 'Parts of the sheet' }).getByRole('button', { name: 'Checks' }).click();
  await expect(card).toHaveCount(0);

  // German, on the smallest phone (the app keeps the language in this browser).
  await page.setViewportSize(SMALL_PHONE);
  await page.evaluate("localStorage.setItem('mpmb-web.lang', 'de')");
  await page.reload();
  await expect(page.locator('button.badge').first()).toBeVisible({ timeout: STARTUP });
  await page.getByRole('button', { name: 'Angriffswurf +2 Halberd +8', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Würfelwurf' })).toBeVisible();
  expect(await page.evaluate(CARD_PROBLEMS)).toEqual([]);
  expect(await page.evaluate('document.documentElement.scrollWidth - innerWidth')).toBe(0);
});
