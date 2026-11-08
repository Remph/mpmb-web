/* eslint-disable ts-patterns/no-magic-numbers -- AC, modifiers and rows are the test data */
// Effects on the wizard reference character: switching on writes into MPMB's own AC and attack fields,
// and MPMB works out the new numbers; switching off puts back what was there.
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { withValues } from '../../test/fields.ts';
import type { Engine } from '../engine/engine.ts';
import type { Step } from '../session.svelte.ts';
import { viewsOf } from '../worker/views.ts';
import {
  acFromEffects,
  acText,
  effectOn,
  newEffect,
  readEffects,
  switchOff,
  switchOn,
  toggle,
  weaponRows,
  withoutName,
  withoutTerm,
} from './effects.ts';
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

describe('acFromEffects (the AC tile)', () => {
  it('adds up what the effects that are on add to the AC, as MPMB does', () => {
    const engine = wizard();
    const before = viewsOf(engine.doc);
    const stance = effect({ acAbility: 'Int', acNumber: 1 });
    const off = effect({ id: 'e2', name: 'Made-up Song', acNumber: 2 });
    const weaponsOnly = effect({ id: 'e3', name: 'Made-up Grip', weaponAbility: 'Int' });
    expect(acFromEffects(before, [stance, off])).toEqual({ bonus: 0, names: [] });

    const { steps, applied } = switchOn(before, stance);
    run(engine, steps);
    const on = viewsOf(engine.doc);
    const grip = switchOn(on, weaponsOnly);
    const effects = [{ ...stance, applied }, off, { ...weaponsOnly, applied: grip.applied }];
    // Int +3 and 1: the 4 the AC went up by; the switched-off song and the weapons-only grip add nothing.
    expect(Number(on['AC']?.value) - Number(before['AC']?.value)).toBe(4);
    expect(acFromEffects(on, effects)).toEqual({ bonus: 4, names: ['Made-up Stance'] });
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

describe('withoutTerm and withoutName', () => {
  it('take one whole term or name out, wherever it is', () => {
    expect(withoutTerm('Int', 'Int')).toBe('');
    expect(withoutTerm('Int+2', 'Int')).toBe('2');
    expect(withoutTerm('2+Int', 'Int')).toBe('2');
    expect(withoutTerm('1+Int+2', 'Int')).toBe('1+2');
    expect(withoutTerm('1+Int-2', 'Int')).toBe('1-2');
    expect(withoutTerm('Int-1', 'Int')).toBe('-1');
    expect(withoutTerm('Int+Int', 'Int')).toBe('Int');
    expect(withoutTerm('Wis+1+2', 'Wis+1')).toBe('2');
    expect(withoutTerm('1+-1', '-1')).toBe('1');
    // Not a whole term: left alone.
    expect(withoutTerm('10', '1')).toBeNull();
    expect(withoutTerm('Int+10', '1')).toBeNull();
    expect(withoutTerm('Int-1', '1')).toBeNull();
    expect(withoutTerm('', 'Int')).toBeNull();
    expect(withoutName('Ring, Made-up Stance', 'Made-up Stance')).toBe('Ring');
    expect(withoutName('Made-up Stance, Made-up Stance', 'Made-up Stance')).toBe('Made-up Stance');
    expect(withoutName('Made-up Stances', 'Made-up Stance')).toBeNull();
  });
});

describe('quick taps and sheets that went wrong', () => {
  const ac = (engine: Engine): unknown => viewsOf(engine.doc)['AC']?.value;
  /** A tap as the play view makes it: the sheet and the effects as they are after the taps before. */
  function tap(engine: Engine, effects: Effect[], id = 'e1'): Effect[] {
    const result = toggle(viewsOf(engine.doc), effects, id);
    run(engine, result.steps);
    return result.effects;
  }

  it('each tap works from the one before: the bonus goes in once, then out', () => {
    const engine = wizard();
    let effects = [effect({ acAbility: 'Int', weaponAbility: 'Int' })];
    const seen = [1, 2, 3, 4, 5].map(() => {
      effects = tap(engine, effects);
      return ac(engine);
    });
    // Int +3 on AC 12; before the fix five quick taps could end at AC 21 or more.
    expect(seen).toEqual(['15', '12', '15', '12', '15']);
    expect(viewsOf(engine.doc)['AC Misc Mod 2']?.value).toBe('');
  });

  it('switching on where the sheet already has the bonus takes it over instead of adding it again', () => {
    const engine = wizard();
    const stance = effect({ acAbility: 'Int' });
    run(engine, switchOn(viewsOf(engine.doc), stance).steps);
    expect(ac(engine)).toBe('15');
    // A tap that still saw the effect as off (the old bug): nothing more goes in.
    const again = switchOn(viewsOf(engine.doc), stance);
    expect(again.steps).toEqual([]);
    expect(again.applied.ac).toMatchObject({ field: 1, before: '', beforeNote: '' });
    run(engine, switchOff(viewsOf(engine.doc), { ...stance, applied: again.applied }));
    expect(ac(engine)).toBe('12');
    expect(viewsOf(engine.doc)['AC Misc Mod 1 Description']?.value).toBe('');
  });

  it('repairs a sheet where quick taps added the bonus more than once: on, then off', () => {
    const engine = wizard();
    // What the old version left: the bonus in both fields and on top again, the switch showing off.
    run(engine, [
      { edit: 'AC Misc Mod 1', text: 'Int+Int' },
      { edit: 'AC Misc Mod 1 Description', text: 'Made-up Stance, Made-up Stance' },
      { edit: 'AC Misc Mod 2', text: 'Int' },
      { edit: 'AC Misc Mod 2 Description', text: 'Made-up Stance' },
    ]);
    expect(ac(engine)).toBe('21');
    let effects = tap(engine, [effect({ acAbility: 'Int' })]);
    expect(effects[0] && effectOn(effects[0])).toBe(true);
    expect(ac(engine)).toBe('21');
    effects = tap(engine, effects);
    expect(ac(engine)).toBe('12');
    const off = viewsOf(engine.doc);
    expect([off['AC Misc Mod 1']?.value, off['AC Misc Mod 1 Description']?.value]).toEqual(['', '']);
    expect([off['AC Misc Mod 2']?.value, off['AC Misc Mod 2 Description']?.value]).toEqual(['', '']);
  });

  it('takes only its own bonus out of a field that got more on top, in any order', () => {
    const engine = wizard();
    const effects = [
      effect({ id: 'a', name: 'Stance A', acAbility: 'Int' }),
      effect({ id: 'b', name: 'Stance B', acNumber: 1 }),
      effect({ id: 'c', name: 'Stance C', acNumber: 2 }),
    ];
    let list = ['a', 'b', 'c'].reduce((now, id) => tap(engine, now, id), effects);
    expect(ac(engine)).toBe('18');
    expect(viewsOf(engine.doc)['AC Misc Mod 1']?.value).toBe('Int+2');
    // The first one off first: its bonus and name go, the one on top of it stays.
    list = tap(engine, list, 'a');
    expect(ac(engine)).toBe('15');
    expect(viewsOf(engine.doc)['AC Misc Mod 1']?.value).toBe('2');
    expect(viewsOf(engine.doc)['AC Misc Mod 1 Description']?.value).toBe('Stance C');
    list = tap(engine, tap(engine, list, 'c'), 'b');
    expect(ac(engine)).toBe('12');
    expect(list.some(effectOn)).toBe(false);
  });

  it("never takes the player's own bonus of the same size under another name", () => {
    const engine = wizard();
    // The player's own Int bonus in each field, one of them sharing the field with the effect's.
    run(engine, [
      { edit: 'AC Misc Mod 1', text: 'Int' },
      { edit: 'AC Misc Mod 1 Description', text: 'Made-up Ring' },
      { edit: 'AC Misc Mod 2', text: '1' },
      { edit: 'AC Misc Mod 2 Description', text: 'Cloak' },
    ]);
    let effects = tap(engine, [effect({ acAbility: 'Int' })]);
    expect(ac(engine)).toBe('19');
    expect(viewsOf(engine.doc)['AC Misc Mod 1']?.value).toBe('Int+Int');
    // The player adds to the field while the effect is on, so it no longer holds what the effect wrote.
    run(engine, [{ edit: 'AC Misc Mod 2', text: 'Int+1' }]);
    expect(ac(engine)).toBe('22');
    effects = tap(engine, effects);
    expect(effects.some(effectOn)).toBe(false);
    const off = viewsOf(engine.doc);
    expect([off['AC Misc Mod 1']?.value, off['AC Misc Mod 1 Description']?.value]).toEqual(['Int', 'Made-up Ring']);
    expect([off['AC Misc Mod 2']?.value, off['AC Misc Mod 2 Description']?.value]).toEqual(['Int+1', 'Cloak']);
    expect(ac(engine)).toBe('19');
  });

  it("leaves another effect's bonus of the same name", () => {
    const engine = wizard();
    const twins = [effect({ id: 'a', acNumber: 1 }), effect({ id: 'b', acNumber: 1 })];
    let list = tap(engine, tap(engine, twins, 'a'), 'b');
    expect(ac(engine)).toBe('14');
    list = tap(engine, list, 'a');
    expect(ac(engine)).toBe('13');
    tap(engine, list, 'b');
    expect(ac(engine)).toBe('12');
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

  it('gives a repeated id a new one, so each switch keeps its own key', () => {
    const ids = readEffects([{ id: 'a' }, { id: 'a' }, { id: 'a-1' }, {}]).map((e) => e.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids[0]).toBe('a');
  });
});
