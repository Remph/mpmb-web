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

/** The newer version of LANTERN_FILE: same script name, another text. */
const LANTERN_V2 = LANTERN.replace('glows whenever a test passes', 'glows brighter whenever a test passes');

/** MPMB's dialog for script files, as Acrobat draws it (ImportScriptFileDialog). */
const FILES_DIALOG = 'IMPORT CUSTOM SCRIPT DIALOG';
const ADD_FILE = { click: 'bAdd' };

/**
 * The Sheet menu's "Add-on scripts": MPMB's own menu ("Import a file ..."), then its dialog with the
 * player's steps (the host's answers), then Apply ("ok"). MPMB runs the scripts, says so, and opens its
 * Source Selection, which the host closes with OK.
 */
function addOnDialog(engine: ReturnType<typeof openSheet>): void {
  engine.clickBookmark(['Functions', 'Add Extra Materials']);
  engine.runTimers();
}

describe('add-on files through MPMB’s own import dialog', () => {
  const opened = (answers: ConstructorParameters<typeof ScriptedHost>[0], files: Record<string, string> = {}) => {
    const host = new ScriptedHost({ menus: [['Import a file']], ...answers });
    return { host, engine: openSheet(characterSheet(sheetWith(files)), host) };
  };

  test('"Add file" opens the picker, and Apply runs the file: what it adds is in the lists', () => {
    const { host, engine } = opened({ files: [LANTERN], dialogs: { [FILES_DIALOG]: { steps: [ADD_FILE] } } });
    addOnDialog(engine);
    // As in Acrobat: the dialog, the "Open" window, MPMB's "Success!", then its Source Selection.
    expect(host.asked.map((a) => (a.kind === 'dialog' ? a.what : a.kind))).toEqual([
      'menu',
      FILES_DIALOG,
      'file',
      'alert',
      'SOURCE SELECTION DIALOG',
    ]);
    expect(addOnsOf(engine).files).toEqual([expect.stringMatching(/^\d{4}\/\d\d\/\d\d - Lantern of Testing\.js$/)]);
    expect(engine.stats.errors).toEqual([]);
    engine.edit('Extra.Magic Item 1', 'Lantern of Testing');
    expect(engine.doc.states.get('Extra.Magic Item Description 1')?.value).toBe(
      'This lantern glows whenever a test passes.',
    );
  });

  test('a cancelled picker adds nothing', () => {
    const { host, engine } = opened({ files: [null], dialogs: { [FILES_DIALOG]: { steps: [ADD_FILE] } } });
    addOnDialog(engine);
    expect(addOnsOf(engine).files).toEqual([]);
  });

  test('a file with the same script name replaces the old one after MPMB asks', () => {
    const { host, engine } = opened(
      {
        files: [LANTERN_V2],
        alerts: { 'do you want to overwrite it': 4 },
        dialogs: { [FILES_DIALOG]: { steps: [ADD_FILE] } },
      },
      { [LANTERN_FILE]: LANTERN },
    );
    addOnDialog(engine);
    expect(addOnsOf(engine).files).toEqual([expect.stringMatching(/ - Lantern of Testing\.js$/)]);
    expect(engine.evaluate('MagicItemsList["lantern of testing"].description')).toBe(
      'This lantern glows brighter whenever a test passes.',
    );
  });

  test('a file removed in the dialog is gone after Apply', () => {
    const remove = [{ set: { scrF: { [LANTERN_FILE]: 1 } }, click: 'scrF' }, { click: 'bRem' }];
    const { host, engine } = opened({ dialogs: { [FILES_DIALOG]: { steps: remove } } }, { [LANTERN_FILE]: LANTERN });
    addOnDialog(engine);
    expect(addOnsOf(engine).files).toEqual([]);
    expect(engine.evaluate('MagicItemsList["lantern of testing"] === undefined')).toBe(true);
  });
});
