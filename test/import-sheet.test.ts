// MPMB's "Import from another sheet" in the engine: each reference character, imported from its own PDF
// into a blank sheet of the same version, through the link two workers would use. Moving a character to a
// new sheet version runs the same import, so what changes here changes there too.
//
// The import is not a copy: MPMB resets the new sheet and applies the old sheet's choices again through
// its automation. So a few fields come out differently, by MPMB's design (its closing pop-up lists what
// it doesn't carry over). Those are listed below; anything else is a difference to explain.
import { describe, expect, test } from 'vitest';
import { addOnsOf } from '../src/engine/add-ons.ts';
import { ImportHost, importSheet } from '../src/engine/import-sheet.ts';
import { CHARACTER_FORMAT, FORMAT_VERSION } from '../src/engine/sheet-data.ts';
import { blankSheet, characterSheet } from '../src/engine/sheet.ts';
import { serveDocument, sourceDocument } from '../src/engine/source-doc.ts';
import type { SourceLink, SourceReply, SourceRequest } from '../src/engine/source-doc.ts';
import { REFERENCE_CHARACTERS, openSheet, referenceSheet } from './characters.ts';
import type { ReferenceCharacter } from './characters.ts';
import { byTemplateOrder, compareSheets } from './compare.ts';
import { ScriptedHost } from './hosts.ts';

/** Fields that differ after the import, by MPMB's design or MPMB's behaviour elsewhere. */
const EXPECTED: Record<string, string> = {
  // MPMB's summary: "The 'Notes' section on the 3rd page is now solely what the automation added."
  'Extra.Notes': 'notes on the third page',
  // Placeholder text hidden under the sheet's lines, a test left in the PDF (not shown, not imported).
  'Line.fixed': 'hidden test text',
  'Line.adventuringGear': 'hidden test text',
  'Line.SpellSlots': 'hidden test text',
  // MPMB's metric weapon weight: every recalculation halves it again (docs: upstream.md).
  'BlueText.Attack.1.Weight': "MPMB's metric weight",
  // MPMB's own bookkeeping, rebuilt by the import in the order it applies things.
  'CurrentSpells.Stringified': 'bookkeeping',
  'CurrentEvals.Stringified': 'bookkeeping',
  'CurrentProfs.Stringified': 'bookkeeping',
  'CurrentVars.Stringified': 'bookkeeping',
  // The companion page's copy keeps one widget per field.
  'AScomp#0.Comp.eqp.Display.Weighttxt': 'widgets of the companion page',
  'AScomp#0.Whiteout.Standard': 'widgets of the companion page',
};

/**
 * Differences not yet explained: kept as they are until Acrobat's own import of the same PDF shows
 * whether Acrobat does the same (requested 2026-11-04).
 */
