import { describe, expect, it } from 'vitest';
import { formulaText } from '../dice/dice.ts';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { viewsOf } from '../worker/views.ts';
import { readSpells } from './spells.ts';
import { spellRolls } from './spell-rolls.ts';

/** Attack, damage at the spell's level, per level above, type: what a line on MPMB's spell sheet rolls. */
const read = (summary: string): [boolean, string, string, string] => {
  const rolls = spellRolls(summary);
  const d = rolls.damage;
  return [rolls.attack, d ? formulaText(d.formula) : '', d?.perLevel ? formulaText(d.perLevel) : '', d?.type ?? ''];
};

// Lines as the reference characters' sheets show them (MPMB's ListsSpells.js, with the Evoker's +3 added).
const CASES: readonly [string, [boolean, string, string, string]][] = [
  [
    'Rngd spell atk for 2d8+3 Cold dmg, & -3 m spd until start of my next turn; miss half only',
    [true, '2d8+3', '', 'Cold'],
  ],
  [
    'Spell attack for 4d6+1d6/SL Radiant dmg and next attack vs target before my next EoT has advantage',
    [true, '4d6', '1d6', 'Radiant'],
  ],
  [
    '6-m rad all crea 8d6+3+1d6/SL Fire dmg,; save half; unattended flammable obj ignite',
    [false, '8d6+3', '1d6', 'Fire'],
  ],
  ['Spell atk 3d8+1d8/SL elem. dmg (1× +3); if 2 roll same: atk other in 9 m', [true, '3d8', '1d8', 'elem.']],
  [
    'Cast on melee weapon hit; +2d8+1d8/SL Radiant damage; Fiends and Undead take +1d8 damage',
    [false, '2d8', '1d8', 'Radiant'],
  ],
  ['6m rad, 12m high all 2d10 Bludg. dmg & 4d6 Cold dmg; save half', [false, '2d10', '', 'Bludg.']],
  ['Spell atk per beam for 1d10 Force damage; pick target per beam', [true, '1d10', '', 'Force']],
  // The type is only the type: no ability in brackets, no "of other" (Fire Shield). Review of #114.
  ['Spell atk for 1d6+3 (Wis) Fire dmg', [true, '1d6+3', '', 'Fire']],
  ['Resist Fire or Cold; 2d8 of other dmg type to melee atkers if hit in 1.5m', [false, '2d8', '', '']],
  ['Club I hold does 1d8 Force/wea dmg & uses Wis', [false, '1d8', '', 'Force/wea']],
  // Less damage, healing and counts of creatures are not damage to roll.
  ['1 crea save or Dis on Str d20 tests, deal -1d8 dmg, repeat save EoT', [false, '', '', '']],
  ['1 creature heals 2d8+2d8/SL+4 (Cha) HP', [false, '', '', '']],
  ['3+1/SL creatures can add 1d4 on every attack roll and saving throw for the duration (5gp)', [false, '', '', '']],
  // "+spell mod" is no number the line gives: no roll rather than a wrong one.
  ['≤Huge crea save or Grappled; Bns to crush grappled for 4d6+2d6/SL+spell mod Bludgeoning dmg', [false, '', '', '']],
];

describe('spell rolls', () => {
  it.each(CASES)('reads "%s"', (summary, expected) => {
    expect(read(summary)).toEqual(expected);
  });

  it('finds the rolls on the reference wizard', () => {
    const wizard = viewsOf(openSheet(referenceSheet('wizard10-evoker')).doc);
    const spells = readSpells(wizard).flatMap((s) => s.levels.flatMap((l) => l.spells));
    const rolled = spells
      .filter((s) => s.name === 'Fireball' || s.name === 'Ray of Frost' || s.name === 'Shield')
      .map((s) => [s.name, ...read(s.summary)]);
    expect(rolled).toEqual([
      ['Shield', false, '', '', ''],
      ['Ray of Frost', true, '2d8+3', '', 'Cold'],
      ['Fireball', false, '8d6+3', '1d6', 'Fire'],
    ]);
  });
});
