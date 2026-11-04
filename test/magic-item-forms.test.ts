// A magic item that comes in several forms (adamantine armor: chain mail, full plate …): MPMB asks
// which one when the item is chosen. The app's Magic items window writes the name as a cancelable edit
// (Engine.edit), so closing that question cancels the add or swap and leaves the row as it was.
import { describe, expect, test } from 'vitest';
import { blankSheet } from '../src/engine/sheet.ts';
import { openSheet } from './characters.ts';
import { ScriptedHost } from './hosts.ts';
import type { ScriptedAnswers } from './hosts.ts';

const ITEM = 'Extra.Magic Item 1';
const DESCRIPTION = 'Extra.Magic Item Description 1';
const FORM_QUESTION = 'ASK USER DIALOG';
const CANCEL: ScriptedAnswers = { dialogs: { [FORM_QUESTION]: { close: 'cancel' } } };

function sheet(answers: ScriptedAnswers = {}) {
  const host = new ScriptedHost(answers);
  const engine = openSheet(blankSheet(), host);
  // Opening asks its own questions (welcome, sources): only what the edits ask counts.
  host.asked.length = 0;
  return { engine, host };
}

const value = (engine: ReturnType<typeof sheet>['engine'], name: string) => engine.doc.states.get(name)?.value;
/**
 * Every field as the app shows it (trimmed). Undoing the half-applied Armor of Resistance leaves a space in
 * its resistance field where removing a fully applied one leaves it empty: MPMB's removal, not ours.
 */
const shown = (engine: ReturnType<typeof sheet>['engine']) =>
  Object.fromEntries(Object.entries(engine.values()).map(([name, v]) => [name, Array.isArray(v) ? v : v.trim()]));
const known = (engine: ReturnType<typeof sheet>['engine']) =>
  engine.evaluate('CurrentMagicItems.known[0] + "|" + CurrentMagicItems.choices[0]');

describe('a magic item with several forms', () => {
  test('cancelling the form question cancels the add: the row stays empty', () => {
    const { engine, host } = sheet(CANCEL);
    const before = engine.values();
    expect(engine.edit(ITEM, 'Adamantine Armor', { cancelable: true })).toBe(false);
    expect(host.asked).toEqual([{ kind: 'dialog', what: FORM_QUESTION }]);
    expect(value(engine, ITEM)).toBe('');
    expect(known(engine)).toBe('|');
    // MPMB had filled in the description and more before it asked: all of it is gone again.
    expect(engine.values()).toEqual(before);
    expect(engine.stats.errors).toEqual([]);
  });

  test('a form picked with OK adds the item in that form', () => {
    const { engine } = sheet({ dialogs: { [FORM_QUESTION]: { steps: [{ set: { r001: true } }] } } });
    expect(engine.edit(ITEM, 'Adamantine Armor', { cancelable: true })).toBe(true);
    // MPMB names the item after the picked armour: "Adamantine Scale Mail".
    expect(value(engine, ITEM)).toMatch(/^Adamantine (?!Armor)\w/);
    expect(value(engine, DESCRIPTION)).not.toBe('');
    expect(known(engine)).toBe('adamantine armor|');
    expect(engine.stats.errors).toEqual([]);
  });

  test('cancelling the form question cancels a swap: the old item stays as it was', () => {
    const { engine } = sheet(CANCEL);
    engine.edit(ITEM, 'Bag of Holding', { cancelable: true });
    const before = engine.values();
    expect(engine.edit(ITEM, 'Adamantine Armor', { cancelable: true })).toBe(false);
    expect(value(engine, ITEM)).toBe('Bag of Holding');
    expect(engine.values()).toEqual(before);
    expect(engine.stats.errors).toEqual([]);
  });

  // Armor of Resistance asks twice: which damage type (before MPMB changes anything), then which armour.
  test.each([
    ['the first question', [{ close: 'cancel' }]],
    ['the second question', [{ steps: [{ set: { r000: true } }] }, { close: 'cancel' }]],
  ])('cancelling %s of two cancels the add', (_, answers) => {
    const { engine, host } = sheet({ dialogs: { [FORM_QUESTION]: answers } });
    const before = shown(engine);
    expect(engine.edit(ITEM, 'Armor of Resistance', { cancelable: true })).toBe(false);
    expect(host.asked).toHaveLength(answers.length);
    expect(shown(engine)).toEqual(before);
    expect(engine.stats.errors).toEqual([]);
  });
});
