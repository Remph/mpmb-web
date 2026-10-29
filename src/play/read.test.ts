/* eslint-disable ts-patterns/no-magic-numbers -- hit points, counts and slots are the test data */
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { viewsOf } from '../worker/views.ts';
import type { FieldViews } from '../worker/views.ts';
import {
  readAbilities,
  readActions,
  readAttacks,
  readConditions,
  readHitPoints,
  readLimitedFeatures,
  readNumbers,
  readSkills,
  readSpellSlots,
  readTool,
} from './read.ts';

// The values below are what Acrobat shows on page 1 of the reference characters.
const paladin = viewsOf(openSheet(referenceSheet('paladin8-warlock2')).doc);
const wizard = viewsOf(openSheet(referenceSheet('wizard10-evoker')).doc);

/** A copy with some fields' values changed, as after the player's edits. */
function withValues(fields: FieldViews, values: Record<string, string>): FieldViews {
  const copy = { ...fields };
  Object.entries(values).forEach(([name, value]) => {
    const view = copy[name];
    if (!view) throw new Error(`no field ${name}`);
    copy[name] = { ...view, value, text: undefined };
  });
  return copy;
}

describe('play view values', () => {
  it('reads hit points and hit dice', () => {
    expect(readHitPoints(paladin)).toEqual({
      current: null,
      max: 92,
      temp: null,
      hitDice: [
        { row: 1, die: 'd10', total: 8, used: 0 },
        { row: 2, die: 'd8', total: 2, used: 0 },
      ],
      deathSaves: { successes: 0, failures: 0 },
    });
    const hurt = withValues(paladin, {
      'HP Current': '71',
      'HP Temp': '5',
      'HD1 Used': '1',
      'Death Save Fail1': 'Yes',
    });
    expect(readHitPoints(hurt)).toMatchObject({
      current: 71,
      temp: 5,
      hitDice: [{ used: 1 }, { used: 0 }],
      deathSaves: { successes: 0, failures: 1 },
    });
  });

  it('reads the numbers next to the hit points as the sheet shows them', () => {
    expect(readNumbers(paladin)).toEqual({
      armorClass: '18',
      initiative: '0',
      speed: '9 m',
      proficiency: '+4',
      spellSaveDcs: ['16'],
      passivePerception: '11',
    });
    expect(readNumbers(wizard)).toMatchObject({ armorClass: '12', initiative: '+2' });
  });

  it('reads abilities and saves, without the hidden Honor/Sanity score', () => {
    const abilities = readAbilities(paladin);
    expect(abilities.map((a) => a.key)).toEqual(['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha']);
    expect(abilities[5]).toEqual({
      key: 'Cha',
      score: '18',
      modifier: '+4',
      save: '+13',
      saveProficient: true,
      advantage: false,
      disadvantage: false,
    });
  });

  it('reads skills with proficiency and disadvantage', () => {
    const skills = readSkills(paladin);
    expect(skills).toHaveLength(18);
    expect(skills.filter((s) => s.proficient).map((s) => s.key)).toEqual(['Ins', 'Rel']);
    expect(skills.find((s) => s.key === 'Ste')).toMatchObject({ bonus: '0', disadvantage: true });
    expect(skills.find((s) => s.key === 'Rel')).toMatchObject({ bonus: '+9', ability: 'Int' });
    expect(readTool(paladin)).toEqual({ name: "Calligrapher's Supplies (DEX)", bonus: '+4' });
  });

  it('reads the filled attack rows', () => {
    expect(readAttacks(paladin)).toEqual([
      {
        row: 1,
        name: '+2 Halberd',
        toHit: '+8',
        damage: '1d10+4',
        damageType: 'Slashing',
        range: 'Melee',
        description: 'Heavy, Reach, Two-Handed',
      },
      { row: 2, name: 'Breath Weapon', toHit: '+0', damage: '', damageType: '', range: '', description: '' },
    ]);
  });

  it('reads actions, bonus actions and reactions', () => {
    expect(readActions(paladin)).toEqual({
      action: [
        'Attack / Magic / Utilize',
        'Dash / Disengage / Dodge / Hide',
        'Search / Study / Influence',
        'Ready / Help / Escape Grapple',
      ],
      bonusAction: ['Lay on Hands', 'Divine Sense (Channel Divinity)', 'Draconic Flight'],
      reaction: ['Opportunity Attack'],
    });
  });

  it('reads limited features as dots or as a pool', () => {
    const features = readLimitedFeatures(paladin);
    expect(features.map((f) => [f.name, f.max, f.pool, f.recovery])).toEqual([
      ['Lay on Hands', 40, true, 'long rest'],
      ['Channel Divinity (regain 1/SR)', 2, false, 'long rest'],
      ['Magical Cunning (1 spell slot)', 1, false, 'long rest'],
      ['Breath Weapon (2d10)', 4, false, 'long rest'],
      ['Draconic Flight', 1, false, 'long rest'],
    ]);
    // Staff of the Magi's 50 charges are too many for dots.
    expect(readLimitedFeatures(wizard)[1]).toMatchObject({ max: 50, pool: true, recovery: 'dawn' });
  });

  it('reads spell slots per level', () => {
    expect(readSpellSlots(paladin)).toEqual([
      { level: 1, total: 6 },
      { level: 2, total: 3 },
    ]);
    expect(readSpellSlots(wizard).map((s) => s.total)).toEqual([4, 3, 3, 3, 2]);
  });

  it('reads conditions and exhaustion', () => {
    expect(readConditions(paladin)).toEqual({ active: [], exhaustion: 0 });
    const poisoned = withValues(paladin, { 'Condition.Poisoned': 'Yes', 'Condition.Exhaustion': '2' });
    expect(readConditions(poisoned)).toEqual({ active: ['Poisoned'], exhaustion: 2 });
  });
});
