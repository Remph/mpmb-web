// Wild Shape pages (template WSfront): MPMB fills a form from its creature list when the creature's name goes
// into "Wildshape.Race.<n>". The forms are SRD beasts, so the test carries no content beyond the SRD.
import { describe, expect, test } from 'vitest';
import { applyUpstreamFixes } from '../src/engine/upstream-fixes.ts';
import { valueOf } from '../src/play/read.ts';
import { readWildShapeRules, readWildShapes, wildShapePrefixes } from '../src/play/wild-shapes.ts';
import { viewsOf } from '../src/worker/views.ts';
import { openSheet, referenceSheet } from './characters.ts';
import { vmRealm } from './vm-realm.ts';

describe('Wild Shape forms', () => {
  test("a form with traits gets them (MPMB's pop/prop slip is mended)", () => {
    const engine = openSheet(referenceSheet('wizard10-evoker'));
    engine.evaluate('DoTemplate("WSfront", "Add")');
    const prefix = String(engine.evaluate('What("Template.extras.WSfront")')).split(',')[1];
    expect(prefix).toMatch(/\.WSfront\.$/);

    engine.evaluate('AddWildshape("Wolf")');
    expect(engine.stats.errors).toEqual([]);
    const fields = viewsOf(engine.doc);
    expect(valueOf(fields, `${prefix}Wildshape.Race.1`)).toBe('Wolf');
    expect(valueOf(fields, `${prefix}Wildshape.1.Attack.1.Weapon`)).toBe('Bite');
    // Without the fix this box stays empty and the add throws "pop is not defined".
    expect(valueOf(fields, `${prefix}Wildshape.1.Traits`)).toContain('Pack Tactics');
  });

  test('the play view reads the forms and the page rules back', () => {
    const engine = openSheet(referenceSheet('wizard10-evoker'));
    expect(wildShapePrefixes(viewsOf(engine.doc))).toEqual([]);
    expect(readWildShapeRules(viewsOf(engine.doc))).toBeNull();

    engine.evaluate('DoTemplate("WSfront", "Add")');
    engine.evaluate('AddWildshape("Wolf")');
    engine.evaluate('AddWildshape("Brown Bear")');
    engine.runTimers();
    expect(engine.stats.errors).toEqual([]);

    const fields = viewsOf(engine.doc);
    const forms = readWildShapes(fields);
    expect(forms.map((f) => [f.name, f.slot])).toEqual([
      ['Wolf', 1],
      ['Brown Bear', 2],
    ]);
    const [wolf, bear] = forms;
    expect(wolf).toMatchObject({ challenge: '1/4', creatureType: 'Beast', size: 'Medium', armorClass: '12' });
    expect(wolf?.abilities.map((a) => a.key)).toEqual(['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha']);
    // A form takes the beast's Str, Dex and Con, and keeps the character's Int, Wis and Cha (the wizard's Int 20).
    expect(wolf?.abilities.find((a) => a.key === 'Str')?.score).toBe('14');
    expect(wolf?.abilities.find((a) => a.key === 'Int')?.score).toBe(valueOf(fields, 'Int'));
    expect(wolf?.attacks.map((a) => a.name)).toEqual(['Bite']);
    expect(bear?.attacks.map((a) => a.name)).toEqual(['Bite', 'Claw']);
    const perception = wolf?.skills.find((s) => s.key === 'Perc');
    expect(perception?.mark).not.toBe('nothing');
    // MPMB's slip in the field's name made every form's Passive Perception 10.
    expect(Number(wolf?.passivePerception)).toBe(10 + Number(perception?.bonus));
    // A wizard has no Wild Shape, so MPMB's page shows no rules for it; the fields are there all the same.
    expect(readWildShapeRules(fields)).not.toBeNull();
  });
});

describe('upstream fixes', () => {
  test('a fix mends only a function that still has the faulty text', () => {
    const realm = vmRealm();
    realm.evaluate('function broken() { var prop = { a: 1 }; return pop.a; } function fine() { return 2; }');
    const popToProp = [{ find: /\bpop\./g, replace: 'prop.' }];
    const fixes = [
      { name: 'broken', edits: popToProp },
      { name: 'fine', edits: popToProp },
      { name: 'missing', edits: [{ find: /x/g, replace: 'y' }] },
    ];
    expect(applyUpstreamFixes(realm, fixes)).toEqual(['broken']);
    expect(realm.evaluate('broken()')).toBe(1);
    // Applying again finds nothing left to mend.
    expect(applyUpstreamFixes(realm, fixes)).toEqual([]);
  });
});
