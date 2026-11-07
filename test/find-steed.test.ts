// Find Steed: the app's own companion template and Otherworldly Steed (src/engine/lists/find-steed.js, SRD
// 5.2.1), picked through MPMB's Companion Options menu like a familiar, with the numbers of the spell slot.
import { describe, expect, test } from 'vitest';
import { blankSheet, characterSheet } from '../src/engine/sheet.ts';
import { diffCharacter } from '../src/engine/sheet-data.ts';
import type { CharacterData } from '../src/engine/sheet-data.ts';
import { COMPANION_OPTIONS_SCRIPT, readCompanionOptions } from '../src/engine/companion-options.ts';
import { goneSpell, offeredLevels, readCompanions, summonEdits } from '../src/play/companions.ts';
import type { Companion } from '../src/play/companions.ts';
import { viewsOf } from '../src/worker/views.ts';
import { openSheet, referenceSheet } from './characters.ts';

const PAGE = 'P4.AScomp.';
/** What the Companion Options menu answers for "Create Steed (Find Steed spell) > Otherworldly Steed". */
const STEED = `["companion", "add_comp", "mount", "Otherworldly Steed", "otherworldly steed"]`;

function summon(level?: number) {
  const engine = openSheet(referenceSheet('wizard10-evoker'));
  if (level !== undefined) engine.edit(`${PAGE}Comp.Use.HD.Level`, String(level));
  engine.evaluate(`MakeCompMenu_CompOptions("${PAGE}", ${STEED})`);
  settle(engine);
  expect(engine.stats.errors).toEqual([]);
  return engine;
}

/** Lets MPMB's calculations finish and the fields show their text, as the worker does after a change. */
function settle(engine: ReturnType<typeof openSheet>) {
  engine.runTimers();
  engine.doc.formatAll();
}

const steedOf = (engine: ReturnType<typeof openSheet>) => readCompanions(viewsOf(engine.doc))[0]!;

describe('the Otherworldly Steed', () => {
  test('is offered in the Companion Options menu, under its own template', () => {
    const engine = openSheet(referenceSheet('wizard10-evoker'));
    const offered = engine.evaluate(
      `JSON.stringify(MakeCompMenu_CompOptions("${PAGE}", "justCompanions").mount)`,
    ) as string;
    expect(JSON.parse(offered)).toEqual([['Otherworldly Steed', 'otherworldly steed', expect.any(String)]]);
  });

  test('a level 2 spell, the lowest, gives the stat block’s numbers for level 2', () => {
    const steed = steedOf(summon());
    expect(steed).toMatchObject({
      creature: 'Otherworldly Steed',
      kind: 'Steed',
      size: 'Large',
      armorClass: '12',
      hp: { max: 25 },
    });
    expect(steed.speed).not.toMatch(/Fly/);
    expect(steed.attacks[0]).toMatchObject({
      name: 'Otherworldly Slam',
      damage: expect.stringMatching(/^1d8\s*\+\s*2$/),
    });
  });

  test('a level 4 slot: AC 14, 45 HP, a flying speed and a stronger slam', () => {
    const engine = summon(4);
    const steed = steedOf(engine);
    expect(steed).toMatchObject({ armorClass: '14', hp: { max: 45 } });
    expect(steed.speed).toMatch(/Fly/);
    expect(steed.attacks[0]?.damage).toMatch(/^1d8\s*\+\s*4$/);
    expect(`${steed.traits} ${steed.features}`).toContain('2d8 + 4');
    expect(String(engine.doc.states.get(`${PAGE}Comp.Use.HD.Level`)?.value)).toBe('4');
  });

  test('keeps its spell level when the character opens again', () => {
    const first = summon(5);
    const saved = JSON.parse(JSON.stringify(diffCharacter(blankSheet(), first.snapshot()))) as CharacterData;
    const again = openSheet(characterSheet(saved));
    expect(again.stats.errors).toEqual([]);
    expect(again.evaluate(`CurrentCompRace["${PAGE}"].ac`)).toBe(15);
    expect(steedOf(again)).toMatchObject({ armorClass: '15', hp: { max: 55 } });
  });

  test('cast again with another slot: the page gets the new numbers and keeps its name', () => {
    const engine = summon(2);
    engine.edit(`${PAGE}Comp.Desc.Name`, 'Starlight');
    engine.edit(`${PAGE}Comp.Use.HP.Current`, '0');
    summonEdits(PAGE, 3, true).forEach(({ edit, text }) => engine.edit(edit, text));
    engine.evaluate(`MakeCompMenu_CompOptions("${PAGE}", ${STEED})`);
    settle(engine);
    expect(engine.stats.errors).toEqual([]);
    const steed = steedOf(engine);
    expect(steed).toMatchObject({ name: 'Starlight', creature: 'Otherworldly Steed', armorClass: '13' });
    expect(steed.hp).toMatchObject({ max: 35, current: null });
    expect(steed.attacks[0]).toMatchObject({
      name: 'Otherworldly Slam',
      damage: expect.stringMatching(/^1d8\s*\+\s*3$/),
    });
  });
});

