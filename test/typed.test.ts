// The engine against Acrobat, the long way: start from the blank sheet, do what the player did
// (type into fields, use the ability scores dialog, the HP menu, the unit system bookmark) and page 1
// must come out as Acrobat saved it. Pages 2 and on hold things typed there (gear, notes) that these
// scripts leave out.
import { describe, expect, test } from 'vitest';
import type { Engine } from '../src/engine/engine.ts';
import { REFERENCE_CHARACTERS, openSheet, referenceSheet } from './characters.ts';
import { compareSheets, show } from './compare.ts';
import { ScriptedHost } from './hosts.ts';
import type { DialogAnswer } from './hosts.ts';
import { METRIC_UNITS, PLAYERS, answersFor } from './players.ts';
import type { Action, Player } from './players.ts';

const FIRST_PAGE = 0;

const act = (engine: Engine, action: Action): void => {
  if ('type' in action) engine.edit(action.type, action.text);
  else if ('click' in action) engine.click(action.click);
  else engine.clickBookmark(action.bookmark);
};

const play = (player: Player): Engine => {
  const engine = openSheet(undefined, new ScriptedHost(answersFor(player)));
  player.actions.forEach((action) => act(engine, action));
  return engine;
};

describe.each(REFERENCE_CHARACTERS)('%s typed in', (name) => {
  test('page 1 matches Acrobat', () => {
    const engine = play(PLAYERS[name]);
    const diffs = compareSheets(referenceSheet(name), engine.snapshot(), ['value', 'display']);
    expect(engine.stats.errors).toEqual([]);
    expect(show(diffs.filter((d) => d.page === FIRST_PAGE))).toBe('');
  });
});

describe('MPMB behaviour that depends on the order of input', () => {
  // Weapons keep their weight through every recalculation (the ability scores dialog and others
  // trigger one), and in metric ApplyWeapon converts the already converted weight again, halving
  // it each time (Functions2.js, `fields.Weight = isReCalc ? What(...)` then `* massMod`). The
  // reference paladin switched to metric last, so Acrobat saved the halberd's 3 kg. Switching first
  // halves it twice; Acrobat runs the same code, so the sheet does this in Acrobat too.
  test('a weapon added in metric loses weight on each recalculation', () => {
    const paladin = PLAYERS['paladin8-warlock2'];
    const engine = play({ ...paladin, actions: [METRIC_UNITS, ...paladin.actions.filter((a) => a !== METRIC_UNITS)] });
    expect(engine.values()['BlueText.Attack.1.Weight']).toBe('0.75');
  });
});

describe('the decimal comma', () => {
  // MPMB's format1 (Functions0.js) formats a stored "1.2" first with a decimal point, then again in
  // the player's style, so the comma style must still read the point as Acrobat's AFMakeNumber does.
  test('weights show with a decimal comma after switching in the unit dialog', () => {
    const comma: DialogAnswer = { steps: [{ set: { SyIm: false, SyMe: true, DeDo: false, DeCo: true } }] };
    const host = new ScriptedHost({ dialogs: { 'SET UNIT SYSTEM AND DECIMAL SEPARATOR': comma } });
    const engine = openSheet(referenceSheet('wizard10-evoker'), host);
    act(engine, METRIC_UNITS);
    // Switching the separator changes no values, so Format runs again only when asked to.
    engine.doc.formatAll();
    const shown = (field: string): string | undefined => engine.doc.states.get(field)?.formatted;
    expect(engine.values()['Decimal Separator']).toBe('comma');
    expect(shown('Weight Carried')).toBe('1,20 kg');
    expect(shown('Adventuring Gear Weight 1')).toBe('0,25');
  });
});
