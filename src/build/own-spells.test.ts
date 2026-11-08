import { describe, expect, test } from 'vitest';
import {
  BLANK_SPELL,
  OWN_SPELLS_FILE,
  cantripDieLine,
  isOwnSpellKey,
  ownInfo,
  ownSpellKey,
  ownSpellsChanges,
  ownSpellsFile,
  ownSpellsScript,
  parseOwnSpells,
  problems,
  spellEntry,
  suggestLine,
} from './own-spells.ts';
import type { OwnSpell } from './own-spells.ts';

/** A made-up cantrip: an Int save for 1d10 Psychic that grows like MPMB's cantrips. */
const JAB: OwnSpell = {
  ...BLANK_SPELL,
  name: 'Thought Jab',
  range: '120 ft',
  verbal: false,
  somatic: false,
  roll: 'Int',
  damage: '1d10',
  damageType: 'Psychic',
};

describe('the line on the spell sheet', () => {
  test('a save cantrip that grows', () => {
    expect(suggestLine(JAB)).toBe('Int save or 1d10 Psychic dmg; +1d10 at CL 5, 11, and 17');
  });

  test('a spell attack, a save without damage, damage alone', () => {
    expect(suggestLine({ ...JAB, roll: 'attack', grows: false })).toBe('Spell attack for 1d10 Psychic dmg');
    expect(suggestLine({ ...JAB, damage: '' })).toBe('Int save');
    expect(suggestLine({ ...JAB, roll: '', level: 1 })).toBe('1d10 Psychic dmg');
  });

  test('nothing to write from: empty', () => {
    expect(suggestLine(BLANK_SPELL)).toBe('');
  });

  test('a levelled spell or broken dice never get the cantrip note', () => {
    expect(suggestLine({ ...JAB, level: 2 })).toBe('Int save or 1d10 Psychic dmg');
    expect(suggestLine({ ...JAB, damage: '1d' })).toBe('Int save');
  });
});

describe('the cantrip die', () => {
  test('MPMB’s `CD` takes the place of the first die; the note goes', () => {
    expect(cantripDieLine({ ...JAB, line: suggestLine(JAB) })).toBe('Int save or `CD`d10 Psychic dmg');
  });

  test('a line the player wrote keeps its own words', () => {
    expect(cantripDieLine({ ...JAB, line: 'Mind blast: 1d10 Psychic, Int save' })).toBe(
      'Mind blast: `CD`d10 Psychic, Int save',
    );
  });

  test('none when it doesn’t grow, isn’t a cantrip, or the line lacks the dice', () => {
    const line = suggestLine(JAB);
    expect(cantripDieLine({ ...JAB, line, grows: false })).toBeNull();
    expect(cantripDieLine({ ...JAB, line, level: 1 })).toBeNull();
    expect(cantripDieLine({ ...JAB, line: 'Psychic damage' })).toBeNull();
    expect(cantripDieLine({ ...JAB, line, damage: '2d6' })).toBeNull();
  });
});

describe('MPMB’s entry', () => {
  test('the cantrip', () => {
    expect(spellEntry({ ...JAB, line: suggestLine(JAB), text: 'First part.\n\nSecond\npart.' })).toEqual({
      name: 'Thought Jab',
      classes: [],
      source: [['HB', 0]],
      level: 0,
      school: '',
      time: 'Act',
      range: '120 ft',
      components: '',
      duration: 'Instantaneous',
      description: 'Int save or 1d10 Psychic dmg; +1d10 at CL 5, 11, and 17',
      save: 'Int',
      descriptionCantripDie: 'Int save or `CD`d10 Psychic dmg',
      descriptionFull: ['First part.', 'Second part.'],
    });
  });

  test('components, material, concentration and ritual', () => {
    const entry = spellEntry({
      ...BLANK_SPELL,
      name: 'Glimmer Ward',
      level: 1,
      material: 'a bit of glass',
      duration: '1 min',
      concentration: true,
      ritual: true,
      roll: 'attack',
      line: 'x',
    });
    expect(entry).toMatchObject({ components: 'V,S,M', compMaterial: 'a bit of glass', duration: 'Conc, 1 min' });
    expect(entry.ritual).toBe(true);
    expect(entry).not.toHaveProperty('save');
  });
});

describe('the script', () => {
  test('runs as JavaScript and sets the entries under their keys', () => {
    const spells = [{ ...JAB, line: suggestLine(JAB) }];
    const SpellsList: Record<string, unknown> = {};
    new Function('SpellsList', ownSpellsScript(spells))(SpellsList);
    expect(Object.keys(SpellsList)).toEqual(['own thought jab']);
    expect(SpellsList['own thought jab']).toEqual(spellEntry(spells[0] as OwnSpell));
  });

  test('carries the form’s values back', () => {
    const spells = [JAB, { ...BLANK_SPELL, name: 'Glimmer Ward', level: 1 }];
    expect(parseOwnSpells(ownSpellsScript(spells))).toEqual(spells);
  });

  test('a line separator in the text doesn’t break the comment line', () => {
    const odd = { ...JAB, text: 'one two' };
    const script = ownSpellsScript([odd]);
    expect(script).not.toContain(' ');
    expect(parseOwnSpells(script)).toEqual([odd]);
  });

  test('another script or a damaged data line gives none', () => {
    expect(parseOwnSpells('var iFileName = "x.js";')).toEqual([]);
    expect(parseOwnSpells('// mpmb-web own spells: [{oops')).toEqual([]);
    expect(parseOwnSpells('// mpmb-web own spells: {"name":"x"}')).toEqual([]);
  });

  test('is found among the sheet’s files by its name, and replaced as a whole', () => {
    const file = { key: '2026/11/08 - ' + OWN_SPELLS_FILE, text: ownSpellsScript([JAB]) };
    const other = { key: '2026/11/01 - other.js', text: 'var iFileName = "other.js";' };
    expect(ownSpellsFile([other, file])).toBe(file);
    expect(ownSpellsFile([other])).toBeNull();
    expect(ownSpellsChanges(file, [JAB])).toEqual({ remove: [file.key], add: [ownSpellsScript([JAB])] });
    expect(ownSpellsChanges(null, [JAB]).remove).toEqual([]);
    expect(ownSpellsChanges(file, [])).toEqual({ remove: [file.key], add: [] });
  });
});

describe('keys and checks', () => {
  test('own keys stay apart from MPMB’s', () => {
    expect(ownSpellKey(' Fire Bolt ')).toBe('own fire bolt');
    expect(isOwnSpellKey('own fire bolt')).toBe(true);
    expect(isOwnSpellKey('fire bolt')).toBe(false);
  });

  test('a name, its own; dice that read as dice; a line', () => {
    expect(problems({ ...JAB, line: 'x' }, [])).toEqual({});
    expect(problems({ ...JAB, name: ' ', line: 'x' }, [])).toEqual({ name: 'empty' });
    expect(problems({ ...JAB, line: 'x' }, [{ ...JAB, name: 'thought jab ' }])).toEqual({ name: 'taken' });
    expect(problems({ ...JAB, damage: '1d10+3', line: '' }, [])).toEqual({ damage: 'dice', line: 'empty' });
  });
});

test('the step’s view of a spell MPMB doesn’t hold yet', () => {
  const info = ownInfo({ ...JAB, school: 'Evoc', line: 'x', text: 'a\n\nb' });
  expect(info).toMatchObject({
    key: 'own thought jab',
    name: 'Thought Jab',
    school: 'Evocation',
    save: 'Int',
    full: 'a\nb',
  });
});
