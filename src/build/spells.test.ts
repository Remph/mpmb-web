/* eslint-disable ts-patterns/no-magic-numbers -- spell levels and counts are the test data */
import { describe, expect, it } from 'vitest';
import type { SpellInfo, SpellSource, SpellsInfo } from '../engine/spells.ts';
import {
  addList,
  bonusPickable,
  byLevel,
  changeCount,
  draftOf,
  fillState,
  filtersOf,
  moved,
  pickable,
  picksOf,
  preparing,
  sheetChangeCount,
  sheetDraftOf,
  sheetPicksOf,
  switched,
  textParts,
  toggled,
  toPrepare,
  withBook,
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
  prepared: null,
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
    const swapped = { wizard: { ...draftOf(wizard), cantrips: ['fire bolt'], show: 2 } };
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

describe('bonus and prepared spells', () => {
  const initiate = source({
    key: 'initiate',
    type: 'feat',
    cantrips: null,
    spells: null,
    show: 0,
    bonus: [
      { name: 'Cantrip', chosen: 'light', list: ['light', 'fire bolt'], extra: false },
      { name: '1st-Level', chosen: '', list: ['shield', 'magic missile'], extra: false },
      { name: 'Cantrip', chosen: '', list: ['light', 'fire bolt'], extra: true },
    ],
  });
  const wizard = source({
    show: 1,
    spells: { count: 20, offset: 0, chosen: ['shield', 'magic missile', 'web', 'fireball'], list: [] },
    prepared: { count: 2, offset: 0, chosen: ['shield'], list: ['shield', 'magic missile', 'web'] },
  });

  it('sends the whole bonus list when one of them changed, and the prepared spells as a set', () => {
    const all = info(initiate, wizard);
    const drafts = {
      initiate: { ...draftOf(initiate), bonus: ['light', 'magic missile'] },
      wizard: { ...draftOf(wizard), show: 3, prepared: ['web', 'shield'] },
    };
    expect(picksOf(all, drafts)).toEqual([
      { key: 'initiate', bonus: ['light', 'magic missile'] },
      { key: 'wizard', show: 3, prepared: ['web', 'shield'] },
    ]);
    expect(changeCount(all, drafts)).toBe(3);
  });

  it('shows the spells to prepare only with "Prepared spells only", by level', () => {
    expect(preparing(wizard, draftOf(wizard))).toBe(false);
    expect(preparing(wizard, { ...draftOf(wizard), show: 3 })).toBe(true);
    expect(filtersOf(wizard, SPELLS, 'prepare')).toEqual([
      { part: 'prepared', level: 1 },
      { part: 'prepared', level: 2 },
    ]);
    expect(addList(wizard, { part: 'prepared', level: 1 }, '', SPELLS)).toEqual([
      { key: 'magic missile', part: 'prepared' },
      { key: 'shield', part: 'prepared' },
    ]);
  });

  it("follows the step's spellbook: new spells can be prepared, removed ones are no longer prepared", () => {
    // Fireball is above what the wizard casts, so MPMB doesn't offer it to prepare.
    expect(toPrepare(wizard, draftOf(wizard), SPELLS)).toEqual(['shield', 'magic missile', 'web']);
    const draft = { ...draftOf(wizard), show: 3, spells: ['shield', 'web', 'fire bolt'], prepared: ['shield'] };
    expect(toPrepare(wizard, draft, SPELLS)).toEqual(['shield', 'web']);
    expect(filtersOf(wizard, SPELLS, 'prepare', draft)).toEqual([
      { part: 'prepared', level: 1 },
      { part: 'prepared', level: 2 },
    ]);
    expect(addList(wizard, { part: 'prepared', level: 2 }, '', SPELLS, draft).map((e) => e.key)).toEqual(['web']);
    expect(withBook(wizard, { ...draft, spells: ['web'] }).prepared).toEqual([]);
    // A class that prepares from its whole list keeps MPMB's list.
    const cleric = source({ type: 'list', prepared: wizard.prepared });
    expect(toPrepare(cleric, { ...draftOf(cleric), spells: [] }, SPELLS)).toEqual(['shield', 'magic missile', 'web']);
  });

  it('counts and sends prepared spells only while "Prepared spells only" is on', () => {
    const all = info(wizard);
    const drafts = { wizard: { ...draftOf(wizard), show: 3, prepared: ['web', 'shield'] } };
    expect(changeCount(all, drafts)).toBe(2);
    const back = { wizard: { ...drafts.wizard, show: 1 } };
    expect(changeCount(all, back)).toBe(0);
    expect(picksOf(all, back)).toEqual([]);
  });

  it("doesn't offer a change for the extra rows raised in Acrobat", () => {
    expect([0, 1, 2].map((i) => bonusPickable(initiate, i))).toEqual([true, true, false]);
  });
});

describe('the spell sheet settings', () => {
  const all: SpellsInfo = {
    ...info(source(), source({ key: 'staff' }), source({ key: 'tiefling' })),
    included: ['wizard', 'staff', 'tiefling'],
    excluded: [],
    options: {
      glossary: false,
      dashEmptyFields: true,
      amendSpellDescriptions: true,
      allowSpellAdd: true,
      useDependencies: true,
    },
  };

  it('counts a new order once, each source taken off or put back, and each option', () => {
    const draft = sheetDraftOf(all);
    expect(draft && sheetPicksOf(all, draft)).toBeNull();
    if (!draft) return;
    const reordered = { ...draft, included: moved(draft.included, 'tiefling', -1) };
    expect(reordered.included).toEqual(['wizard', 'tiefling', 'staff']);
    expect(sheetChangeCount(all, reordered)).toBe(1);
    const off = switched(reordered, 'staff');
    expect(off).toMatchObject({ included: ['wizard', 'tiefling'], excluded: ['staff'] });
    // Staff off the sheet: wizard, tiefling is the old order again, so that's one change, plus the glossary.
    expect(sheetChangeCount(all, { ...off, options: { ...off.options, glossary: true } })).toBe(2);
    expect(sheetPicksOf(all, off)).toMatchObject({ included: ['wizard', 'tiefling'], excluded: ['staff'] });
    // The first can't go up, the last can't go down.
    expect(moved(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
    expect(moved(['a', 'b'], 'b', 1)).toEqual(['a', 'b']);
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

describe('own spells as extra rows', () => {
  const feature = { name: 'Cantrip', chosen: 'light', list: ['light', 'fire bolt'], extra: false };
  const ownRow = (key: string) => ({ name: '', chosen: key, list: [], extra: true });
  const withOwn = source({ bonus: [feature, ownRow('own thought jab'), ownRow('fire bolt')] });
  const info = (s: SpellSource): SpellsInfo => ({
    sources: [s],
    included: [],
    excluded: [],
    options: null,
    spells: SPELLS,
  });

  it('reads only the own keys among the extra rows', () => {
    expect(draftOf(withOwn).own).toEqual(['own thought jab']);
  });

  it('an own spell added or taken out is a change, sent as `own`', () => {
    const drafts = { wizard: { ...draftOf(withOwn), own: ['own thought jab', 'own glimmer'] } };
    expect(changeCount(info(withOwn), drafts)).toBe(1);
    expect(picksOf(info(withOwn), drafts)).toEqual([{ key: 'wizard', own: ['own thought jab', 'own glimmer'] }]);
  });

  it('a renamed own spell in a stale bonus row is no bonus change', () => {
    const renamed = source({ bonus: [feature, ownRow('own thought spike'), ownRow('fire bolt')] });
    const drafts = { wizard: { ...draftOf(withOwn), own: ['own thought spike'] } };
    expect(changeCount(info(renamed), drafts)).toBe(0);
    expect(picksOf(info(renamed), drafts)).toEqual([]);
  });
});