describe('what the "Add a companion" window offers', () => {
  test('every template with its creatures, read from the loaded lists', () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    const templates = readCompanionOptions(engine.evaluate(COMPANION_OPTIONS_SCRIPT));
    expect(engine.stats.errors).toEqual([]);
    expect(templates.map((t) => t.key)).toEqual(['familiar', 'pact_of_the_chain', 'mount']);
    const familiar = templates[0]!;
    expect(familiar).toMatchObject({ name: 'Find Familiar', spell: 'Find Familiar' });
    expect(familiar.creatures.find((c) => c.key === 'owl')).toMatchObject({
      name: 'Owl',
      answer: 'companion#add_comp#familiar#Owl#owl',
      size: 5,
      levels: null,
    });

    const steed = templates[2]!;
    expect(steed).toMatchObject({ name: 'Find Steed', menuName: 'Steed (Find Steed spell)', spell: 'Find Steed' });
    const [otherworldly] = steed.creatures;
    expect(otherworldly).toMatchObject({
      key: 'otherworldly steed',
      answer: 'companion#add_comp#mount#Otherworldly Steed#otherworldly steed',
      size: 2,
      type: 'Celestial, Fey, Fiend',
    });
    expect(otherworldly?.levels?.map((l) => l.level)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(otherworldly?.levels?.[0]).toEqual({ level: 2, ac: '12', hp: 25, speed: '60 ft' });
    expect(otherworldly?.levels?.[2]).toEqual({ level: 4, ac: '14', hp: 45, speed: '60 ft, Fly 60 ft' });
  });

  test('a steed an add-on script gives the template is offered next to the Otherworldly Steed', () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    engine.evaluate(`CreatureList["test mule"] = { name: "Test Mule", source: [["HB", 0]], size: 2, type: "Beast",
      companion: ["mount"], ac: 10, hp: 11, hd: [2, 10], speed: "40 ft", scores: [14, 10, 13, 2, 10, 5],
      challengeRating: "1/8", proficiencyBonus: 2, attacksAction: 0, attacks: [] };`);
    const steed = readCompanionOptions(engine.evaluate(COMPANION_OPTIONS_SCRIPT)).find((t) => t.key === 'mount');
    expect(steed?.creatures.map((c) => c.name)).toEqual(['Otherworldly Steed', 'Test Mule']);
    expect(steed?.creatures[1]).toMatchObject({ ac: '10', hp: 11, levels: null });
  });
});

describe('a companion from a spell comes and goes', () => {
  const SPELLS = new Map([['mount', 'Find Steed']]);
  const steed = (current: number | null, template = 'mount'): Companion =>
    ({
      template,
      hp: { current, max: 25, temp: null, deathSaves: { successes: 0, failures: 0 } },
    }) as Companion;

  test('is gone at 0 HP, and only when its template comes from a spell', () => {
    expect(goneSpell(steed(0), SPELLS)).toBe('Find Steed');
    expect(goneSpell(steed(1), SPELLS)).toBeNull();
    // An empty box is full health, as MPMB leaves a fresh page.
    expect(goneSpell(steed(null), SPELLS)).toBeNull();
    expect(goneSpell(steed(0, ''), SPELLS)).toBeNull();
    expect(goneSpell(steed(0, 'companion'), SPELLS)).toBeNull();
  });

  test('offers the slot levels from the spell’s own up to the character’s highest slot', () => {
    const levels = [2, 3, 4, 5, 6, 7, 8, 9].map((level) => ({ level }));
    expect(offeredLevels(levels, 3).map((l) => l.level)).toEqual([2, 3]);
    // Without slots high enough, the spell's own level is still there to pick.
    expect(offeredLevels(levels, 0).map((l) => l.level)).toEqual([2]);
    expect(offeredLevels(levels, 9)).toHaveLength(8);
  });

  test('casting again empties the attack names and the page before the level goes into the Hit Dice box', () => {
    const attacks = [1, 2, 3].map((row) => ({ edit: `P4.AScomp.Comp.Use.Attack.${row}.Weapon Selection`, text: '' }));
    expect(summonEdits('P4.AScomp.', 3, true)).toEqual([
      ...attacks,
      { edit: 'P4.AScomp.Comp.Race', text: '' },
      { edit: 'P4.AScomp.Comp.Use.HD.Level', text: '3' },
    ]);
    expect(summonEdits('P4.AScomp.', null, false)).toEqual(attacks);
  });
});

test('a page emptied with MPMB’s own menu gets the steed’s attack too', () => {
  const engine = summon(2);
  engine.evaluate(`MakeCompMenu_CompOptions("${PAGE}", ["companion", "reset_page"])`);
  settle(engine);
  summonEdits(PAGE, null, false).forEach(({ edit, text }) => engine.edit(edit, text));
  engine.evaluate(`MakeCompMenu_CompOptions("${PAGE}", ${STEED})`);
  settle(engine);
  expect(steedOf(engine).attacks.map((a) => a.name)).toEqual(['Otherworldly Slam']);
});
