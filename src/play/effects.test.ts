/* eslint-disable ts-patterns/no-magic-numbers -- AC, modifiers and rows are the test data */
// Effects on the wizard reference character: switching on writes into MPMB's own AC and attack fields,
// and MPMB works out the new numbers; switching off puts back what was there.
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { withValues } from '../../test/fields.ts';
import type { Engine } from '../engine/engine.ts';
import type { Step } from '../session.svelte.ts';
import { viewsOf } from '../worker/views.ts';
import { acText, effectOn, newEffect, readEffects, switchOff, switchOn, weaponRows } from './effects.ts';
import type { Effect } from './effects.ts';

const wizard = (): Engine => openSheet(referenceSheet('wizard10-evoker'));
/** The steps as the worker makes them (the play view only ever sends edits here). */
function run(engine: Engine, steps: Step[]): void {
  steps.forEach((step) => {
    if (!('edit' in step)) throw new Error('only edits expected');
    engine.edit(step.edit, step.text);
  });
}
const effect = (values: Partial<Effect>): Effect => ({ ...newEffect('e1', 'Made-up Stance'), ...values });

describe('acText', () => {
  it("writes the bonus as MPMB's AC fields take it", () => {
    expect(acText({ acAbility: '', acNumber: 0 })).toBe('');
    expect(acText({ acAbility: 'Int', acNumber: 0 })).toBe('Int');
    expect(acText({ acAbility: '', acNumber: 2 })).toBe('2');
    expect(acText({ acAbility: 'Wis', acNumber: 1 })).toBe('Wis+1');
    expect(acText({ acAbility: 'Wis', acNumber: -1 })).toBe('Wis-1');
  });
});

describe('switching an effect on and off', () => {
  it('adds the AC bonus and moves weapon attacks to the ability, then takes both out again', () => {
    const engine = wizard();
    const before = viewsOf(engine.doc);
    expect(before['AC']?.value).toBe('12');
    expect(before['Attack.1.Mod']?.value).toBe('Str Mod');
    expect(before['Attack.1.To Hit']?.value).toBe('+5');

    const stance = effect({ acAbility: 'Int', weaponAbility: 'Int' });
    const { steps, applied } = switchOn(before, stance);
    run(engine, steps);
    const on = viewsOf(engine.doc);
    // Int +3: AC 15, and the staff hits with Int (+3 and +4 proficiency, +2 magic) instead of Str.
    expect(on['AC']?.value).toBe('15');
    expect(on['AC Misc Mod 1 Description']?.value).toBe('Made-up Stance');
    expect(on['Attack.1.Mod']?.value).toBe('Int Mod');
    expect(on['Attack.1.To Hit']?.value).toBe('+9');
    expect(applied.attacks).toEqual([{ row: 1, weapon: 'Staff of the Magi', before: 'Str Mod' }]);
    // The cantrips (no ability of their own on the attack row) stay as they were.
    expect(on['Attack.2.Mod']?.value).toBe('empty');

    run(engine, switchOff(on, { ...stance, applied }));
    const off = viewsOf(engine.doc);
    expect(off['AC']?.value).toBe('12');
    expect(off['AC Misc Mod 1']?.value).toBe('');
    expect(off['AC Misc Mod 1 Description']?.value).toBe('');
    expect(off['Attack.1.Mod']?.value).toBe('Str Mod');
    expect(off['Attack.1.To Hit']?.value).toBe('+5');
  });

  it("puts the bonus on top of a used AC field and gives that field's own value back", () => {
    const engine = wizard();
    run(engine, [
      { edit: 'AC Misc Mod 1', text: '1' },
      { edit: 'AC Misc Mod 1 Description', text: 'Ring' },
      { edit: 'AC Misc Mod 2', text: '1' },
      { edit: 'AC Misc Mod 2 Description', text: 'Cloak' },
    ]);
    const stance = effect({ acNumber: 2 });
    const { steps, applied } = switchOn(viewsOf(engine.doc), stance);
    run(engine, steps);
    expect(viewsOf(engine.doc)['AC']?.value).toBe('16');
    expect(viewsOf(engine.doc)['AC Misc Mod 1 Description']?.value).toBe('Ring, Made-up Stance');
    run(engine, switchOff(viewsOf(engine.doc), { ...stance, applied }));
    expect(viewsOf(engine.doc)['AC']?.value).toBe('14');
    expect(viewsOf(engine.doc)['AC Misc Mod 1']?.value).toBe('1');
    expect(viewsOf(engine.doc)['AC Misc Mod 1 Description']?.value).toBe('Ring');
  });

  it('leaves a field the player changed while the effect was on', () => {
    const fields = viewsOf(wizard().doc);
    const stance = effect({ acAbility: 'Int', weaponAbility: 'Int' });
    const { applied } = switchOn(fields, stance);
    const changed = withValues(fields, {
      'AC Misc Mod 1': '3',
      'AC Misc Mod 1 Description': 'Made-up Stance',
      'Attack.1.Mod': 'Dex Mod',
    });
    expect(switchOff(changed, { ...stance, applied })).toEqual([]);
    // Another weapon in the row now: its ability is the player's, whatever it is.
    const replaced = withValues(fields, { 'Attack.1.Weapon Selection': 'Dagger', 'Attack.1.Mod': 'Int Mod' });
    expect(switchOff(replaced, { ...stance, applied, acAbility: '' })).toEqual([]);
  });

  it('keeps a weapon whose own modifier is higher', () => {
    const fields = withValues(viewsOf(wizard().doc), { 'Str Mod': '4' });
    expect(weaponRows(fields, 'Int')).toEqual([]);
    expect(switchOn(fields, effect({ weaponAbility: 'Int' })).steps).toEqual([]);
  });

  it('keeps a weapon the character is not proficient with', () => {
    const fields = withValues(viewsOf(wizard().doc), { 'Attack.1.Proficiency': 'Off' });
    expect(weaponRows(fields, 'Int')).toEqual([]);
  });

  it('changes nothing for an effect without values', () => {
    const fields = viewsOf(wizard().doc);
    expect(switchOn(fields, effect({}))).toEqual({ steps: [], applied: { attacks: [] } });
    expect(switchOff(fields, effect({}))).toEqual([]);
  });
});

describe('readEffects', () => {
  it('keeps valid entries and repairs or drops the rest', () => {
    const stored = [
      {
        id: 'a',
        name: 'Made-up Stance',
        acAbility: 'Int',
        acNumber: 1.4,
        weaponAbility: 'Bad',
        applied: { ac: { field: 2, before: '', beforeNote: '', value: 'Int+1', note: 'Made-up Stance' }, attacks: [] },
      },
      'not an effect',
      { name: 'x'.repeat(100), acNumber: 99, applied: { ac: { field: 7 }, attacks: [{ row: 'one' }] } },
    ];
    const effects = readEffects(stored);
    expect(effects).toHaveLength(2);
    expect(effects[0]).toMatchObject({ id: 'a', acAbility: 'Int', acNumber: 1, weaponAbility: '' });
    expect(effects[0] && effectOn(effects[0])).toBe(true);
    expect(effects[1]).toMatchObject({ id: 'effect-1', acNumber: 10, applied: { attacks: [] } });
    expect(effects[1]?.name).toHaveLength(40);
    expect(readEffects(undefined)).toEqual([]);
  });
});
