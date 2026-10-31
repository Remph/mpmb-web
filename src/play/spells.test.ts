/* eslint-disable ts-patterns/no-magic-numbers -- spell levels, rows and counts are the test data */
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { viewsOf } from '../worker/views.ts';
import { isReady, preparedCount, readSpells, spellMark, spellPages, spellText } from './spells.ts';
import type { SpellSource } from './spells.ts';

// What the reference characters' spell sheet pages show in Acrobat.
const paladin = viewsOf(openSheet(referenceSheet('paladin8-warlock2')).doc);
const wizard = viewsOf(openSheet(referenceSheet('wizard10-evoker')).doc);

/** Each source with its levels and spell names, as on the sheet. */
const outline = (sources: SpellSource[]): [string, [number, string[]][]][] =>
  sources.map((s) => [s.title, s.levels.map((l): [number, string[]] => [l.level, l.spells.map((sp) => sp.name)])]);

describe('spell sheet', () => {
  it('finds the spell pages in page order', () => {
    expect(spellPages(paladin)).toEqual([{ prefix: 'P6.SSfront.', template: 'SSfront' }]);
    expect(spellPages(wizard)).toEqual([
      { prefix: 'P6.SSfront.', template: 'SSfront' },
      { prefix: 'P7.SSmore.', template: 'SSmore' },
    ]);
  });

  it('reads the paladin/warlock by source and level, like the sheet', () => {
    const sources = readSpells(paladin);
    expect(sources.map((s) => [s.key, s.title, s.dc, s.attack, s.prepareMax])).toEqual([
      ['paladin', 'Paladin Spells', '16', '+8', 7],
      ['warlock', 'Warlock Spells', '16', '+8', null],
      ['magic initiate_-_cleric', 'Magic Initiate', '16', '+8', null],
    ]);
    expect(outline(sources).slice(1)).toEqual([
      [
        'Warlock Spells',
        [
          [0, ['Chill Touch', 'Prestidigitation']],
          [1, ['Charm Person', 'Hellish Rebuke', 'Hex']],
        ],
      ],
      [
        'Magic Initiate',
        [
          [0, ['Mending', 'Sacred Flame']],
          [1, ['Guiding Bolt']],
        ],
      ],
    ]);
    const paladinLevels = sources[0]?.levels ?? [];
    expect(paladinLevels.map((l) => [l.level, l.spells.length])).toEqual([
      [1, 13],
      [2, 11],
    ]);
  });

  it('reads which spells are prepared', () => {
    const [paladinSpells] = readSpells(paladin);
    const all = paladinSpells?.levels.flatMap((l) => l.spells) ?? [];
    expect(all.filter((s) => s.mark.prepared === true && !s.mark.always).map((s) => s.name)).toEqual([
      'Bless',
      'Cure Wounds',
      'Detect Magic',
      'Divine Favor',
      'Lesser Restoration',
      'Prayer of Healing',
      'Shining Smite',
    ]);
    expect(all.filter((s) => s.mark.always).map((s) => s.name)).toEqual([
      'Divine Smite',
      'Prot. from Evil/Good',
      'Shield of Faith',
      'Aid',
      'Find Steed',
      'Zone of Truth',
    ]);
    expect(paladinSpells && preparedCount(paladinSpells)).toBe(7);
    expect(all.filter(isReady)).toHaveLength(13);
  });

  it('reads a spell row with its marks, columns and full text', () => {
    const [paladinSpells] = readSpells(paladin);
    const level1 = paladinSpells?.levels[0]?.spells ?? [];
    expect(level1.find((s) => s.key === 'detect magic')).toMatchObject({
      page: 'P6.SSfront.',
      row: 5,
      name: 'Detect Magic',
      ritual: true,
      needsSight: false,
      concentration: true,
      school: 'Div',
      save: '',
      time: 'Act',
      range: 'S:9-m rad',
      duration: '10 min',
      book: 'SR',
      bookPage: '123',
    });
    const command = level1.find((s) => s.key === 'command');
    expect(command).toMatchObject({ name: 'Command', needsSight: true, save: 'Wis', mark: { prepared: false } });
    expect(level1.find((s) => s.key === 'protection from evil and good')?.fullName).toBe(
      'Protection from Evil and Good',
    );
    const smite = level1.find((s) => s.key === 'divine smite');
    expect(smite?.mark).toMatchObject({ prepared: true, always: true, free: 'long', freeUsed: false });
    expect(smite?.text.startsWith('Divine Smite — Level 1 Evocation\n')).toBe(true);
  });

  it('reads the wizard across two pages, with item charges and spell options', () => {
    const sources = readSpells(wizard);
    expect(sources.map((s) => [s.title, s.prepareMax])).toEqual([
      ['Chthonic Tiefling', null],
      ['Magic Initiate', null],
      ['Evoker Spells', 15],
      ['Staff of the Magi', null],
    ]);
    // The second page starts by finishing the wizard's spells (level 5) before the staff's header.
    const evoker = sources[2];
    expect(evoker?.levels.map((l) => l.level)).toEqual([0, 1, 2, 3, 4, 5]);
    const hand = evoker?.levels[5]?.spells[0];
    expect(hand).toMatchObject({ name: 'Arcane Hand', page: 'P7.SSmore.', row: 3 });
    expect(hand?.options.map((o) => o.name)).toEqual([
      'AH: Clenched Fist',
      'AH: Forceful Hand',
      'AH: Grasping Hand',
      'AH: Interposing Hand',
    ]);
    // Nothing ticked as prepared yet: under "ready" only cantrips are left of the wizard's own spells.
    expect(evoker && preparedCount(evoker)).toBe(0);
    expect(evoker?.levels.flatMap((l) => l.spells).filter(isReady).length).toBe(5);
    const staff = sources[3]?.levels.flatMap((l) => l.spells) ?? [];
    expect(staff.find((s) => s.name === 'Fireball (7th level)')?.mark.charges).toBe(7);
    expect(staff.find((s) => s.name === 'Detect Magic')?.mark).toMatchObject({ atWill: true, prepared: null });
  });

  it('reads every first-column mark MPMB uses', () => {
    expect(spellMark('checkedbox')).toMatchObject({ prepared: true, always: false, free: null });
    expect(spellMark('checkbox')).toMatchObject({ prepared: false });
    expect(spellMark('markedbox')).toMatchObject({ prepared: true, always: true });
    expect(spellMark('oncesr')).toMatchObject({ prepared: null, always: false, free: 'short', freeUsed: false });
    expect(spellMark('oncelr+markedbox_used')).toMatchObject({ always: true, free: 'long', freeUsed: true });
    expect(spellMark('onceday')).toMatchObject({ free: 'day' });
    expect(spellMark('atwill')).toMatchObject({ atWill: true, prepared: null });
    expect(spellMark('2')).toMatchObject({ charges: 2, other: '' });
    expect(spellMark('')).toMatchObject({ prepared: null, other: '' });
    expect(spellMark('d6')).toMatchObject({ prepared: null, other: 'd6' });
  });

  it("splits MPMB's full text for the details", () => {
    const fireball = readSpells(wizard)[2]?.levels[3]?.spells.find((s) => s.key === 'fireball');
    const text = spellText(fireball?.text ?? '');
    expect(text.kind).toBe('Level 3 Evocation');
    expect(text.paragraphs[0]?.startsWith('A bright streak flashes')).toBe(true);
    expect(text.paragraphs.at(-1)?.startsWith('Using a Higher-Level Spell Slot. The damage increases by 1d6')).toBe(
      true,
    );
    expect(text.changes).toEqual([
      'Changes by Evoker: Empowered Evocation',
      '• I add my Intelligence modifier to a single damage roll of any wizard evocation spell I cast.',
    ]);
    expect(spellText('Light')).toEqual({ kind: '', paragraphs: [], changes: [] });
  });

  it('shows nothing for a character without spell pages', () => {
    const blank = viewsOf(openSheet().doc);
    expect(readSpells(blank)).toEqual([]);
  });
});
