/* eslint-disable ts-patterns/no-magic-numbers -- row counts and row numbers are the test data */
// M8: MPMB's overflow page. When the first pages' rows are full, MPMB adds the "Overflow sheet" (template
// ASoverflow) and writes the extra feats, magic items, limited features, actions and languages there. The
// play view reads every row the sheet has, so what lands on the overflow page shows in the same tabs.
// Names are made up (no game content); MPMB's own functions add them, as its scripts do for a character.
import { describe, expect, test } from 'vitest';
import { readProficiencies, moreProficiencies } from '../src/build/proficiencies.ts';
import { readActions, readFeatures, readInventory, readLimitedFeatures } from '../src/play/read.ts';
import { viewsOf } from '../src/worker/views.ts';
import { openSheet, referenceSheet } from './characters.ts';

/** `count` names: "Test Feat 1", "Test Feat 2", … */
const names = (what: string, count: number): string[] => Array.from({ length: count }, (_, i) => `${what} ${i + 1}`);

describe('the overflow page', () => {
  test('MPMB adds it when the rows are full, and its rows show in the play view', () => {
    const engine = openSheet(referenceSheet('wizard10-evoker'));
    expect(engine.evaluate('isTemplVis("ASoverflow")')).toBe(false);

    // The wizard has one feat, one magic item and two limited features: these fill page 1 to 3 and go on.
    const feats = names('Test Feat', 7);
    const items = names('Test Item', 9);
    const features = names('Test Feature', 12);
    const actions = names('Test Action', 9);
    const languages = names('Testish', 10);
    const script = [
      ...feats.map((name) => `AddFeat(${JSON.stringify(name)}, "", "A feat for the test.");`),
      ...items.map((name) => `AddMagicItem(${JSON.stringify(name)}, false, "An item for the test.");`),
      ...features.map((name) => `AddFeature(${JSON.stringify(name)}, 1, "", "long rest", "test");`),
      ...actions.map((name) => `AddAction("bonus action", ${JSON.stringify(name)}, "test");`),
      ...languages.map((name) => `AddLanguage(${JSON.stringify(name)}, "test");`),
    ].join('\n');
    engine.evaluate(script);
    expect(engine.stats.errors).toEqual([]);
    expect(engine.evaluate('isTemplVis("ASoverflow")')).toBe(true);

    const fields = viewsOf(engine.doc);
    // Each list reaches the overflow page's first row (past feats 5, magic items 6, limited features 8 and
    // bonus actions 6 on the first pages), after the wizard's own entries.
    expect(fields['Feat Name 6']?.value).toMatch(/^Test Feat/);
    expect(fields['Extra.Magic Item 7']?.value).toMatch(/^Test Item/);
    expect(fields['Limited Feature 9']?.value).toMatch(/^Test Feature/);
    expect(fields['Bonus Action 7']?.value).toMatch(/^Test Action/);
    expect(fields.MoreProficiencies?.value).toContain('Testish 10');

    const featTitles = readFeatures(fields).map((block) => block.title);
    feats.forEach((name) => expect(featTitles).toContain(name));
    const itemNames = readInventory(fields).magicItems.map((item) => item.name);
    items.forEach((name) => expect(itemNames).toContain(name));
    const featureNames = readLimitedFeatures(fields).map((feature) => feature.name);
    features.forEach((name) => expect(featureNames).toContain(name));
    actions.forEach((name) => expect(readActions(fields).bonusAction).toContain(name));
    const more = moreProficiencies(readProficiencies(fields));
    expect(more).toContain('Testish 10 (language)');
    expect(more.every((item) => !item.includes(';'))).toBe(true);
  });
});
