/* eslint-disable ts-patterns/no-magic-numbers -- sizes, values and answers are the test data */
// The Acrobat stand-in on a tiny made-up sheet: event order, calculation order, check boxes,
// document-level scripts, pop-ups, timers and templates. The reference characters test the same
// things at full size (test/reference.test.ts); these name the rules one by one.
import { describe, expect, test } from 'vitest';
import { ScriptedHost } from '../../test/hosts.ts';
import type { ScriptedAnswers } from '../../test/hosts.ts';
import { vmRealm } from '../../test/vm-realm.ts';
import { Engine } from './engine.ts';
import type { FieldDef, SheetSnapshot, Trigger } from './types.ts';
import { AF, FF } from './types.ts';

const PAGE_ONE = 0;
const TEMPLATE_PAGE = -1;
const RECT = [0, 0, 100, 20];

/** A script that logs its event: "Validate A 3". */
const logs = (extra = ''): string => `log.push(event.name + " " + event.target.name + " " + event.value); ${extra}`;

const field = (actions: Partial<Record<Trigger, string>>, more: Partial<FieldDef> = {}): FieldDef => ({
  type: 'Tx',
  flags: 0,
  actions,
  value: '',
  widgets: [{ page: PAGE_ONE, rect: RECT, flags: AF.print }],
  ...more,
});

const sheet = (): SheetSnapshot => ({
  fields: {
    A: field({ Fo: logs(), K: logs(), V: logs('if (event.value === "bad") event.rc = false;'), F: logs(), Bl: logs() }),
    Double: field({ C: logs('event.value = Number(this.getField("A").value) * 2;'), F: logs() }),
    PlusOne: field({ C: logs('event.value = Number(this.getField("Double").value) + 1;') }),
    Box: field(
      { D: 'log.push("down " + event.target.isBoxChecked(0));', A: 'log.push("up " + event.target.isBoxChecked(0));' },
      { type: 'Btn', value: 'Off', widgets: [{ page: PAGE_ONE, rect: RECT, flags: AF.print, on: 'Yes' }] },
    ),
    Button: field({ A: 'askAndRemember();' }, { type: 'Btn', flags: FF.pushButton }),
    Note: field({}, { widgets: [{ page: TEMPLATE_PAGE, rect: RECT, flags: AF.print }] }),
  },
  calcOrder: ['Double', 'PlusOne'],
  numPages: 1,
  templates: { Extra: ['Note'] },
  outline: [],
  info: {},
});

const DOCUMENT_SCRIPT = `
var log = [];
function setA(v) { this.getField("A").value = v; }
function askAndRemember() {
  var answer = app.alert({ cMsg: "Really?", nType: 2 });
  var dialog = {
    description: { name: "NAME DIALOG", elements: [{ type: "edit_text", item_id: "name" }, { type: "ok_cancel" }] },
    initialize: function (d) { d.load({ name: "Anna" }); },
    commit: function (d) { this.name = d.store().name; },
  };
  var result = app.execDialog(dialog);
  log.push("alert " + answer + ", dialog " + result + " " + dialog.name);
}
`;

const load = (answers: ScriptedAnswers = {}): Engine =>
  Engine.load({
    sheet: sheet(),
    scripts: [{ name: 'Test', code: DOCUMENT_SCRIPT }],
    host: new ScriptedHost(answers),
    realm: vmRealm(),
  });

const takeLog = (engine: Engine): string[] => engine.evaluate('log.splice(0, log.length)') as string[];

describe('typing into a field', () => {
  test('runs focus, keystrokes, validate, the calculation order, format and blur, in Acrobat order', () => {
    const engine = load();
    engine.edit('A', '3');
    expect(takeLog(engine)).toEqual([
      'Focus A ',
      'Keystroke A ',
      'Keystroke A 3',
      'Validate A 3',
      'Calculate Double ',
      // A calculation that changes its field shows the new value right away.
      'Format Double 6',
      'Calculate PlusOne ',
      'Format A 3',
      'Blur A 3',
    ]);
    expect(engine.values()).toMatchObject({ A: '3', Double: '6', PlusOne: '7' });
  });

  test('a value that validate rejects is not stored and nothing is calculated', () => {
    const engine = load();
    engine.edit('A', 'bad');
    expect(takeLog(engine)).not.toContain('Calculate Double ');
    expect(engine.values().A).toBe('');
  });

  test('a document script that sets a value: validate, calculations, format, but no keystrokes', () => {
    const engine = load();
    engine.evaluate('setA(5)');
    expect(takeLog(engine)).toEqual([
      'Validate A 5',
      'Calculate Double ',
      'Format Double 10',
      'Calculate PlusOne ',
      'Format A 5',
    ]);
  });

  test('field values that look like numbers come back as numbers', () => {
    const engine = load();
    engine.edit('A', '4');
    expect(engine.evaluate('typeof this.getField("A").value')).toBe('number');
    engine.edit('A', '4a');
    expect(engine.evaluate('typeof this.getField("A").value')).toBe('string');
  });
});

describe('calculations', () => {
  test('switched off with calculate = false, and calculateNow runs them anyway', () => {
    const engine = load();
    engine.evaluate('this.calculate = false; setA(2)');
    expect(engine.values().Double).toBe('');
    engine.evaluate('this.calculateNow()');
    expect(engine.values()).toMatchObject({ Double: '4', PlusOne: '5' });
  });
});

describe('buttons', () => {
  test('a check box changes between MouseDown and MouseUp', () => {
    const engine = load();
    engine.click('Box');
    // The new state is stored (and the calculations run) before MouseUp.
    expect(takeLog(engine)).toEqual(['down 0', 'Calculate Double ', 'Format Double 0', 'Calculate PlusOne ', 'up 1']);
    expect(engine.values().Box).toBe('Yes');
    engine.click('Box');
    expect(engine.values().Box).toBe('Off');
  });

  test('alerts and dialogs go to the host, and the script reads the answers', () => {
    const engine = load({ alerts: { Really: 4 }, dialogs: { 'NAME DIALOG': { steps: [{ set: { name: 'Bea' } }] } } });
    engine.click('Button');
    expect(takeLog(engine)).toEqual(['alert 4, dialog ok Bea']);
  });

  test('a dialog the user cancels does not commit', () => {
    const engine = load({ dialogs: { 'NAME DIALOG': { close: 'cancel' } } });
    engine.click('Button');
    expect(takeLog(engine)).toEqual(['alert 3, dialog cancel undefined']);
  });
});

describe('timers', () => {
  test('app.setTimeOut runs after the user action, in due order', () => {
    const engine = load();
    engine.evaluate('app.setTimeOut("log.push(\\"late\\")", 500); app.setTimeOut("log.push(\\"soon\\")", 10);');
    expect(engine.pendingTimers()).toHaveLength(2);
    engine.runTimers();
    expect(takeLog(engine)).toEqual(['soon', 'late']);
  });
});

describe('templates and pages', () => {
  test('spawning with renaming adds a page with copies of the template fields', () => {
    const engine = load();
    engine.evaluate('this.getTemplate("Extra").spawn(1, true, false)');
    expect(engine.evaluate('this.numPages')).toBe(2);
    expect(engine.evaluate('this.getField("P1.Extra.Note").page')).toBe(1);
    engine.evaluate('this.deletePages(1)');
    expect(engine.evaluate('this.numPages')).toBe(1);
    expect(engine.evaluate('this.getField("P1.Extra.Note")')).toBeNull();
  });
});
