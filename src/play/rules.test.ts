/* eslint-disable ts-patterns/no-magic-numbers -- hit points and counts are the test data */
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { withValues } from '../../test/fields.ts';
import { viewsOf } from '../worker/views.ts';
import { readHitPoints, readSpellSlotUse } from './read.ts';
import {
  applyDamage,
  applyHealing,
  dawn,
  dawnFeatures,
  followMaxHp,
  longRest,
  pactSlots,
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
    expect(applyDamage({ current: 71, max: 92, temp: 5 }, 3)).toEqual({ current: 71, temp: 2, lowered: null });
    expect(applyDamage({ current: 71, max: 92, temp: 5 }, 12)).toEqual({ current: 64, temp: 0, lowered: null });
  });

  it('stops at 0 and counts an empty field as full', () => {
    expect(applyDamage({ current: 4, max: 92, temp: null }, 10)).toEqual({ current: 0, temp: 0, lowered: null });
    expect(applyDamage({ current: null, max: 92, temp: null }, 10)).toEqual({ current: 82, temp: 0, lowered: null });
  });

  it('heals up to the maximum and keeps temporary hit points', () => {
    expect(applyHealing({ current: 85, max: 92, temp: 5 }, 20)).toEqual({ current: 92, temp: 5, lowered: null });
    expect(applyHealing({ current: 0, max: 92, temp: null }, 7)).toEqual({ current: 7, temp: 0, lowered: null });
  });

  it('lowers the maximum by the damage when asked, taking hit points above it along', () => {
    // 71 of 92, 16 necrotic from Life Drain: 55 left, maximum 76.
    expect(applyDamage({ current: 71, max: 92, temp: null }, 16, true)).toEqual({ current: 55, temp: 0, lowered: 76 });
    // Temporary hit points take the hit, but the maximum still drops, and 90 is more than the new 76.
    expect(applyDamage({ current: 90, max: 92, temp: 20 }, 16, true)).toEqual({ current: 76, temp: 4, lowered: 76 });
    // Lowered again: from the lowered maximum, never below 0.
    expect(applyDamage({ current: 30, max: 92, lowered: 40, temp: null }, 50, true)).toEqual({
      current: 0,
      temp: 0,
      lowered: 0,
    });
    // Plain damage leaves a lowered maximum as it is.
    expect(applyDamage({ current: 30, max: 92, lowered: 40, temp: null }, 5)).toEqual({
      current: 25,
      temp: 0,
      lowered: 40,
    });
  });

  it('heals only up to a lowered maximum, and counts an empty field as full at it', () => {
    expect(applyHealing({ current: 30, max: 92, lowered: 40, temp: null }, 20)).toEqual({
      current: 40,
      temp: 0,
      lowered: 40,
    });
    expect(applyDamage({ current: null, max: 92, lowered: 40, temp: null }, 10).current).toBe(30);
  });

  it('reads a lowered maximum only when it is below the maximum', () => {
    const max = readHitPoints(paladin).max!;
    expect(readHitPoints(paladin).lowered).toBeNull();
    expect(readHitPoints(withValues(paladin, { 'HP Max Current': String(max - 10) })).lowered).toBe(max - 10);
    expect(readHitPoints(withValues(paladin, { 'HP Max Current': String(max) })).lowered).toBeNull();
  });

  it('finds the ticked death saves, which healing from 0 clears', () => {
    expect(tickedDeathSaves(paladin)).toEqual([]);
    const dying = withValues(paladin, { 'HP Current': '0', 'Death Save Success2': 'Yes', 'Death Save Fail1': 'Yes' });
    expect(tickedDeathSaves(dying)).toEqual(['Death Save Success2', 'Death Save Fail1']);
  });
});

