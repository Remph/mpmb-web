// A sheet's add-on scripts (homebrew): MPMB runs them when the sheet opens, so content they add is in
// the lists (pickers) and fills the sheet like MPMB's own. The add-ons here are made up for the tests
// (no game content), in MPMB's add-on syntax; real characters carry theirs in the same two fields.
import { describe, expect, test } from 'vitest';
import { addOnsOf } from '../src/engine/add-ons.ts';
import { CHARACTER_FORMAT, FORMAT_VERSION, diffCharacter } from '../src/engine/sheet-data.ts';
import type { CharacterData } from '../src/engine/sheet-data.ts';
import { blankSheet, characterSheet } from '../src/engine/sheet.ts';
import { openSheet } from './characters.ts';
import { ScriptedHost } from './hosts.ts';

/** An imported add-on file: a magic item. */
const LANTERN = `var iFileName = "Lantern of Testing.js";
RequiredSheetVersion("24.0.0");
MagicItemsList["lantern of testing"] = {
	name : "Lantern of Testing",
	source : ["HB", 0],
	type : "wondrous item",
	rarity : "common",
	description : "This lantern glows whenever a test passes.",
	descriptionFull : "This lantern glows whenever a test passes.",
	weight : 2,
};`;

/** Code pasted into MPMB's script dialog: a feat. */
const PASTED = `FeatsList["steady tester"] = {
	name : "Steady Tester",
	type : "general",
	source : ["HB", 0],
	description : "I check my work twice.",
	descriptionFull : "You check your work twice.",
};`;

const LANTERN_FILE = '2026/10/29 - Lantern of Testing.js';

/** A character whose sheet carries these add-ons, as MPMB stores them (toSource of an object). */
function sheetWith(files: Record<string, string>, pasted = ''): CharacterData {
  const blank = blankSheet();
  return {
    format: CHARACTER_FORMAT,
    version: FORMAT_VERSION,
    info: blank.info,
    numPages: blank.numPages,
    fields: {
      // A sheet that was used before: MPMB's welcome text and source selection don't open.
      'Opening Remember': { value: 'Yes' },
      'User_Imported_Files.Stringified': { value: `(${JSON.stringify(files)})` },
      'User Script': { value: pasted },
    },
  };
}

describe('add-on scripts in a sheet', () => {
  test('run when the sheet opens, and what they add fills the sheet', () => {
    const engine = openSheet(characterSheet(sheetWith({ [LANTERN_FILE]: LANTERN }, PASTED)));
    expect(engine.stats.errors).toEqual([]);
    expect(addOnsOf(engine)).toEqual({ files: [LANTERN_FILE], manual: true });

    engine.edit('Extra.Magic Item 1', 'Lantern of Testing');
    expect(engine.doc.states.get('Extra.Magic Item Description 1')?.value).toBe(
      'This lantern glows whenever a test passes.',
    );
    engine.edit('Feat Name 1', 'Steady Tester');
    expect(engine.doc.states.get('Feat Description 1')?.value).toBe('I check my work twice.');
  });

  test('travel with the saved character and run again when it reopens', () => {
    const first = openSheet(characterSheet(sheetWith({ [LANTERN_FILE]: LANTERN })));
    first.edit('Extra.Magic Item 1', 'Lantern of Testing');
    const saved = diffCharacter(blankSheet(), first.snapshot());

    const host = new ScriptedHost();
    const again = openSheet(characterSheet(JSON.parse(JSON.stringify(saved)) as CharacterData), host);
    expect(again.stats.errors).toEqual([]);
    expect(host.asked).toEqual([]);
    expect(addOnsOf(again)).toEqual({ files: [LANTERN_FILE], manual: false });
    expect(again.evaluate('MagicItemsList["lantern of testing"].name')).toBe('Lantern of Testing');
    expect(again.doc.states.get('Extra.Magic Item Description 1')?.value).toBe(
      'This lantern glows whenever a test passes.',
    );
  });

  test('a broken add-on file is reported and dropped, like in Acrobat', () => {
    const host = new ScriptedHost();
    const engine = openSheet(
      characterSheet(sheetWith({ [LANTERN_FILE]: LANTERN, '2026/10/29 - broken.js': 'MagicItemsList[ = 1;' })),
      host,
    );
    expect(host.asked.map((a) => a.what)).toEqual([expect.stringContaining('"2026/10/29 - broken.js" is faulty')]);
    expect(addOnsOf(engine).files).toEqual([LANTERN_FILE]);
    expect(engine.doc.states.get('User_Imported_Files.Stringified')?.value).not.toContain('broken');
  });

  test('a sheet without add-ons has none', () => {
    expect(addOnsOf(openSheet())).toEqual({ files: [], manual: false });
  });
});
