// The left column's layout (UI review 4, findings 03 and 04), measured in the browser because only real text
// widths show it: the hit dice rows share their columns, and the stat tiles are equal with one-line labels, in
// German too (its long words once widened a column and wrapped "Passive Wahrnehmung").
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Loading MPMB's scripts in a fresh browser takes a while. */
const STARTUP = 120_000;
/** Paladin, Warlock and the added third kind. */
const HIT_DICE_KINDS = 3;
/** AC, initiative, speed, proficiency, spell save DC and passive perception. */
const TILES = 6;
/** In line heights: a label taller than this has wrapped. */
const ONE_LINE = 1.5;

/** What the page measures: each dice row's −, count and + x, and each stat tile. */
interface Layout {
  dice: number[][];
  tiles: { label: string; width: number; oneLine: boolean; cut: boolean }[];
}

/**
 * Runs in the page, as a string because these e2e files are type-checked without the DOM's types (phone.spec.ts
 * does the same). A label has wrapped when it is taller than one and a half lines; it is cut when the ellipsis shows.
 */
const LAYOUT = `(() => {
  const x = (el) => Math.round(el ? el.getBoundingClientRect().x : -1);
  const dice = [...document.querySelectorAll('.dice .stepper')].map((stepper) => {
    const buttons = stepper.querySelectorAll('button');
    return [x(buttons[0]), x(stepper.querySelector('b')), x(buttons[buttons.length - 1])];
  });
  const tiles = [...document.querySelectorAll('.tiles:not(.form) > .tile')].map((tile) => {
    const label = tile.querySelector('.k');
    return {
      label: label.textContent,
      width: Math.round(tile.getBoundingClientRect().width),
      oneLine: label.getBoundingClientRect().height < parseFloat(getComputedStyle(label).lineHeight) * ${ONE_LINE},
      cut: label.scrollWidth > label.clientWidth,
    };
  });
  return { dice, tiles };
})()`;

/** The dice rows' −, count and + share their x; the tiles are one width, their labels one line and not cut. */
async function checkLayout(page: Page, lang: string): Promise<void> {
  await expect(page.locator('.dice .stepper')).toHaveCount(HIT_DICE_KINDS, { timeout: STARTUP });
  await expect(page.locator('.dice')).toContainText('12/20');
  const layout = (await page.evaluate(LAYOUT)) as Layout;
  expect(layout.dice, lang).toEqual(layout.dice.map(() => layout.dice[0]));
  expect(layout.tiles.length, lang).toBeGreaterThanOrEqual(TILES);
  const want = layout.tiles.map((tile) => ({ ...tile, width: layout.tiles[0]?.width, oneLine: true, cut: false }));
  expect(layout.tiles, lang).toEqual(want);
}

test('hit dice line up and the stat tiles are equal with one-line labels, in English and German', async ({ page }) => {
  // The SRD paladin with a third kind of hit die and a long count ("12/20"), as a multiclass character may have.
  const paladin = JSON.parse(fs.readFileSync('test/characters/paladin8-warlock2.json', 'utf8')) as {
    fields: Record<string, { value: string }>;
  };
  Object.assign(paladin.fields, {
    'HD1 Level': { value: '20' },
    'HD1 Used': { value: '8' },
    'HD3 Level': { value: '3' },
    'HD3 Die': { value: '6' },
    'HD3 Used': { value: '1' },
  });
  const day = '2026-11-14T00:00:00.000Z';
  const backup = {
    format: 'mpmb-web-backup',
    version: 1,
    created: day,
    sheet: { type: 'Colorful - A4', version: '24.2.0' },
    characters: [
      {
        meta: {
          id: 'three-dice',
          name: 'Test Three Dice',
          classes: 'Paladin 20, Warlock 2, Sorcerer 3',
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
  // The character's card on the start page, whatever else it shows ("Test Three Dice · Paladin 20 …").
  await page.getByRole('link', { name: /Test Three Dice/ }).click();

  await checkLayout(page, 'en');
  // The short words on screen, the full names for screen readers.
  await expect(page.locator('.tiles')).toContainText('Pass. Perc.');
  await expect(page.locator('.tiles .sr').filter({ hasText: 'Passive Perception' })).toHaveCount(1);
  await page.evaluate(() => localStorage.setItem('mpmb-web.lang', 'de'));
  await page.reload();
  await checkLayout(page, 'de');
});
