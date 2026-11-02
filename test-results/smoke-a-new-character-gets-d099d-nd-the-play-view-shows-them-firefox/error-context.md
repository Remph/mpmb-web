# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> a new character gets a class, armour and a weapon, and the play view shows them
- Location: e2e/smoke.spec.ts:9:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('navigation', { name: 'Steps' })
Expected: visible
Timeout: 120000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('navigation', { name: 'Steps' }) with timeout 120000ms
  - waiting for getByRole('navigation', { name: 'Steps' })

```

```yaml
- banner:
  - link "MPMB Web":
    - /url: "#/"
  - button "Auf Deutsch wechseln": Deutsch
- main:
  - paragraph: MPMB Web is an unofficial fan project, not affiliated with or endorsed by MorePurpleMoreBetter (Joost Wijnen).
  - heading "Characters" [level=1]
  - link "Get the PDF sheet from MPMB (opens MPMB's website in a new tab)":
    - /url: https://www.flapkan.com/download/#charactersheets
    - text: Get the PDF
  - button "New character" [disabled]
  - button "Import PDF"
  - paragraph:
    - text: "Import a filled MPMB sheet as a PDF: Colorful A4, version 24.2.0. Add-on scripts (homebrew) in it come along. “Get the PDF” opens MPMB's website. The sheets are also on"
    - link "MPMB's Patreon":
      - /url: https://www.patreon.com/morepurplemorebetter
    - text: .
  - paragraph: No characters yet.
  - paragraph: Characters stay in this browser on this device. A backup takes them to another device.
  - button "Back up all" [disabled]
  - button "Restore a backup"
  - region "Credits":
    - paragraph: "A web version of MPMB's character sheet for D&D 5.5e (2024). In development: import, build, back up and play characters at the table."
    - heading "Credits" [level=2]
    - paragraph: Based on MorePurpleMoreBetter's Character Record Sheet (Joost Wijnen), GPL‑3.0. Not made or endorsed by MPMB.
    - paragraph: Rules content from the System Reference Document 5.2.1 by Wizards of the Coast LLC, licensed under CC‑BY‑4.0.
    - paragraph:
      - link "Source code (GPL‑3.0)":
        - /url: https://github.com/Remph/mpmb-web
      - link "Support MPMB on Patreon":
        - /url: https://www.patreon.com/morepurplemorebetter
      - link "Version 428a012 of Nov 2, 2026":
        - /url: https://github.com/Remph/mpmb-web/tree/428a01249ac64b4e6d6bdbbcf7bbba314226d064
- dialog "Source selection":
  - heading "Source selection" [level=2]
  - paragraph: Select which resources the sheet's automation should use
  - paragraph: As you are opening the sheet for the first time, please select which resources to use. It is recommended that you set the resources to use before inputting anything into the sheet. However, you can open this dialog at any time with the "Sources" button (book icon) or "Source Material" bookmark.
  - group "The Sourcebooks":
    - text: The Sourcebooks
    - paragraph: Excluded from the automation
    - tree:
      - treeitem ">> click this line to get more content <<":
        - button ">> click this line to get more content <<"
    - button "Get more"
    - button "Missing content?"
    - button ">>"
    - button ">"
    - button "<"
    - button "<<"
    - paragraph: Included in the automation
    - tree:
      - treeitem "Primary Sources" [expanded]:
        - text: Primary Sources
        - group:
          - treeitem "System Reference Document v5.2.1 (SRD'24)":
            - button "System Reference Document v5.2.1 (SRD'24)"
    - paragraph
    - button "List Source Abbreviations"
  - group "Exclude elements of the sourcebooks included above":
    - text: Exclude elements of the sourcebooks included above
    - paragraph: Use the buttons below to select what the sheet is and isn't allowed to use for each category, without having to exclude a sourcebook in its entirety. Note that if you excluded a sourcebook above, its content will not show up at all with the buttons below.
    - button "Classes/Archetypes"
    - button "Backgrounds"
    - button "Weapons/Attacks"
    - button "Magic Items"
    - button "Spells/Psionics"
    - button "Companion Options"
    - button "Player Species"
    - button "Background Features"
    - button "Ammunition"
    - button "Armor"
    - button "Feats"
    - button "Creatures"
  - paragraph: "𝑰𝒎𝒑𝒐𝒓𝒕𝒂𝒏𝒕: If something appears in multiple sources under the same name, like the Ranger class appearing in the SRD, PHB, and 'UA: Ranger, Revised', the newer included source will be used."
  - button "Apply"
  - button "Close"
```

# Test source

```ts
  1  | // A smoke test of the built app in a real browser: the start page, a new character built from scratch
  2  | // (class, armour, a weapon) and the play view showing what MPMB worked out. It catches what unit tests
  3  | // can't: the worker, the page's headers, the pop-ups and the routes working together.
  4  | import { expect, test } from '@playwright/test';
  5  | 
  6  | /** Loading MPMB's scripts on a blank sheet takes a while in a fresh browser. */
  7  | const STARTUP = 120_000;
  8  | 
  9  | test('a new character gets a class, armour and a weapon, and the play view shows them', async ({ page }) => {
  10 |   const errors: string[] = [];
  11 |   page.on('pageerror', (error) => errors.push(error.message));
  12 | 
  13 |   await page.goto('./');
  14 |   // MPMB's condition for this site: the start page says it isn't MPMB's.
  15 |   await expect(page.getByText('not affiliated with or endorsed by', { exact: false }).first()).toBeVisible();
  16 | 
  17 |   await page.getByRole('button', { name: 'New character' }).click();
  18 |   const rail = page.getByRole('navigation', { name: 'Steps' });
  19 |   // Creating a character starts the engine on a blank sheet: the slowest step.
> 20 |   await expect(rail).toBeVisible({ timeout: STARTUP });
     |                      ^ Error: expect(locator).toBeVisible() failed
  21 | 
  22 |   // Class & level: a fighter, through MPMB's own class field.
  23 |   await page.getByRole('button', { name: 'Choose a class' }).click();
  24 |   await page.getByRole('dialog').getByRole('button', { name: /^Fighter/ }).click();
  25 |   await expect(rail.getByRole('button', { name: /Class & level/ })).toContainText('Fighter 1');
  26 | 
  27 |   // Armour & weapons: chain mail gives AC 16, a longsword gets MPMB's to hit.
  28 |   await rail.getByRole('button', { name: /Armour & weapons/ }).click();
  29 |   await page.getByRole('button', { name: /No armour/ }).click();
  30 |   await page.getByRole('dialog').getByRole('button', { name: /^Chain Mail/ }).click();
  31 |   await expect(page.locator('.ac')).toContainText('16');
  32 |   await page.getByRole('button', { name: /Add a weapon/ }).first().click();
  33 |   await page.getByRole('dialog').getByRole('button', { name: /^Longsword/ }).click();
  34 |   const row = page.locator('.weapon').filter({ hasText: 'Longsword' });
  35 |   await expect(row.locator('.hit')).toHaveText(/^[+-]\d+$/);
  36 | 
  37 |   // The play view: the armour class and the attack.
  38 |   await page.getByRole('link', { name: 'Done: to the play view' }).click();
  39 |   await expect(page.locator('.attack').filter({ hasText: 'Longsword' })).toBeVisible();
  40 |   await expect(page.getByText('Armor class').locator('..')).toContainText('16');
  41 | 
  42 |   expect(errors).toEqual([]);
  43 | });
  44 | 
```