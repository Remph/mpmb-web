/* eslint-disable ts-patterns/no-magic-numbers -- rows and to-hit numbers are the test data */
// The attack rows' proficiency and ability boxes on the wizard reference character: the app writes them
// into MPMB's own fields and MPMB works out the numbers; choices the player made come back after MPMB
// sets the boxes again by itself.
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { withValues } from '../../test/fields.ts';
import type { Engine } from '../engine/engine.ts';
import type { Step } from '../session.svelte.ts';
import { viewsOf } from '../worker/views.ts';
import { keepChoices, readChoices, readSetup, setupSteps, withChoice } from './attack-setup.ts';

const wizard = (): Engine => openSheet(referenceSheet('wizard10-evoker'));
/** The steps as the worker makes them. */
function run(engine: Engine, steps: Step[]): void {
  steps.forEach((step) => ('edit' in step ? engine.edit(step.edit, step.text) : engine.click(step.click)));
}

describe('readSetup and setupSteps', () => {
  it("reads the row's boxes and sets them, and MPMB works out the new to hit", () => {
    const engine = wizard();
    const fields = viewsOf(engine.doc);
    // The staff: Str with proficiency (+5); a cantrip in row 2 has no ability of its own.
    expect(readSetup(fields, 1)).toEqual({ proficient: true, ability: 'Str' });
    expect(fields['Attack.1.To Hit']?.value).toBe('+5');
    expect(readSetup(fields, 2).ability).toBe('');

    run(engine, setupSteps(fields, 1, { ability: 'Int' }));
    expect(viewsOf(engine.doc)['Attack.1.Mod']?.value).toBe('Int Mod');
    expect(viewsOf(engine.doc)['Attack.1.To Hit']?.value).toBe('+9');

    run(engine, setupSteps(viewsOf(engine.doc), 1, { proficient: false }));
    expect(readSetup(viewsOf(engine.doc), 1)).toEqual({ proficient: false, ability: 'Int' });
    // Without the proficiency bonus (+4): Int +3 and the staff's +2.
    expect(viewsOf(engine.doc)['Attack.1.To Hit']?.value).toBe('+5');

    run(engine, setupSteps(viewsOf(engine.doc), 1, { ability: '', proficient: true }));
    expect(readSetup(viewsOf(engine.doc), 1)).toEqual({ proficient: true, ability: '' });
    expect(viewsOf(engine.doc)['Attack.1.Mod']?.value).toBe('empty');
  });

  it('makes no step for what the row already holds', () => {
    const fields = viewsOf(wizard().doc);
    expect(setupSteps(fields, 1, { proficient: true, ability: 'Str' })).toEqual([]);
    expect(setupSteps(fields, 1, {})).toEqual([]);
  });
});

describe('the choices the app remembers', () => {
  const fields = viewsOf(wizard().doc);
  const weapon = fields['Attack.1.Weapon Selection']?.value;

  it('keeps one choice per row, merged, and drops choices for weapons no longer in their row', () => {
    let choices = withChoice(fields, [], 1, { proficient: false });
    choices = withChoice(fields, choices, 1, { ability: 'Int' });
    expect(choices).toEqual([{ row: 1, weapon, proficient: false, ability: 'Int' }]);
    // A choice for a weapon that has left its row (row 3 holds something else now) goes with the next one.
    const stale = [...choices, { row: 3, weapon: 'Made-up Blade', ability: 'Cha' as const }];
    expect(withChoice(fields, stale, 1, { ability: 'Dex' })).toEqual([
      { row: 1, weapon, proficient: false, ability: 'Dex' },
    ]);
  });

  it('puts back a box MPMB set again by itself, while the weapon stays', () => {
    const choices = [{ row: 1, weapon: String(weapon), proficient: true, ability: 'Int' as const }];
    const before = withValues(fields, { 'Attack.1.Mod': 'Int Mod' });
    // A recalculation (a new level) ticked the box off and set Str again.
    const after = withValues(fields, { 'Attack.1.Mod': 'Str Mod', 'Attack.1.Proficiency': 'Off' });
    expect(keepChoices(before, after, choices, new Set())).toEqual([
      { click: 'Attack.1.Proficiency' },
      { edit: 'Attack.1.Mod', text: 'Int Mod' },
    ]);
  });

  it("survives MPMB's own recalculation of the weapons on the real sheet", () => {
    const engine = wizard();
    const start = viewsOf(engine.doc);
    run(engine, setupSteps(start, 1, { proficient: false }));
    const choices = withChoice(start, [], 1, { proficient: false });
    // New weapon training makes MPMB recalculate every row's proficiency: the staff gets its box back.
    const before = viewsOf(engine.doc);
    engine.click('Proficiency Weapon Martial');
    const after = viewsOf(engine.doc);
    expect(readSetup(after, 1).proficient).toBe(true);
    run(engine, keepChoices(before, after, choices, new Set()));
    expect(readSetup(viewsOf(engine.doc), 1).proficient).toBe(false);
  });

  it("leaves what the change set itself, what didn't move, and rows with a new weapon", () => {
    const choices = [{ row: 1, weapon: String(weapon), ability: 'Str' as const }];
    const after = withValues(fields, { 'Attack.1.Mod': 'Int Mod' });
    // An effect switching on wrote the field: that stays.
    expect(keepChoices(fields, after, choices, new Set(['Attack.1.Mod']))).toEqual([]);
    // Nothing changed in the row.
    expect(keepChoices(fields, fields, choices, new Set())).toEqual([]);
    // Another weapon went into the row: MPMB's own settings stand.
    const otherWeapon = withValues(after, { 'Attack.1.Weapon Selection': 'Dagger' });
    expect(keepChoices(fields, otherWeapon, choices, new Set())).toEqual([]);
  });

  it('reads stored choices and drops what a hand-edited backup broke', () => {
    expect(
      readChoices([
        { row: 1, weapon: 'Dagger', proficient: true, ability: 'Int' },
        { row: 1, weapon: 'Dagger again' },
        { row: 2, weapon: 'Sling', ability: 'Luck' },
        { row: 0, weapon: 'Club' },
        { row: 4 },
        'nonsense',
      ]),
    ).toEqual([
      { row: 1, weapon: 'Dagger', proficient: true, ability: 'Int' },
      { row: 2, weapon: 'Sling' },
    ]);
    expect(readChoices(undefined)).toEqual([]);
  });
});
