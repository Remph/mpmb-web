/* eslint-disable ts-patterns/no-magic-numbers -- hit points and counts are the test data */
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { withValues } from '../../test/fields.ts';
import { viewsOf } from '../worker/views.ts';
import { readSpellSlotUse } from './read.ts';
import {
  applyDamage,
  applyHealing,
  dawn,
  dawnFeatures,
  longRest,
  rollRegain,
  shortRest,
  slotClicks,
  tickedDeathSaves,
  usedText,
} from './rules.ts';

const paladin = viewsOf(openSheet(referenceSheet('paladin8-warlock2')).doc);
const wizard = viewsOf(openSheet(referenceSheet('wizard10-evoker')).doc);

describe('hit points', () => {
  it('takes damage from temporary hit points first', () => {
    expect(applyDamage({ current: 71, max: 92, temp: 5 }, 3)).toEqual({ current: 71, temp: 2 });
    expect(applyDamage({ current: 71, max: 92, temp: 5 }, 12)).toEqual({ current: 64, temp: 0 });
  });

  it('stops at 0 and counts an empty field as full', () => {
    expect(applyDamage({ current: 4, max: 92, temp: null }, 10)).toEqual({ current: 0, temp: 0 });
    expect(applyDamage({ current: null, max: 92, temp: null }, 10)).toEqual({ current: 82, temp: 0 });
  });

  it('heals up to the maximum and keeps temporary hit points', () => {
    expect(applyHealing({ current: 85, max: 92, temp: 5 }, 20)).toEqual({ current: 92, temp: 5 });
    expect(applyHealing({ current: 0, max: 92, temp: null }, 7)).toEqual({ current: 7, temp: 0 });
  });

  it('finds the ticked death saves, which healing from 0 clears', () => {
    expect(tickedDeathSaves(paladin)).toEqual([]);
    const dying = withValues(paladin, { 'HP Current': '0', 'Death Save Success2': 'Yes', 'Death Save Fail1': 'Yes' });
    expect(tickedDeathSaves(dying)).toEqual(['Death Save Success2', 'Death Save Fail1']);
  });
});

describe('rests', () => {
  const tired = withValues(paladin, {
    'HP Current': '40',
    'HP Temp': '5',
    'HD1 Used': '3',
    'Limited Feature Used 1': '25', // Lay on Hands, long rest
    'Limited Feature Used 2': '2', // Channel Divinity (regain 1/SR), long rest
    'Condition.Exhaustion': '2',
    'Death Save Fail1': 'Yes',
  });

  it('a long rest gives back hit points, hit dice and rest features, and one level of exhaustion', () => {
    expect(longRest(tired)).toEqual({
      values: {
        'HP Current': '',
        'HP Temp': '',
        'HD1 Used': '',
        'HD2 Used': '',
        'Limited Feature Used 1': '',
        'Limited Feature Used 2': '',
        'Condition.Exhaustion': '1',
      },
      untick: ['Death Save Fail1'],
    });
  });

  it('a short rest gives back what MPMB marks "regain 1/SR"', () => {
    expect(shortRest(tired)).toEqual({ values: { 'Limited Feature Used 2': '1' }, untick: [] });
  });

  it('a long rest leaves charges that come back at dawn to the player', () => {
    const used = withValues(wizard, { 'Limited Feature Used 1': '1', 'Limited Feature Used 2': '10' });
    expect(longRest(used).values).toMatchObject({ 'Limited Feature Used 1': '' });
    expect(longRest(used).values).not.toHaveProperty('Limited Feature Used 2');
  });

  it('a rest gives back the free casts of spells (MPMB clicks the box back)', () => {
    // Divine Smite (row 8) and Guiding Bolt (row 55) cast once each, both back after a long rest.
    const cast = withValues(paladin, {
      'P6.SSfront.spells.check.8': 'oncelr+markedbox_used',
      'P6.SSfront.spells.check.55': 'oncelr+markedbox_used',
    });
    expect(longRest(cast).untick).toEqual(['P6.SSfront.spells.checkbox.8', 'P6.SSfront.spells.checkbox.55']);
    expect(shortRest(cast).untick).toEqual([]);
    const shortCast = withValues(paladin, { 'P6.SSfront.spells.check.8': 'oncesr_used' });
    expect(shortRest(shortCast).untick).toEqual(['P6.SSfront.spells.checkbox.8']);
  });
});

describe('marks the player sets', () => {
  it('leaves "used" empty rather than 0, as MPMB does', () => {
    expect(usedText(0)).toBe('');
    expect(usedText(3)).toBe('3');
  });

  it('clicks only the slot boxes that differ, so the used ones end up first', () => {
    const boxes = readSpellSlotUse(wizard)[0]?.boxes ?? [];
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    const [first = '', second = '', third = ''] = boxes;
    expect(slotClicks(wizard, boxes, 2)).toEqual([first, second]);
    // Ticked out of order (the third box): untick it, tick the first.
    const outOfOrder = withValues(wizard, { [third]: 'Yes' });
    expect(slotClicks(outOfOrder, boxes, 1)).toEqual([first, third]);
    expect(slotClicks(withValues(wizard, { [first]: 'Yes', [second]: 'Yes' }), boxes, 2)).toEqual([]);
  });
});

describe('dawn', () => {
  // Two magic items on the wizard's sheet: one comes back in full, one rolls for its charges.
  const items = withValues(wizard, {
    'Limited Feature 3': 'Cloak of the Bat (Polymorph)',
    'Limited Feature Max Usages 3': '1',
    'Limited Feature Recovery 3': 'dawn',
    'Limited Feature Used 3': '1',
    'Limited Feature 4': 'Wand of Magic Missiles (regains 1d6 + 1)',
    'Limited Feature Max Usages 4': '7',
    'Limited Feature Recovery 4': 'Dawn',
    'Limited Feature Used 4': '5',
  });

  it('finds the features that come back at dawn and the dice in their names', () => {
    const found = dawnFeatures(items);
    expect(found.find((f) => f.row === 3)).toEqual({
      row: 3,
      name: 'Cloak of the Bat (Polymorph)',
      max: 1,
      used: 1,
      dice: null,
    });
    expect(found.find((f) => f.row === 4)?.dice).toEqual({ count: 1, sides: 6, bonus: 1 });
    expect(found.map((f) => f.row)).not.toContain(1);
  });

  it('gives everything back, or the rolled amount, never more than was used', () => {
    expect(dawn(items, { 4: 3 }).values).toMatchObject({
      'Limited Feature Used 3': '',
      'Limited Feature Used 4': '2',
    });
    expect(dawn(items, { 4: 9 }).values).toMatchObject({ 'Limited Feature Used 4': '' });
    expect(dawn(items, {}).values).toMatchObject({ 'Limited Feature Used 4': '5' });
  });

  it('leaves features alone that are full or come back on a rest', () => {
    const edits = dawn(withValues(items, { 'Limited Feature Used 3': '' }), { 4: 1 });
    expect(edits.values).not.toHaveProperty('Limited Feature Used 3');
    expect(Object.keys(edits.values)).toEqual(['Limited Feature Used 4']);
    expect(edits.untick).toEqual([]);
  });

  it('rolls each die from 1 to its sides and adds the bonus', () => {
    const dice = { count: 2, sides: 4, bonus: 1 };
    expect(rollRegain(dice, () => 0)).toBe(3);
    expect(rollRegain(dice, () => 0.999)).toBe(9);
  });
});
