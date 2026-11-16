import { afterEach, describe, expect, it } from 'vitest';
import { formulaText, parseFormula } from '../dice/dice.ts';
import type { Formula } from '../dice/dice.ts';
import { damageText, dice, formulaAt } from './dice.svelte.ts';
import type { DamageAsk } from './dice.svelte.ts';

const read = (text: string): Formula => parseFormula(text) ?? { groups: [], bonus: 0 };
/** Fireball on the evoker's sheet: "8d6+3+1d6/SL Fire dmg", a level 3 spell. */
const FIREBALL: DamageAsk = {
  name: 'Fireball',
  formula: read('8d6+3'),
  type: 'Fire',
  upcast: { level: 3, per: read('1d6') },
};
const SLOT_5 = 5;
/** 8d6 and two levels of 1d6 more. */
const TEN_D6 = 10;

afterEach(() => dice.close());

describe('damage with a higher slot', () => {
  it('adds the per-level dice above the spell level, and nothing without a slot', () => {
    expect(formulaText(formulaAt(FIREBALL, SLOT_5))).toBe('10d6+3');
    expect(formulaText(formulaAt(FIREBALL, null))).toBe('8d6+3');
    expect(damageText(FIREBALL, true, SLOT_5)).toBe('20d6+3');
  });

  it('starts at the spell level when rolled from the sheet, and the card steps it for the next roll', () => {
    const from = {} as HTMLElement;
    dice.damage(FIREBALL, { from });
    expect(dice.slot).toBe(FIREBALL.upcast?.level);
    dice.setSlot(SLOT_5);
    dice.damage(FIREBALL);
    const shown = dice.shown;
    expect(shown?.kind === 'damage' && shown.slot).toBe(SLOT_5);
    expect(shown?.kind === 'damage' && shown.roll.rolls[0]?.dice.length).toBe(TEN_D6);
    // A new tap on the sheet starts over at the spell's own level.
    dice.damage(FIREBALL, { from });
    expect(dice.slot).toBe(FIREBALL.upcast?.level);
  });
});