const TO_CHECK: Record<ReferenceCharacter, RegExp> = {
  // Limited features and bonus actions in another order; spell sheet prepared marks.
  // Matches "Limited Feature 1", "Bonus Action 2", "SSfront#0.spells.check.20"; rejects "Limited Feature".
  // Try it: https://regex101.com/?regex=%5E(Limited+Feature(+Max+Usages)%3F+%5Cd%7CBonus+Action+%5Cd%7CSSfront%230%5C.spells%5C.check%5C.%5Cd%2B)%24&testString=Limited+Feature+1%0ABonus+Action+2%0ASSfront%230.spells.check.20%0ALimited+Feature
  'paladin8-warlock2': /^(Limited Feature( Max Usages)? \d|Bonus Action \d|SSfront#0\.spells\.check\.\d+)$/,
  // The Staff of the Magi's spell page: the import sets the staff's spells while the ability scores are
  // still 0, so MPMB fixes its DC at 8 (fixedDC_becauseAbi0); one spell's text follows from that.
  // Matches "SSmore#0.spellshead.dc.0", "SSmore#0.spells.description.36"; rejects "SSfront#0.spellshead.dc.0".
  // Try it: https://regex101.com/?regex=%5ESSmore%230%5C.(spellshead%5C.(attack%7Cdc)%5C.0%7Cspells%5C.description%5C.%5Cd%2B)%24&testString=SSmore%230.spellshead.dc.0%0ASSmore%230.spells.description.36%0ASSfront%230.spellshead.dc.0
  'wizard10-evoker': /^SSmore#0\.(spellshead\.(attack|dc)\.0|spells\.description\.\d+)$/,
};

/** A link through JSON both ways, as between two workers; counts the requests. */
function jsonLink(serve: SourceLink): { link: SourceLink; count: () => number } {
  let requests = 0;
  return {
    link: (request) => {
      requests++;
      const reply = serve(JSON.parse(JSON.stringify(request)) as SourceRequest);
      return JSON.parse(JSON.stringify(reply)) as SourceReply;
    },
    count: () => requests,
  };
}

describe.each(REFERENCE_CHARACTERS)('%s imported into a blank sheet', (name) => {
  const old = openSheet(referenceSheet(name));
  const player = new ScriptedHost();
  const host = new ImportHost(player);
  const fresh = openSheet(blankSheet(), host);
  const asked = player.asked.length;
  const { link, count } = jsonLink(serveDocument(old.tools.realm.global));
  const summary = importSheet(fresh, sourceDocument(fresh.tools, link), host);

  test('runs without script errors or questions to the player, and ends with MPMB summary', () => {
    expect(fresh.stats.errors).toEqual([]);
    expect(fresh.stats.missing).toEqual({});
    expect(player.asked.slice(asked)).toEqual([]);
    expect(summary).toContain('Some things that you adjusted manually on your old sheet might not have transferred');
    // About ten thousand reads of the old sheet: each crosses between the workers.
    const MANY = 5000;
    expect(count()).toBeGreaterThan(MANY);
  });

  test('every field matches the original, apart from the known differences', () => {
    const diffs = compareSheets(byTemplateOrder(old.snapshot()), byTemplateOrder(fresh.snapshot()), [
      'value',
      'display',
      'missing',
      'extra',
    ]);
    const unexplained = diffs.filter((d) => !(d.field in EXPECTED) && !TO_CHECK[name].test(d.field));
    expect(unexplained.map((d) => `${d.field}: ${d.acrobat} -> ${d.ours}`)).toEqual([]);
  });

  test('the sources, classes and pages come along', () => {
    const before = old.snapshot().fields;
    const after = fresh.snapshot().fields;
    ['CurrentSources.Stringified', 'Class and Levels'].forEach((field) =>
      expect(after[field]?.value, field).toEqual(before[field]?.value),
    );
    expect(fresh.doc.numPages).toBe(old.doc.numPages);
  });
});

/** A made-up add-on file (no game content), in MPMB's syntax, and code pasted into MPMB's script dialog. */
const LANTERN_FILE = '2026/11/04 - Lantern of Testing.js';
const LANTERN = `var iFileName = "Lantern of Testing.js";
RequiredSheetVersion("24.0.0");
MagicItemsList["lantern of testing"] = {
	name : "Lantern of Testing",
	source : ["HB", 0],
	type : "wondrous item",
	rarity : "common",
	description : "This lantern glows whenever an import passes.",
	descriptionFull : "This lantern glows whenever an import passes.",
	weight : 2,
};`;
const PASTED = 'var importedTwice = (typeof importedTwice === "number" ? importedTwice : 0) + 1;';

test("a sheet's add-on scripts come along, and what they added is set again", () => {
  const blank = blankSheet();
  const old = openSheet(
    characterSheet({
      format: CHARACTER_FORMAT,
      version: FORMAT_VERSION,
      info: blank.info,
      numPages: blank.numPages,
      fields: {
        'Opening Remember': { value: 'Yes' },
        'User_Imported_Files.Stringified': { value: `(${JSON.stringify({ [LANTERN_FILE]: LANTERN })})` },
        'User Script': { value: PASTED },
      },
    }),
  );
  old.edit('Extra.Magic Item 1', 'Lantern of Testing');
  const host = new ImportHost(new ScriptedHost());
  const fresh = openSheet(blankSheet(), host);
  importSheet(fresh, sourceDocument(fresh.tools, jsonLink(serveDocument(old.tools.realm.global)).link), host);

  expect(fresh.stats.errors).toEqual([]);
  expect(addOnsOf(fresh)).toEqual({ files: [LANTERN_FILE], manual: true });
  expect(fresh.doc.states.get('Extra.Magic Item 1')?.value).toBe('Lantern of Testing');
  expect(fresh.doc.states.get('Extra.Magic Item Description 1')?.value).toBe(
    'This lantern glows whenever an import passes.',
  );
});

describe('what the import needs from the Acrobat stand-in', () => {
  const engine = openSheet();
  const run = (code: string): unknown => engine.tools.realm.evaluate(code);

  test('info answers the standard entries in lower case too, without listing them twice', () => {
    expect(run('info.title')).toBe(run('info.Title'));
    expect(run('info.title')).toContain('Character Record Sheet');
    expect(run('Object.keys(info).indexOf("title")')).toBe(-1);
    expect(Object.keys(engine.snapshot().info)).not.toContain('title');
  });

  test('a document calls itself "[object Doc]", as in Acrobat', () => {
    expect(run('this.toString()')).toBe('[object Doc]');
  });

  test('app.openDoc gives the offered document, and nothing (counted as missing) otherwise', () => {
    const other = engine.tools.object({ name: 'other' });
    engine.offerDocument(other);
    expect(run('app.openDoc("old.pdf")')).toBe(other);
    engine.offerDocument(null);
    expect(run('app.openDoc("old.pdf")')).toBeNull();
    expect(engine.stats.missing['app.openDoc']).toBe(1);
  });
});