describe('a new maximum', () => {
  const max = readHitPoints(paladin).max!;

  it('takes along a box that only repeats the maximum, so a level up shows no lowered maximum', () => {
    // Players often copy the maximum into the "current maximum" box in Acrobat (both group sheets did).
    const before = withValues(paladin, { 'HP Max Current': String(max) });
    const after = withValues(before, { 'HP Max': String(max + 9) });
    expect(followMaxHp(before, after)).toEqual({ 'HP Max Current': String(max + 9) });
    expect(readHitPoints(withValues(after, followMaxHp(before, after))).lowered).toBeNull();
  });

  it('keeps what an attack took off a lowered maximum', () => {
    const before = withValues(paladin, { 'HP Max Current': String(max - 16) });
    expect(followMaxHp(before, withValues(before, { 'HP Max': String(max + 9) }))).toEqual({
      'HP Max Current': String(max - 7),
    });
    // A level less (the Build screen's minus): down by as much, never below 0.
    expect(followMaxHp(before, withValues(before, { 'HP Max': String(max - 200) }))).toEqual({
      'HP Max Current': '0',
    });
  });

  it('changes nothing when the box is empty or the maximum stays', () => {
    expect(followMaxHp(paladin, withValues(paladin, { 'HP Max': String(max + 9) }))).toEqual({});
    const boxed = withValues(paladin, { 'HP Max Current': String(max - 16) });
    expect(followMaxHp(boxed, withValues(boxed, { 'HP Current': '3' }))).toEqual({});
    // A maximum the player cleared (MPMB set to "don't change") is no new maximum to follow.
    expect(followMaxHp(boxed, withValues(boxed, { 'HP Max': '' }))).toEqual({});
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

  it('a long rest makes a lowered maximum whole again, and leaves a box that only repeats it', () => {
    const max = readHitPoints(paladin).max!;
    expect(longRest(withValues(paladin, { 'HP Max Current': String(max - 16) })).values).toMatchObject({
      'HP Max Current': '',
    });
    expect(longRest(withValues(paladin, { 'HP Max Current': String(max) })).values).not.toHaveProperty(
      'HP Max Current',
    );
  });

  it('a short rest gives back what MPMB marks "regain 1/SR"', () => {
    expect(shortRest(tired)).toEqual({ values: { 'Limited Feature Used 2': '1' }, untick: [] });
  });

  it('a long rest leaves charges that come back at dawn to the player', () => {
    const used = withValues(wizard, { 'Limited Feature Used 1': '1', 'Limited Feature Used 2': '10' });
    expect(longRest(used).values).toMatchObject({ 'Limited Feature Used 1': '' });
    expect(longRest(used).values).not.toHaveProperty('Limited Feature Used 2');
  });

  it('reads the Pact Magic slots from the warlock level', () => {
    expect(pactSlots(paladin)).toEqual({ count: 2, level: 1 }); // Warlock 2
    expect(pactSlots(wizard)).toBeNull();
    expect(pactSlots(withValues(wizard, { 'Class and Levels': 'Warlock (Undead Patron) 8' }))).toEqual({
      count: 2,
      level: 4,
    });
    // One class without its level, as MPMB allows: the character level counts.
    const noLevel = withValues(wizard, { 'Class and Levels': 'Warlock (Undead Patron)', 'Character Level': '8' });
    expect(pactSlots(noLevel)).toEqual({ count: 2, level: 4 });
  });

  it('a short rest gives back the Pact Magic slots, and only those', () => {
    // Paladin 8 / warlock 2: the first-level boxes hold the paladin's 4 and the warlock's 2.
    const [first, second] = readSpellSlotUse(paladin);
    expect(first?.total).toBe(6);
    const allUsed = withValues(paladin, {
      ...Object.fromEntries((first?.boxes ?? []).slice(0, 6).map((box) => [box, 'Yes'])),
      ...Object.fromEntries((second?.boxes ?? []).slice(0, 1).map((box) => [box, 'Yes'])),
    });
    // Two of the six come back (the last two ticked); the second-level slot stays used.
    expect(shortRest(allUsed).untick).toEqual((first?.boxes ?? []).slice(4, 6));
    // One used: it comes back.
    const oneUsed = withValues(paladin, { [first?.boxes[0] ?? '']: 'Yes' });
    expect(shortRest(oneUsed).untick).toEqual([first?.boxes[0]]);
    expect(shortRest(paladin).untick).toEqual([]);
  });

  it('a short rest heals half the maximum with the house rule, never above it', () => {
    const max = readHitPoints(paladin).max!;
    const hurt = withValues(paladin, { 'HP Current': '10' });
    expect(shortRest(hurt).values).not.toHaveProperty('HP Current');
    expect(shortRest(hurt, true).values).toMatchObject({ 'HP Current': String(10 + Math.floor(max / 2)) });
    expect(shortRest(withValues(paladin, { 'HP Current': String(max - 3) }), true).values).toMatchObject({
      'HP Current': '',
    });
    expect(shortRest(paladin, true).values).not.toHaveProperty('HP Current');
    const dying = withValues(paladin, { 'HP Current': '0', 'Death Save Fail1': 'Yes' });
    expect(shortRest(dying, true).untick).toContain('Death Save Fail1');
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
