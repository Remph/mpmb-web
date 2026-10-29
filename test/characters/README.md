# Reference characters

Two characters made in Adobe Acrobat on MPMB's Colorful A4 sheet v24.2.0, with SRD 5.2.1 content
only and no imported add-on scripts (the sheet's `User Script` field is empty). The engine must
reproduce what Acrobat saved; `test/reference.test.ts` and `test/typed.test.ts` check that.

| File                     | Character                                                       |
| ------------------------ | --------------------------------------------------------------- |
| `paladin8-warlock2.json` | Paladin 8 (Oath of Devotion), Warlock 2 (Fiend Patron), 7 pages |
| `wizard10-evoker.json`   | Wizard 10 (Evoker), Staff of the Magi, spell sheets, 9 pages    |

The files hold only what differs from the blank sheet (`src/engine/data/colorful-a4.json`), made
with `node tools/extract-character.ts <character.pdf> <out.json>`. The sheet is MPMB's work under
GPL-3.0 (see `vendor/README.md`); the game content is from the SRD 5.2.1 (CC-BY-4.0).
