// Wild Shape pages (template WSfront): MPMB fills a form from its creature list when the creature's name goes
// into "Wildshape.Race.<n>". The forms are SRD beasts, so the test carries no content beyond the SRD.
import { describe, expect, test } from 'vitest';
import { applyUpstreamFixes } from '../src/engine/upstream-fixes.ts';
import { valueOf } from '../src/play/read.ts';
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
});

describe('upstream fixes', () => {
  test('a fix mends only a function that still has the faulty text', () => {
    const realm = vmRealm();
    realm.evaluate('function broken() { var prop = { a: 1 }; return pop.a; } function fine() { return 2; }');
    const fixes = [
      { name: 'broken', find: /\bpop\./g, replace: 'prop.' },
      { name: 'fine', find: /\bpop\./g, replace: 'prop.' },
      { name: 'missing', find: /x/g, replace: 'y' },
    ];
    expect(applyUpstreamFixes(realm, fixes)).toEqual(['broken']);
    expect(realm.evaluate('broken()')).toBe(1);
    // Applying again finds nothing left to mend.
    expect(applyUpstreamFixes(realm, fixes)).toEqual([]);
  });
});
