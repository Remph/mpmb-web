// What a sheet update changed (src/engine/sheet-changes.ts) and the names the update window gives it
// (src/views/update/labels.ts), on both SRD reference characters imported into a blank sheet the way the app
// updates a character.
import { describe, expect, test } from 'vitest';
import { ImportHost, importSheet } from '../src/engine/import-sheet.ts';
import { fieldValues, sheetChanges } from '../src/engine/sheet-changes.ts';
import type { FieldValues } from '../src/engine/sheet-changes.ts';
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
  test('the paladin: nothing; its limited features and bonus actions only moved, its notes came along', () => {
    expect(updated('paladin8-warlock2')).toEqual([]);
  });

  test("the wizard: the Staff of the Magi's spell page", () => {
    expect(updated('wizard10-evoker').map((c) => c.field)).toEqual([
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

describe('lists compared by their rows', () => {
  const feature = (n: number, name: string, uses: string, recovery = 'long rest'): FieldValues => ({
    [`Limited Feature ${n}`]: name,
    [`Limited Feature Max Usages ${n}`]: uses,
    [`Limited Feature Recovery ${n}`]: recovery,
    [`Limited Feature Used ${n}`]: '',
  });
  const empty = (n: number): FieldValues => feature(n, '', '', '');

  test('rows in another order are no change', () => {
    const before = { ...feature(1, 'Lay on Hands', '40'), ...feature(2, 'Channel Divinity', '2') };
    const now = { ...feature(1, 'Channel Divinity', '2'), ...feature(2, 'Lay on Hands', '40') };
    expect(sheetChanges(before, now)).toEqual([]);
    expect(
      sheetChanges({ 'Bonus Action 1': 'A', 'Bonus Action 2': 'B' }, { 'Bonus Action 1': 'B', 'Bonus Action 2': 'A' }),
    ).toEqual([]);
  });

  test('a row that went comes first, then changed and new rows, each as one entry', () => {
    const before = {
      ...feature(1, 'Lay on Hands', '40'),
      ...feature(2, 'Channel Divinity', '2'),
      ...empty(3),
      Speed: '30 ft',
    };
    const now = {
      ...feature(1, 'Channel Divinity', '3'),
      ...feature(2, 'Divine Sense', '1'),
      ...empty(3),
      Speed: '35 ft',
    };
    expect(sheetChanges(before, now)).toEqual([
      { field: 'Limited Feature 1', before: 'Lay on Hands · 40 · long rest', now: '' },
      {
        field: 'Limited Feature 1',
        before: 'Channel Divinity · 2 · long rest',
        now: 'Channel Divinity · 3 · long rest',
      },
      { field: 'Limited Feature 2', before: '', now: 'Divine Sense · 1 · long rest' },
      { field: 'Speed', before: '30 ft', now: '35 ft' },
    ]);
  });

  test('two rows of the same name are matched one by one', () => {
    const before = { 'Reaction 1': 'Opportunity Attack', 'Reaction 2': 'Opportunity Attack' };
    const now = { 'Reaction 1': 'Opportunity Attack', 'Reaction 2': '' };
    expect(sheetChanges(before, now)).toEqual([{ field: 'Reaction 2', before: 'Opportunity Attack', now: '' }]);
  });

  test('entries that became empty come first', () => {
    expect(sheetChanges({ A: '1', B: '2', C: '3' }, { A: 'x', B: '', C: '' }).map((c) => c.field)).toEqual([
      'B',
      'C',
      'A',
    ]);
  });
});

describe('names in the update window', () => {
  test.each([
    ['Limited Feature 3', 'Begrenztes Merkmal 3', 'Limited feature 3'],
    ['Limited Feature Max Usages 3', 'Begrenztes Merkmal 3: Anwendungen', 'Limited feature 3: uses'],
    ['Bonus Action 2', 'Bonusaktion 2', 'Bonus action 2'],
    ['Action 2', 'Aktion 2', 'Action 2'],
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
