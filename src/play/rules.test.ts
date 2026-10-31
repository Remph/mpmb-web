/* eslint-disable ts-patterns/no-magic-numbers -- hit points and counts are the test data */
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { viewsOf } from '../worker/views.ts';
import type { FieldViews } from '../worker/views.ts';
import { applyDamage, applyHealing, longRest, shortRest, tickedDeathSaves } from './rules.ts';

const paladin = viewsOf(openSheet(referenceSheet('paladin8-warlock2')).doc);
const wizard = viewsOf(openSheet(referenceSheet('wizard10-evoker')).doc);

function withValues(fields: FieldViews, values: Record<string, string>): FieldViews {
  const copy = { ...fields };
  Object.entries(values).forEach(([name, value]) => {
    const view = copy[name];
    if (!view) throw new Error(`no field ${name}`);
    copy[name] = { ...view, value, text: undefined };
  });
  return copy;
}

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
