// A speed typed in the Speed window (mpmb-web#60) is written to MPMB's Speed fields as text, as in the
// PDF. MPMB's SetProf("speed") reads whatever differs from its own total as typed in and keeps that
// difference when species, class or feats change later. These tests pin down what that means for the
// player: a typed extra survives a species change, the doubled speed of an old sheet is fixed by typing
// the species' speed, and a number counts in the sheet's unit whatever unit is typed after it.
import { describe, expect, test } from 'vitest';
import { answerUnits } from '../src/engine/builder.ts';
import type { DialogView } from '../src/engine/host.ts';
import { openSheet } from './characters.ts';
import { ScriptedHost } from './hosts.ts';

function sheet(units?: 'metric') {
  // Species' language questions are closed with OK as they are.
  const scripted = new ScriptedHost();
  const metric = units ? answerUnits(units) : () => null;
  const engine = openSheet(undefined, {
    alert: scripted.alert.bind(scripted),
    popUpMenu: scripted.popUpMenu.bind(scripted),
    dialog: (view: DialogView, first: boolean) => metric(view) ?? scripted.dialog(view, first),
  });
  if (units) engine.clickBookmark(['Functions', 'Unit System']);
  const speed = () => String(engine.values()['Speed']);
  const encumbered = () => String(engine.values()['Speed encumbered']);
  return { engine, speed, encumbered };
}

describe('a speed typed in', () => {
  test('stays an extra on top of the species when the species changes', () => {
    const { engine, speed } = sheet();
    engine.edit('Race', 'Dwarf');
    expect(speed()).toBe('30 ft');
    engine.edit('Speed', '35 ft');
    engine.edit('Race', 'Human');
    expect(speed()).toBe('35 ft');
    expect(engine.stats.errors).toEqual([]);
  });

  test('typing the species’ own speed leaves no extra (the doubled speed of an old sheet)', () => {
    const { engine, speed, encumbered } = sheet('metric');
    // An old sheet: 9 m typed in with no speed record, then the species adds its own 9 m on top.
    engine.edit('Speed', '9 m');
    engine.edit('Speed encumbered', '6 m');
    engine.edit('Race', 'Dwarf');
    expect(speed()).toBe('18 m');
    // The fix in the Speed window: type the species' speed again.
    engine.edit('Speed', '9 m');
    engine.edit('Speed encumbered', '6 m');
    engine.edit('Race', 'Human');
    expect(speed()).toBe('9 m');
    expect(encumbered()).toBe('6 m');
    expect(engine.stats.errors).toEqual([]);
  });

  test('counts in the sheet’s unit, whatever unit is typed', () => {
    const { engine, speed } = sheet('metric');
    engine.edit('Race', 'Dwarf');
    expect(speed()).toBe('9 m');
    engine.edit('Speed', '30 ft');
    engine.edit('Race', 'Human');
    // 30 counts as metres: 30 m.
    expect(speed()).toBe('30 m');
  });
});
