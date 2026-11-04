// What a sheet update changed (src/engine/sheet-changes.ts) and the names the update window gives it
// (src/views/update/labels.ts), on both SRD reference characters imported into a blank sheet the way the app
// updates a character.
import { describe, expect, test } from 'vitest';
import { ImportHost, importSheet } from '../src/engine/import-sheet.ts';
import { fieldValues, sheetChanges } from '../src/engine/sheet-changes.ts';
import { blankSheet } from '../src/engine/sheet.ts';
import { serveDocument, sourceDocument } from '../src/engine/source-doc.ts';
import type { SourceReply, SourceRequest } from '../src/engine/source-doc.ts';
import { ui } from '../src/i18n.ts';
import { changeLabel } from '../src/views/update/labels.ts';
import { openSheet, referenceSheet } from './characters.ts';
import type { ReferenceCharacter } from './characters.ts';
import { ScriptedHost } from './hosts.ts';

/** The reference character updated onto a blank sheet: the entries the update window would list. */
function updated(name: ReferenceCharacter): { field: string; before: string; now: string }[] {
  const old = openSheet(referenceSheet(name));
  const host = new ImportHost(new ScriptedHost());
  const fresh = openSheet(blankSheet(), host);
  const serve = serveDocument(old.tools.realm.global, old.tools.copy);
  const link = (request: SourceRequest): SourceReply =>
    JSON.parse(JSON.stringify(serve(JSON.parse(JSON.stringify(request)) as SourceRequest))) as SourceReply;
  importSheet(fresh, sourceDocument(fresh.tools, link), host);
  return sheetChanges(fieldValues(old.snapshot()), fieldValues(fresh.snapshot()));
}

describe('what an update changed', () => {
  test('the paladin: its notes, and limited features and bonus actions in another order', () => {
    const changes = updated('paladin8-warlock2');
    expect(changes.map((c) => c.field)).toEqual([
      'Extra.Notes',
      'Limited Feature 1',
      'Limited Feature Max Usages 1',
      'Limited Feature 2',
      'Limited Feature Max Usages 2',
      'Limited Feature 3',
      'Limited Feature Max Usages 3',
      'Limited Feature 4',
      'Limited Feature Max Usages 4',
      'Limited Feature 5',
      'Bonus Action 1',
      'Bonus Action 2',
      'Bonus Action 3',
    ]);
    expect(changes[0]).toEqual({ field: 'Extra.Notes', before: 'Test Notes', now: '' });
  });

  test("the wizard: its notes and the Staff of the Magi's spell page", () => {
    expect(updated('wizard10-evoker').map((c) => c.field)).toEqual([
      'Extra.Notes',
      'SSmore#0.spellshead.attack.0',
      'SSmore#0.spellshead.dc.0',
      'SSmore#0.spells.description.36',
    ]);
  });

  test('unchecked boxes and empty fields count as the same; hidden and bookkeeping fields are left out', () => {
    const sheet = blankSheet();
    const values = fieldValues(sheet);
    expect(Object.keys(values).some((name) => name.endsWith('.Stringified') || name.startsWith('Line.'))).toBe(false);
    // The blank sheet's check boxes are "Off": read as empty, like a field the other sheet doesn't have.
    expect(Object.values(values)).not.toContain('Off');
    expect(sheetChanges({ Box: '', Text: '' }, { Text: '' })).toEqual([]);
    expect(sheetChanges({ Box: '' }, { Box: 'Yes' })).toEqual([{ field: 'Box', before: '', now: 'Yes' }]);
    // The sheet's own version number in a text is the update itself, not a change to check.
    const info = { before: 'Character Record Sheet v24.1.0', now: 'Character Record Sheet v24.2.0' };
    const versions = { from: '24.1.0', to: '24.2.0' };
    expect(sheetChanges({ Info: info.before }, { Info: info.now }, versions)).toEqual([]);
    expect(sheetChanges({ Info: info.before }, { Info: info.now })).toHaveLength(1);
  });
});

describe('names in the update window', () => {
  test.each([
    ['Limited Feature 3', 'Begrenztes Merkmal 3', 'Limited feature 3'],
    ['Limited Feature Max Usages 3', 'Begrenztes Merkmal 3: Anwendungen', 'Limited feature 3: uses'],
    ['Bonus Action 2', 'Bonusaktion 2', 'Bonus action 2'],
    ['Reaction 1', 'Reaktion 1', 'Reaction 1'],
    ['SSmore#0.spellshead.dc.0', 'Zauberblatt: Rettungswurf-SG', 'Spell sheet: save DC'],
    ['SSmore#0.spellshead.attack.0', 'Zauberblatt: Zauberangriff', 'Spell sheet: spell attack'],
    ['SSmore#0.spells.description.36', 'Zauberblatt: Zaubertext', 'Spell sheet: spell text'],
    ['Extra.Notes', 'Notizen (Bogenseite 3)', 'Notes (sheet page 3)'],
    ['Class Features', 'Klassenmerkmale', 'Class features'],
    ['AC Misc Mod 1', 'AC Misc Mod 1', 'AC Misc Mod 1'],
  ])('%s', (field, de, en) => {
    expect(changeLabel(field, ui.de)).toBe(de);
    expect(changeLabel(field, ui.en)).toBe(en);
  });
});
