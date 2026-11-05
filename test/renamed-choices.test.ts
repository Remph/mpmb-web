// A magic item, feat or species with a choice (Adamantine Armor: which armour; Grappler: which ability;
// Dragonborn: which ancestry): MPMB renames the row after the pick ("Adamantine Scale Mail"). It does
// that from the field's Calculate script and leaves a note (`setVal`) on the field that the field's
// Validate script must clear, as Acrobat runs Validate after a calculation changes a value. Without
// that, the note stayed and swallowed the row's next change: removing the item emptied the name but
// left the item applied.
import { describe, expect, test } from 'vitest';
import { blankSheet } from '../src/engine/sheet.ts';
import { openSheet } from './characters.ts';
import { ScriptedHost } from './hosts.ts';
import { ALERT_ANSWER } from '../src/engine/host.ts';

const QUESTION = 'ASK USER DIALOG';
// What MPMB names each row when the first option of its question is picked.
const RENAMED_ITEM = 'Adamantine Chain Shirt';
const RENAMED_FEAT = 'Grappler [Strength]';
const RENAMED_SPECIES = 'Black Dragonborn';

/**
 * A blank sheet whose user picks the first option of the first "which form?" question. Later questions
 * (a species' languages) are closed with OK as they are.
 */
function sheet() {
  const host = new ScriptedHost({
    dialogs: { [QUESTION]: [{ steps: [{ set: { r000: true } }] }] },
    // A level 0 character doesn't meet Grappler's prerequisite: apply it anyway.
    alerts: { 'Are you sure you want to apply this feat?': ALERT_ANSWER.yes },
  });
  const engine = openSheet(blankSheet(), host);
  host.asked.length = 0;
  return { engine, host };
}

type Engine = ReturnType<typeof sheet>['engine'];
const value = (engine: Engine, name: string) => engine.doc.states.get(name)?.value;
const evaluate = (engine: Engine, code: string) => engine.evaluate(code);

describe('a renamed magic item', () => {
  const ITEM = 'Extra.Magic Item 1';
  const DESCRIPTION = 'Extra.Magic Item Description 1';
  const known = (engine: Engine) => evaluate(engine, 'CurrentMagicItems.known[0]');

  function withAdamantine() {
    const { engine, host } = sheet();
    engine.edit(ITEM, 'Adamantine Armor');
    expect(host.asked).toEqual([{ kind: 'dialog', what: QUESTION }]);
    // MPMB names the row after the picked armour.
    expect(String(value(engine, ITEM))).toContain(RENAMED_ITEM);
    expect(known(engine)).toBe('adamantine armor');
    return engine;
  }

  test('MPMB clears its rename note once the name is in the field', () => {
    const engine = withAdamantine();
    expect(evaluate(engine, `String(this.getField("${ITEM}").setVal)`)).toBe('undefined');
  });

  test('removing it right after removes it in one go', () => {
    const engine = withAdamantine();
    engine.edit(ITEM, '');
    expect(value(engine, ITEM)).toBe('');
    expect(value(engine, DESCRIPTION)).toBe('');
    expect(known(engine)).toBe('');
    expect(engine.stats.errors).toEqual([]);
  });

  test('swapping it right after applies the new item', () => {
    const engine = withAdamantine();
    engine.edit(ITEM, 'Bag of Holding');
    expect(value(engine, ITEM)).toBe('Bag of Holding');
    expect(known(engine)).toBe('bag of holding');
    expect(String(value(engine, DESCRIPTION)).toLowerCase()).toContain('bag');
    expect(engine.stats.errors).toEqual([]);
  });
});

describe('a renamed feat', () => {
  const FEAT = 'Feat Name 1';
  const DESCRIPTION = 'Feat Description 1';
  const known = (engine: Engine) => evaluate(engine, 'CurrentFeats.known[0]');

  test('removing it right after removes it in one go', () => {
    const { engine } = sheet();
    engine.edit(FEAT, 'Grappler');
    expect(value(engine, FEAT)).toBe(RENAMED_FEAT);
    expect(known(engine)).toBe('grappler');
    engine.edit(FEAT, '');
    expect(value(engine, FEAT)).toBe('');
    expect(value(engine, DESCRIPTION)).toBe('');
    expect(known(engine)).toBe('');
    expect(engine.stats.errors).toEqual([]);
  });
});

describe('a renamed species', () => {
  const known = (engine: Engine) => evaluate(engine, 'CurrentRace.known + "|" + CurrentRace.variant');

  test('changing it right after applies the new species', () => {
    const { engine } = sheet();
    engine.edit('Race', 'Dragonborn');
    expect(value(engine, 'Race')).toBe(RENAMED_SPECIES);
    expect(known(engine)).toBe('dragonborn|black');
    engine.edit('Race', 'Human');
    expect(value(engine, 'Race')).toBe('Human');
    expect(known(engine)).toBe('human|');
    expect(engine.stats.errors).toEqual([]);
  });
});
