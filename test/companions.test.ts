// Companion pages (template AScomp): MPMB makes one from its own menu and fills it from its creature list,
// and the play view reads it back. The creature is the SRD owl from Find Familiar, so the test carries no
// content beyond the SRD.
import { describe, expect, test } from 'vitest';
import { addedPage, companionPrefixes, isEmptyCompanion, readCompanions, stillShown } from '../src/play/companions.ts';
import { viewsOf } from '../src/worker/views.ts';
import { openSheet, referenceSheet } from './characters.ts';

describe('companion pages', () => {
  test('a Find Familiar owl shows with its numbers, skills and rules text', () => {
    const engine = openSheet(referenceSheet('wizard10-evoker'));
    // The wizard was saved with one empty companion page.
    const before = viewsOf(engine.doc);
    expect(companionPrefixes(before)).toEqual(['P4.AScomp.']);
    expect(readCompanions(before).every(isEmptyCompanion)).toBe(true);

    // What the page's "Companion Options" menu does for "Create Familiar (Find Familiar spell) > Owl".
    engine.evaluate('MakeCompMenu_CompOptions("P4.AScomp.", ["companion", "add_comp", "familiar", "owl", "owl"])');
    expect(engine.stats.errors).toEqual([]);

    const [owl] = readCompanions(viewsOf(engine.doc));
    expect(owl).toMatchObject({
      prefix: 'P4.AScomp.',
      creature: 'Owl',
      kind: 'Familiar',
      size: 'Tiny',
      // MPMB stores "10+Dex" and shows the result.
      armorClass: '11',
      hp: { current: null, max: 1, temp: null, deathSaves: { successes: 0, failures: 0 } },
    });
    expect(owl?.speed).toContain('Fly');
    expect(owl?.abilities.map((a) => a.key)).toEqual(['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha']);
    expect(owl?.skills.find((s) => s.key === 'Perc')?.mark).not.toBe('nothing');
    expect(owl?.rules.join('\n')).toContain('Find Familiar');
    expect(isEmptyCompanion(owl!)).toBe(false);
  });

  test('a second page comes from the same menu and is listed after the first', () => {
    const engine = openSheet(referenceSheet('wizard10-evoker'));
    engine.evaluate('MakeCompMenu_CompOptions("P4.AScomp.", ["companion", "add_page"])');
    expect(engine.stats.errors).toEqual([]);
    // The new page's prefix ends like the first's: "P5.AScomp." passes, "P5.ASnotes." does not.
    // Try it: https://regex101.com/?regex=%5C.AScomp%5C.%24&testString=P5.AScomp.
    const prefixes = companionPrefixes(viewsOf(engine.doc));
    expect(prefixes[0]).toBe('P4.AScomp.');
    expect(prefixes.slice(1)).toEqual([expect.stringMatching(/\.AScomp\.$/)]);
  });
});

describe('which page the bar shows', () => {
  test('a removed page falls back to the character', () => {
    expect(stillShown(['P4.AScomp.', 'P5.AScomp.'], 'P5.AScomp.')).toBe('P5.AScomp.');
    expect(stillShown(['P4.AScomp.'], 'P5.AScomp.')).toBeNull();
    expect(stillShown(['P4.AScomp.'], null)).toBeNull();
  });

  test('the added page is the prefix that is new', () => {
    expect(addedPage(['P4.AScomp.'], ['P4.AScomp.', 'P12.AScomp.'])).toBe('P12.AScomp.');
    expect(addedPage(['P4.AScomp.'], ['P4.AScomp.'])).toBeNull();
  });
});
