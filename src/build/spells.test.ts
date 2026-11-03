/* eslint-disable ts-patterns/no-magic-numbers -- spell levels and counts are the test data */
import { describe, expect, it } from 'vitest';
import type { SpellInfo, SpellSource, SpellsInfo } from '../engine/spells.ts';
import {
  addList,
  byLevel,
  changeCount,
  draftOf,
  fillState,
  filtersOf,
  pickable,
  picksOf,
  textParts,
  toggled,
} from './spells.ts';

const spell = (key: string, name: string, level: number, school = 'Evocation'): SpellInfo => ({
  key,
  name,
  level,
  school,
  time: 'Act',
  range: '18 m',
  duration: 'Instantaneous',
  components: 'V,S',
  ritual: false,
  concentration: false,
  save: '',
  description: '',
  full: '',
  source: "SRD'24 1",
});

const SPELLS: Record<string, SpellInfo> = Object.fromEntries(
  [
    spell('light', 'Light', 0),
    spell('fire bolt', 'Fire Bolt', 0),
    spell('shield', 'Shield', 1, 'Abjuration'),
    spell('magic missile', 'Magic Missile', 1),
    spell('web', 'Web', 2, 'Conjuration'),
    spell('fireball', 'Fireball', 3),
  ].map((s) => [s.key, s]),
);

const source = (over: Partial<SpellSource> = {}): SpellSource => ({
  key: 'wizard',
  name: 'Wizard',
  fullName: 'Wizard, level 3',
  type: 'book',
  level: 3,
  maxLevel: 2,
  cantrips: { count: 2, offset: 0, chosen: ['light'], list: ['light', 'fire bolt'] },
  spells: { count: 20, offset: 0, chosen: ['shield'], list: ['shield', 'magic missile', 'web', 'fireball'] },
  show: 1,
  showOptions: [],
  preparedCantrips: null,
  bonus: [],
  extra: null,
  ...over,
});

const info = (...sources: SpellSource[]): SpellsInfo => ({
  sources,
  included: sources.map((s) => s.key),
  excluded: [],
  options: null,
  spells: SPELLS,
});

describe('the Spells step', () => {
  it('sends MPMB only the parts that changed', () => {
    const wizard = source();
    const all = info(wizard, source({ key: 'staff', type: 'item', cantrips: null, spells: null, show: 0 }));
    const drafts = { wizard: { ...draftOf(wizard), spells: ['shield', 'web'] }, staff: draftOf(all.sources[1]!) };
    expect(picksOf(all, drafts)).toEqual([{ key: 'wizard', spells: ['shield', 'web'] }]);
    expect(changeCount(all, drafts)).toBe(1);
    // Order doesn't count as a change; MPMB sorts them itself.
    expect(picksOf(all, { wizard: { ...draftOf(wizard), cantrips: ['light'] } })).toEqual([]);
    const swapped = { wizard: { cantrips: ['fire bolt'], spells: ['shield'], show: 2 } };
    expect(picksOf(all, swapped)).toEqual([{ key: 'wizard', cantrips: ['fire bolt'], show: 2 }]);
    expect(changeCount(all, swapped)).toBe(3);
  });

  it('lets the player pick for class casters, not for a class that has its whole list', () => {
    expect(pickable(source())).toBe(true);
    expect(pickable(source({ type: 'list', cantrips: null }))).toBe(false);
    expect(pickable(source({ cantrips: null, spells: null }))).toBe(false);
  });

  it('offers cantrips, the levels the source can cast, and higher ones', () => {
    expect(filtersOf(source(), SPELLS)).toEqual([
      { part: 'cantrips' },
      { part: 'spells', level: 1 },
      { part: 'spells', level: 2 },
      { part: 'spells', level: 'higher' },
    ]);
  });

  it('lists the filter’s spells by name, or with a search every spell of the source', () => {
    const wizard = source();
    expect(addList(wizard, { part: 'spells', level: 1 }, '', SPELLS).map((e) => e.key)).toEqual([
      'magic missile',
      'shield',
    ]);
    expect(addList(wizard, { part: 'spells', level: 'higher' }, '', SPELLS).map((e) => e.key)).toEqual(['fireball']);
    expect(addList(wizard, { part: 'cantrips' }, 'fire', SPELLS)).toEqual([
      { key: 'fire bolt', part: 'cantrips' },
      { key: 'fireball', part: 'spells' },
    ]);
    // The school counts too: "conj" finds Web.
    expect(addList(wizard, { part: 'cantrips' }, 'conj', SPELLS).map((e) => e.key)).toEqual(['web']);
  });

  it('groups chosen spells by level, unknown keys last', () => {
    expect(byLevel(['web', 'shield', 'gone', 'magic missile'], SPELLS)).toEqual([
      { level: 1, keys: ['magic missile', 'shield'] },
      { level: 2, keys: ['web'] },
      { level: Number.MAX_SAFE_INTEGER, keys: ['gone'] },
    ]);
  });

  it('adds and removes, and says whether a part is still open', () => {
    expect(toggled(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggled(['a', 'b'], 'a')).toEqual(['b']);
    expect([fillState(1, 2), fillState(2, 2), fillState(3, 2)]).toEqual(['open', 'full', 'over']);
  });
});

describe('textParts', () => {
  it("splits MPMB's full text into paragraphs with its bold headings", () => {
    expect(textParts('You hurl a mote.\n   ***Cantrip Upgrade***. The damage **increases**.')).toEqual([
      [{ text: 'You hurl a mote.', bold: false }],
      [
        { text: 'Cantrip Upgrade', bold: true },
        { text: '. The damage ', bold: false },
        { text: 'increases', bold: true },
        { text: '.', bold: false },
      ],
    ]);
  });
});
