// The Build screen's data from MPMB (src/engine/builder.ts) and the class field it writes, on the engine.
import { describe, expect, test } from 'vitest';
import { BUILDER_INFO_SCRIPT, answerUnits, readBuilderInfo } from '../src/engine/builder.ts';
import type { DialogView } from '../src/engine/host.ts';
import { ScriptedHost } from './hosts.ts';
import { classFieldText, rowsOf, setLevel } from '../src/build/classes.ts';
import { openSheet, referenceSheet } from './characters.ts';

describe('builder information', () => {
  test('a blank sheet offers the twelve SRD classes with their subclass, and has none', () => {
    const info = readBuilderInfo(openSheet().evaluate(BUILDER_INFO_SCRIPT));
    expect(info.classes.map((c) => c.name)).toContain('Paladin');
    expect(info.classes).toHaveLength(12);
    const paladin = info.classes.filter((c) => c.key === 'paladin')[0];
    expect(paladin).toMatchObject({ die: 10, source: "SRD'24 53", prereqs: 'Strength 13 and Charisma 13' });
    expect(paladin?.subclasses).toEqual([{ key: 'paladin-devotion', name: 'Oath of Devotion', source: "SRD'24 56" }]);
    expect(info.known).toEqual([]);
    expect(info.xpTable[10]).toBe(85000);
  });

  test('the reference paladin/warlock: first class first, and what the next levels bring', () => {
    const info = readBuilderInfo(openSheet(referenceSheet('paladin8-warlock2')).evaluate(BUILDER_INFO_SCRIPT));
    expect(info.known.map((k) => [k.key, k.subclass, k.level])).toEqual([
      ['paladin', 'paladin-devotion', 8],
      ['warlock', 'warlock-fiend', 2],
    ]);
    expect(info.known[0]?.nextFeatures).toContain('Abjure Foes');
    // The rows write back the same text MPMB has.
    expect(classFieldText(rowsOf(info.known), info.classes)).toBe(
      'Paladin (Oath of Devotion) 8, Warlock (Fiend Patron) 2',
    );
  });
});

describe('writing the class field', () => {
  test('a level up of the paladin makes the character level 11', () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    const info = readBuilderInfo(engine.evaluate(BUILDER_INFO_SCRIPT));
    const rows = setLevel(rowsOf(info.known), 0, 9);
    engine.edit('Class and Levels', classFieldText(rows, info.classes));
    expect(engine.stats.errors).toEqual([]);
    expect(String(engine.values()['Character Level'])).toBe('11');
    const after = readBuilderInfo(engine.evaluate(BUILDER_INFO_SCRIPT));
    expect(after.known.map((k) => k.level)).toEqual([9, 2]);
  });

  test('a blank sheet becomes a level 1 wizard', () => {
    const engine = openSheet();
    engine.edit('Class and Levels', 'Wizard 1');
    expect(engine.stats.errors).toEqual([]);
    const info = readBuilderInfo(engine.evaluate(BUILDER_INFO_SCRIPT));
    expect(info.known).toMatchObject([{ key: 'wizard', level: 1, subclass: '' }]);
    expect(String(engine.values()['Character Level'])).toBe('1');
  });
});

describe('the sheet menu’s units switch', () => {
  test('answers MPMB’s units dialog and MPMB converts the sheet', () => {
    const scripted = new ScriptedHost();
    const units = answerUnits('metric');
    const host = {
      alert: scripted.alert.bind(scripted),
      popUpMenu: scripted.popUpMenu.bind(scripted),
      dialog: (view: DialogView, first: boolean) => units(view) ?? scripted.dialog(view, first),
    };
    const engine = openSheet(undefined, host);
    engine.edit('Speed', '30 ft');
    const before = String(engine.values()['Unit System']);
    engine.clickBookmark(['Functions', 'Unit System']);
    expect(engine.stats.errors).toEqual([]);
    expect(before).toBe('imperial');
    expect(engine.values()['Unit System']).toBe('metric');
    expect(scripted.asked.map((a) => a.what)).not.toContain('SET UNIT SYSTEM AND DECIMAL SEPARATOR');
  });
});
