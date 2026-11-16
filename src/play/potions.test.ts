import { describe, expect, it } from 'vitest';
import { formulaText } from '../dice/dice.ts';
import { fullValue, healing, leastValue, potionOf } from './potions.ts';
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
  ])('%s heals %s', (name, formula) => {
    expect(dice(name)).toBe(formula);
  });

  it('leaves other potions and things alone', () => {
    expect(potionOf('Potion of Heroism')).toBeNull();
    expect(potionOf("Healer's Kit")).toBeNull();
    expect(potionOf('Potion of Poison Resistance')).toBeNull();
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
