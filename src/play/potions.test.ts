import { describe, expect, it } from 'vitest';
import { formulaText } from '../dice/dice.ts';
import { fullValue, healing, leastValue, potionOf, unchangedSince } from './potions.ts';
import { withValues } from '../../test/fields.ts';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { viewsOf } from '../worker/views.ts';

// The reference paladin has 92 hit points.
const paladin = viewsOf(openSheet(referenceSheet('paladin8-warlock2')).doc);

const dice = (name: string): string => {
  const potion = potionOf(name);
  return potion ? formulaText(potion.formula) : '';
};

describe('healing potions by name', () => {
  it.each([
    ['Potion of Healing', '2d4+2'],
    ['Greater Potion of Healing', '4d4+4'],
    ['Potion of Greater Healing', '4d4+4'],
    ['Potion of Superior Healing', '8d4+8'],
    ['Potion of Supreme Healing', '10d4+20'],
    ['potion of healing (common; 2d4+2)', '2d4+2'],
    ['Small Potion of Healing', '2d4+2'],
    ['Potion of Healing (3d4+3)', '3d4+3'],
    ['Großer Heiltrank', '4d4+4'],
    ['Heiltrank', '2d4+2'],
    ['Trank der großen Heilung', '4d4+4'],
    ['Healing Potion', '2d4+2'],
  ])('%s heals %s', (name, formula) => {
    expect(dice(name)).toBe(formula);
  });

  it('leaves other potions and things alone', () => {
    expect(potionOf('Potion of Heroism')).toBeNull();
    expect(potionOf("Healer's Kit")).toBeNull();
    expect(potionOf('Potion of Poison Resistance')).toBeNull();
    expect(potionOf('Trank des Wachstums')).toBeNull();
  });

  it('reads a count in brackets as no dice', () => {
    // "(2)" is how many, not a formula: the table's dice stay.
    expect(dice('Potion of Healing (2)')).toBe('2d4+2');
  });

  it('never heals less than 0, whatever a homebrew name says', () => {
    const potion = potionOf('Potion of Healing (1d4-6)');
    expect(potion && [leastValue(potion.formula), fullValue(potion.formula)]).toEqual([0, 0]);
  });

  it('knows the full value and the least', () => {
    const potion = potionOf('Potion of Healing');
    expect(potion && [leastValue(potion.formula), fullValue(potion.formula)]).toEqual([4, 10]);
  });
});

describe('drinking heals like the Heal window', () => {
  it('adds the hit points and keeps what Undo writes back', () => {
    const hurt = withValues(paladin, { 'HP Current': '61' });
    expect(healing(hurt, 7)).toEqual({
      current: 68,
      edits: [{ edit: 'HP Current', text: '68' }],
      clicks: [],
      undo: { edits: [{ edit: 'HP Current', text: '61' }], clicks: [] },
      after: 68,
    });
  });

  it('stops at the maximum, which the sheet writes as an empty field', () => {
    const hurt = withValues(paladin, { 'HP Current': '88' });
    expect(healing(hurt, 10).edits).toEqual([{ edit: 'HP Current', text: '' }]);
    // Already whole: nothing to write.
    expect(healing(paladin, 10).edits).toEqual([]);
  });

  it('clears the death saves when it brings the character back from 0', () => {
    const dying = withValues(paladin, { 'HP Current': '0', 'Death Save Fail1': 'Yes' });
    const result = healing(dying, 5);
    expect(result.clicks).toEqual(['Death Save Fail1']);
    expect(result.undo.clicks).toEqual(['Death Save Fail1']);
  });
});

describe('Undo only while nothing else changed', () => {
  const after = { hp: 68, count: { field: 'Adventuring Gear Amount 1', left: 4 }, unticked: ['Death Save Fail1'] };
  const drunk = { 'HP Current': '68', 'Adventuring Gear Amount 1': '4', 'Death Save Fail1': 'Off' };

  it('can undo while the sheet is as the drink left it', () => {
    expect(unchangedSince(withValues(paladin, drunk), after)).toBe(true);
  });

  it('cannot after damage, a stepped count or a new death save', () => {
    expect(unchangedSince(withValues(paladin, { ...drunk, 'HP Current': '60' }), after)).toBe(false);
    expect(unchangedSince(withValues(paladin, { ...drunk, 'Adventuring Gear Amount 1': '3' }), after)).toBe(false);
    expect(unchangedSince(withValues(paladin, { ...drunk, 'Death Save Fail1': 'Yes' }), after)).toBe(false);
  });

  it('reads full health as the empty field', () => {
    const whole = { hp: null, count: null, unticked: [] };
    expect(unchangedSince(withValues(paladin, { 'HP Current': '' }), whole)).toBe(true);
    expect(unchangedSince(withValues(paladin, { 'HP Current': '91' }), whole)).toBe(false);
  });
});
