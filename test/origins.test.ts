// The Build screen's species, background, feats and ability scores on the engine (src/engine/origins.ts,
// src/engine/scores.ts): what MPMB offers and has, and that writing its fields does what typing would.
import { describe, expect, test } from 'vitest';
import { BUILDER_INFO_SCRIPT, readBuilderInfo } from '../src/engine/builder.ts';
import type { BuilderInfo } from '../src/engine/builder.ts';
import type { Engine } from '../src/engine/engine.ts';
import type { DialogView } from '../src/engine/host.ts';
import { answerScores } from '../src/engine/scores.ts';
import type { ScoreChange } from '../src/engine/scores.ts';
import { openSheet, referenceSheet } from './characters.ts';
import { ScriptedHost } from './hosts.ts';

const infoOf = (engine: Engine): BuilderInfo => readBuilderInfo(engine.evaluate(BUILDER_INFO_SCRIPT));

describe('species, backgrounds and feats from MPMB', () => {
  test('the SRD lists, with what the reference paladin/warlock has', () => {
    const { origins } = infoOf(openSheet(referenceSheet('paladin8-warlock2')));
    expect(origins.species.map((s) => s.name)).toEqual([
      'Dragonborn',
      'Dwarf',
      'Elf',
      'Gnome',
      'Goliath',
      'Halfling',
      'Human',
      'Orc',
      'Tiefling',
    ]);
    const dragonborn = origins.species.filter((s) => s.key === 'dragonborn')[0];
    // The reference character is metric: MPMB's own conversion.
    expect(dragonborn).toMatchObject({ size: [3], speed: '9 m', vision: ['Darkvision 18 m'], source: "SRD'24 84" });
    const silver = dragonborn?.variants.filter((v) => v.key === 'silver')[0];
    expect(silver).toMatchObject({ name: 'Silver Dragonborn', label: 'Silver' });
    expect(silver?.traits).toContain('take 1d10 Cold damage');
    // A variant without a name of its own is named as MPMB's species menu names it.
    const goliath = origins.species.filter((s) => s.key === 'goliath')[0];
    expect(goliath?.variants[0]).toMatchObject({ key: 'cloud', name: 'Cloud Goliath', label: 'Cloud' });
    expect(origins.race).toEqual({ key: 'dragonborn', variant: 'silver' });

    const acolyte = origins.backgrounds.filter((b) => b.key === 'acolyte')[0];
    expect(acolyte).toMatchObject({
      skills: ['Insight', 'Religion'],
      tools: ["Calligrapher's Supplies"],
      abilities: [3, 4, 5],
    });
    expect(origins.background).toEqual({ key: 'acolyte', variant: '' });

    const initiate = origins.feats.filter((f) => f.key === 'magic initiate')[0];
    // The cleric form is on the sheet already, and MPMB allows each form once.
    expect(initiate?.choices.map((c) => c.text)).toEqual(['Magic Initiate [Druid]', 'Magic Initiate [Wizard]']);
    // Magic Initiate may be taken twice; epic boons need level 19.
    expect(initiate?.taken).toBe(false);
    expect(origins.feats.filter((f) => f.key === 'boon of fate')[0]?.meets).toBe(false);
    expect(origins.feats.filter((f) => f.key === 'grappler')[0]?.meets).toBe(true);
    expect(origins.featLines[0]).toEqual({ key: 'magic initiate', choice: 'cleric' });
  });

  test('writing the fields as the pickers do: a wood elf sage with Alert', () => {
    const engine = openSheet();
    const before = infoOf(engine);
    const wood = before.origins.species.filter((s) => s.key === 'elf')[0]?.variants.filter((v) => v.key === 'wood')[0];
    engine.edit('Race', wood?.name ?? '');
    engine.edit('Background', 'Sage');
    engine.edit('Feat Name 1', 'Alert');
    expect(engine.stats.errors).toEqual([]);
    const { origins } = infoOf(engine);
    expect(origins.race).toEqual({ key: 'elf', variant: 'wood' });
    expect(origins.background.key).toBe('sage');
    expect(origins.featLines[0]?.key).toBe('alert');
    expect(origins.feats.filter((f) => f.key === 'alert')[0]?.taken).toBe(true);
  });
});

describe('ability scores', () => {
  test('the reference character’s columns, totals and magic', () => {
    const { scores } = infoOf(openSheet(referenceSheet('paladin8-warlock2')));
    const column = (type: string) => scores.columns.filter((c) => c.type === type)[0]?.scores;
    expect(column('base')).toEqual([14, 9, 15, 8, 9, 15]);
    expect(column('background')).toEqual([0, 0, 0, 0, 1, 2]);
    expect(scores.totals).toEqual([14, 9, 16, 19, 10, 18]);
    expect(scores.magic[3]).toBe('19 (Headband of Intellect)');
    expect(scores.improvements).toEqual([{ name: 'Paladin', level: 8, count: 2 }]);
    expect(scores.backgroundTexts[0]?.name).toBe('Acolyte');
  });

  /** An engine whose host answers MPMB's Ability Scores dialog with these changes, as the worker does. */
  function withAnswer(changes: () => ScoreChange[]) {
    const scripted = new ScriptedHost();
    let answer: ((view: DialogView) => ReturnType<ReturnType<typeof answerScores>>) | null = null;
    const host = {
      alert: scripted.alert.bind(scripted),
      popUpMenu: scripted.popUpMenu.bind(scripted),
      dialog: (view: DialogView, first: boolean) => answer?.(view) ?? scripted.dialog(view, first),
    };
    const engine = openSheet(referenceSheet('paladin8-warlock2'), host);
    return {
      engine,
      scripted,
      write: () => {
        answer = answerScores(changes());
        try {
          engine.click('Ability Scores Button');
        } finally {
          answer = null;
        }
      },
    };
  }

  test('new columns go through MPMB’s dialog: totals, modifiers and what depends on them', () => {
    let info: BuilderInfo | null = null;
    const { engine, scripted, write } = withAnswer(() => {
      const columns = info?.scores.columns ?? [];
      const base = columns.findIndex((c) => c.type === 'base');
      const background = columns.findIndex((c) => c.type === 'background');
      return [
        // Standard array, and the background's +2 moved from Charisma to Wisdom.
        { column: base, scores: [15, 10, 14, 8, 12, 13] },
        { column: background, scores: [0, 0, 0, 0, 2, 1] },
      ];
    });
    info = infoOf(engine);
    write();
    expect(engine.stats.errors).toEqual([]);
    const values = engine.values();
    // Con 14 + 1 (feat) = 15; Int keeps the headband's 19; Wis 12 + 2 = 14; Cha 13 + 1 + 1 = 15.
    expect(['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'].map((a) => Number(values[a]))).toEqual([15, 10, 15, 19, 14, 15]);
    expect(Number(values['Wis Mod'])).toBe(2);
    expect(infoOf(engine).scores.columns.filter((c) => c.type === 'base')[0]?.scores).toEqual([15, 10, 14, 8, 12, 13]);
    // Only MPMB's own follow-up pop-ups (if any) reached the player, never the Ability Scores dialog.
    expect(scripted.asked.map((a) => a.what)).not.toContain('ABILITY SCORES DIALOG');
  });
});
