/* eslint-disable ts-patterns/no-magic-numbers -- font sizes are the test data */
// MPMB's styled labels (small caps made of two font sizes) on the engine: the runs MPMB sets are saved as the
// field's /RV, as Acrobat saves them, and a saved /RV comes back to MPMB's scripts as styled runs.
import { describe, expect, test } from 'vitest';
import { answerUnits } from '../src/engine/builder.ts';
import type { DialogView } from '../src/engine/host.ts';
import { parseRichValue } from '../src/engine/rich-text.ts';
import { applyCharacter, diffCharacter } from '../src/engine/sheet-data.ts';
import { blankSheet } from '../src/engine/sheet.ts';
import { ScriptedHost } from './hosts.ts';
import { openSheet, referenceSheet } from './characters.ts';

/** The unit labels MPMB sets as rich text when the units change. */
const UNIT_LABELS = [
  'Display.Weighttxt.LbKg',
  'Display.Weighttxt.LbKgPage3',
  'Comp.eqp.Display.Weighttxt',
  'Display.Speed.Enc',
  'Display.Speed.EncH',
  'Display.Speed.Push',
];

/** A blank sheet switched to metric with the sheet menu, as a player does it. */
function metricSheet(): ReturnType<typeof openSheet> {
  const scripted = new ScriptedHost();
  const units = answerUnits('metric');
  const engine = openSheet(undefined, {
    alert: scripted.alert.bind(scripted),
    popUpMenu: scripted.popUpMenu.bind(scripted),
    dialog: (view: DialogView, first: boolean) => units(view) ?? scripted.dialog(view, first),
  });
  engine.clickBookmark(['Functions', 'Unit System']);
  expect(engine.stats.errors).toEqual([]);
  return engine;
}

describe('the runs MPMB sets are saved', () => {
  test('metric unit labels get the /RV Acrobat saves for them, small caps and all', () => {
    const ours = metricSheet().snapshot();
    // The reference characters were made on metric sheets and saved in Acrobat.
    const acrobat = referenceSheet('paladin8-warlock2');
    UNIT_LABELS.forEach((name) => {
      expect(ours.fields[name]?.value, name).toBe(acrobat.fields[name]?.value);
      expect(ours.fields[name]?.richValue, name).toBe(acrobat.fields[name]?.richValue);
    });
  });

  test('they come back after saving and opening again', () => {
    const saved = diffCharacter(blankSheet(), metricSheet().snapshot());
    const sheet = applyCharacter(blankSheet(), saved);
    expect(sheet.fields['Display.Weighttxt.LbKg']?.richValue).toBe(
      referenceSheet('paladin8-warlock2').fields['Display.Weighttxt.LbKg']?.richValue,
    );
  });

  test('a saved /RV reaches the scripts as styled runs, as Acrobat hands them out', () => {
    // MPMB sets the unit labels again when a sheet opens; "Vision" keeps what Acrobat saved (line height 10).
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    const runs = engine.evaluate('JSON.stringify(getField("Vision").richValue)');
    expect(JSON.parse(String(runs))).toMatchObject([
      { text: 'Darkvision 18 m', linespacing: 10, textSize: 5.7, fontFamily: ['Segoe Print', 'serif'] },
    ]);
  });

  test('a script that reads the runs, changes them and sets them again keeps the small caps', () => {
    // MPMB's colour theme does this to "ARMOR:" and "WEAPONS:".
    const engine = openSheet();
    engine.evaluate('ApplyColorScheme("red")');
    expect(engine.stats.errors).toEqual([]);
    const rv = engine.snapshot().fields['Text.Armor Proficiencies']?.richValue ?? '';
    const runs = parseRichValue(rv);
    expect(runs.map((r) => [r.text, r.textSize])).toEqual([
      ['A', 8],
      ['RMOR', 5.6],
      [':', 8],
    ]);
    // One colour for all three runs, and not the blank's purple any more.
    const colours = new Set(runs.map((r) => JSON.stringify(r.textColor)));
    expect(colours.size).toBe(1);
    expect(rv).not.toBe(blankSheet().fields['Text.Armor Proficiencies']?.richValue);
  });

  test('a label set as plain text keeps its font: the value in the style of its first run', () => {
    const engine = openSheet();
    engine.evaluate('getField("Display.Weighttxt.LbKg").value = "KG"');
    const rv = engine.snapshot().fields['Display.Weighttxt.LbKg']?.richValue ?? '';
    expect(parseRichValue(rv)).toMatchObject([
      { text: 'KG', textSize: 7, fontFamily: ['Footlight MT Light', 'serif'] },
    ]);
  });

  test('a sheet nobody changed saves no /RV: the blank sheet’s runs are kept as they are', () => {
    const saved = diffCharacter(blankSheet(), openSheet().snapshot());
    const withRv = Object.entries(saved.fields)
      .filter(([, patch]) => patch && 'richValue' in patch)
      .map(([n]) => n);
    expect(withRv).toEqual([]);
  });
});
