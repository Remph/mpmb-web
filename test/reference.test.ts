// The engine against Acrobat: open each reference character and recalculate it, and every field on
// every page must end up as Acrobat saved it.
import { describe, expect, test } from 'vitest';
import { REFERENCE_CHARACTERS, openSheet, referenceSheet } from './characters.ts';
import { compareSheets, show } from './compare.ts';
import { ScriptedHost } from './hosts.ts';

const EVERYTHING = ['value', 'submitName', 'userName', 'display', 'missing', 'extra'] as const;

/**
 * Fields that keep what the player typed or what a button set, although they have a calculate
 * script: the script only reacts to the value (formats it, shows or hides things) and can't make it
 * from the other fields. Emptying them all and recalculating loses these, and only these.
 */
const PLAYER_DATA_WITH_CALCULATIONS = {
  'paladin8-warlock2': [
    'Race',
    'HP Max',
    'Comp.eqp.Display.Weighttxt',
    'Init Bonus',
    'Initiative bonus',
    'Extra.Magic Item 1',
    'Extra.Magic Item 2',
    'Extra.Magic Item 3',
    'Extra.Magic Item 4',
    'Display.Speed.Enc',
    'Display.Speed.EncH',
    'Display.Speed.Push',
    'Feat Name 1',
    'P4.AScomp.Comp.eqp.Display.Weighttxt',
  ],
  'wizard10-evoker': [
    'Race',
    'HP Max',
    'Comp.eqp.Display.Weighttxt',
    'Extra.Magic Item 1',
    'Extra.Magic Item 2',
    'Display.Speed.Enc',
    'Display.Speed.EncH',
    'Display.Speed.Push',
    'Feat Name 1',
    'P4.AScomp.Comp.eqp.Display.Weighttxt',
  ],
};

describe.each(REFERENCE_CHARACTERS)('%s', (name) => {
  const acrobat = referenceSheet(name);
  const host = new ScriptedHost();
  const engine = openSheet(referenceSheet(name), host);

  test('opens without script errors, asking only for the Patreon reminder', () => {
    expect(engine.stats.errors).toEqual([]);
    expect(host.asked.map((a) => a.what)).toEqual(['SUPPORT ON PATREON DIALOG']);
    expect(engine.stats.missing).toEqual({ 'util.iconStreamFromIcon': 1 });
  });

  test('every field on every page matches Acrobat after opening', () => {
    const diffs = compareSheets(acrobat, engine.snapshot(), [...EVERYTHING]);
    expect(show(diffs)).toBe('');
  });

  test('every field still matches after recalculating the whole sheet', () => {
    engine.doc.calculateNow();
    const diffs = compareSheets(acrobat, engine.snapshot(), [...EVERYTHING]);
    expect(show(diffs)).toBe('');
  });

  test('the calculations rebuild every calculated field from scratch', () => {
    const calculated = engine.doc.calculationOrder.filter((field) => engine.doc.states.get(field)?.def.actions.C);
    calculated.forEach((field) => {
      const state = engine.doc.states.get(field);
      if (state) state.value = '';
    });
    // Twice: a few fields read fields that come later in the calculation order.
    engine.doc.calculateNow();
    engine.doc.calculateNow();
    const lost = compareSheets(acrobat, engine.snapshot(), ['value']).map((d) => d.field);
    expect(lost.sort()).toEqual([...PLAYER_DATA_WITH_CALCULATIONS[name]].sort());
  });
});
