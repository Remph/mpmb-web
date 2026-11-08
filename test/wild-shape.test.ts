// Wild Shape pages (template WSfront): MPMB fills a form from its creature list when the creature's name goes
// into "Wildshape.Race.<n>". The forms are SRD beasts, so the test carries no content beyond the SRD.
import { describe, expect, test } from 'vitest';
import { offers } from '../src/engine/choices.ts';
import type { MenuItem } from '../src/engine/host.ts';
import { applyUpstreamFixes } from '../src/engine/upstream-fixes.ts';
import { readWildShapeOptions, WILD_SHAPE_OPTIONS_SCRIPT } from '../src/engine/wild-shape-options.ts';
import { PAGES_LAYOUT_BOOKMARK } from '../src/play/companions.ts';
import { valueOf } from '../src/play/read.ts';
import {
  ADD_FIRST_WILD_SHAPE_PAGE,
  addFormAnswer,
  formAsCompanion,
  formMenu,
  readWildShapeRules,
  formLimits,
  readWildShapes,
  removeFormStep,
  wildShapePrefixes,
} from '../src/play/wild-shapes.ts';
import { viewsOf } from '../src/worker/views.ts';
import { openSheet, referenceSheet } from './characters.ts';
import { ScriptedHost } from './hosts.ts';
import { vmRealm } from './vm-realm.ts';

/** Answers the next menu with a cReturn, as the worker's `pick` does. */
class Picking extends ScriptedHost {
  answer: string | null = null;
  picked = false;

  override popUpMenu(items: MenuItem[]): string | null {
    const answer = this.answer;
    this.answer = null;
    this.picked = answer !== null && offers(items, answer);
    return this.picked ? answer : null;
  }
}

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
    // A wizard has no Wild Shape, so MPMB's page shows no rules for it.
    expect(readWildShapeRules(fields)).toBeNull();
  });

  test("a druid's rules are there before the first page", () => {
    const engine = openSheet(referenceSheet('wizard10-evoker'));
    // The SRD druid, level 8: Wild Shape with "CR 1 or lower" and eight known forms (2024 rules).
    engine.evaluate('Value("Class and Levels", "Druid 8")');
    engine.runTimers();
    const fields = viewsOf(engine.doc);
    expect(wildShapePrefixes(fields)).toEqual([]);
    const rules = readWildShapeRules(fields);
    expect(rules).not.toBeNull();
    expect(Number(rules?.tempHp)).toBe(8);
    expect(formLimits(rules)).toMatchObject({ maxChallenge: 1, noFly: false, known: 8 });
  });
});

describe('adding and removing forms the way the app does', () => {
  test("the window's beasts are what MPMB's menu offers, and a pick adds the form", () => {
    const host = new Picking();
    const engine = openSheet(referenceSheet('wizard10-evoker'), host);
    const beasts = readWildShapeOptions(engine.evaluate(WILD_SHAPE_OPTIONS_SCRIPT));
    const wolf = beasts.find((b) => b.name === 'Wolf');
    expect(wolf).toMatchObject({ key: 'wolf', challenge: '1/4', challengeValue: 0.25, group: '' });
    // MPMB's menu stops at CR 6, and so does the window.
    expect(beasts.every((b) => b.group !== '' || b.challengeValue <= 6)).toBe(true);

    // No page yet: the first comes from MPMB's pages layout menu, then the page's own menu adds the beast.
    host.answer = ADD_FIRST_WILD_SHAPE_PAGE;
    engine.clickBookmark(PAGES_LAYOUT_BOOKMARK);
    expect(host.picked).toBe(true);
    const [prefix] = wildShapePrefixes(viewsOf(engine.doc));
    expect(prefix).toBeDefined();

    // Every beast the window lists is an answer MPMB's menu offers (the worker's pick checks it the same way).
    let items: MenuItem[] = [];
    host.popUpMenu = (menu) => {
      items = menu;
      return null;
    };
    engine.click(formMenu(prefix!));
    expect(beasts.filter((b) => !offers(items, addFormAnswer(b)))).toEqual([]);
    host.popUpMenu = Picking.prototype.popUpMenu;

    host.answer = addFormAnswer(wolf!);
    engine.click(formMenu(prefix!));
    expect(host.picked).toBe(true);
    expect(engine.stats.errors).toEqual([]);
    expect(readWildShapes(viewsOf(engine.doc)).map((f) => f.name)).toEqual(['Wolf']);
  });

  test('a fifth form gets a new page, and removing a form empties its place', () => {
    const engine = openSheet(referenceSheet('wizard10-evoker'));
    engine.evaluate('DoTemplate("WSfront", "Add")');
    for (const name of ['Wolf', 'Boar', 'Elk', 'Panther', 'Brown Bear']) engine.evaluate(`AddWildshape("${name}")`);
    let forms = readWildShapes(viewsOf(engine.doc));
    expect(forms.map((f) => f.name)).toEqual(['Wolf', 'Boar', 'Elk', 'Panther', 'Brown Bear']);
    expect(new Set(forms.map((f) => f.prefix)).size).toBe(2);

    const elk = forms[2]!;
    const { edit, text } = removeFormStep(elk);
    engine.edit(edit, text);
    expect(engine.stats.errors).toEqual([]);
    forms = readWildShapes(viewsOf(engine.doc));
    expect(forms.map((f) => f.name)).toEqual(['Wolf', 'Boar', 'Panther', 'Brown Bear']);
    // The form's numbers went with it.
    expect(valueOf(viewsOf(engine.doc), `${elk.prefix}Wildshape.${elk.slot}.AC`)).toBe('');
  });

  test('a form reads like a companion page, its senses apart from its traits', () => {
    const engine = openSheet(referenceSheet('wizard10-evoker'));
    engine.evaluate('DoTemplate("WSfront", "Add")');
    engine.evaluate('AddWildshape("Wolf")');
    const [wolf] = readWildShapes(viewsOf(engine.doc));
    const shape = formAsCompanion(wolf!, 'Wild Shape form');
    expect(shape).toMatchObject({ creature: 'Wolf', kind: 'Wild Shape form', armorClass: '12' });
    expect(shape.senses).toMatch(/^Darkvision/);
    expect(shape.traits).toContain('Pack Tactics');
    expect(shape.traits).not.toContain('##Senses##');
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
