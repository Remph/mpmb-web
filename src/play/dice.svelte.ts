// The roll the card shows (M14, Nick picked mock B on 2026-11-15): a tap on a to-hit, a save, a skill or
// initiative rolls at once with the mark on the sheet, and the card at the bottom of the play view shows it.
// One roll at a time: the next tap replaces it. The rolls never leave this browser (sharing waits for sync).
import { critical, formulaText, natural, rollD20, rollFormula } from '../dice/dice.ts';
import type { D20Roll, Formula, FormulaRoll, RollMode } from '../dice/dice.ts';
import { fill } from '../i18n.ts';
import type { Texts } from '../i18n.ts';

/** An attack's damage, for the card's main button after its attack roll. */
export interface DamageAsk {
  /** "+2 Halberd". */
  name: string;
  formula: Formula;
  /** "Slashing", or "". */
  type: string;
}

export interface D20Ask {
  /** What the card's head says: "+2 Halberd attack roll", "Stealth", "Wisdom saving throw". */
  title: string;
  bonus: number;
  /** The mode the sheet's mark asks for. */
  mode: RollMode;
  /** Opens the advantage pop-up of the roll the card shows (the tap used to do that). */
  mark?: () => void;
  /** An attack's damage: the card offers it next. */
  damage?: DamageAsk;
}

export type Shown =
  | { kind: 'd20'; ask: D20Ask; roll: D20Roll; total: number }
  | { kind: 'damage'; ask: DamageAsk; crit: boolean; roll: FormulaRoll };

class Dice {
  /** What the card shows, or null when it is closed. */
  shown: Shown | null = $state(null);
  /** Counts the rolls, so the card can tell a new roll from the same one (and announce it again). */
  count = $state(0);
  /**
   * The number on the sheet the roll came from: the card outlines it (mock B) and hands the focus back to it when
   * it closes. A roll from the card's own buttons (damage, again) keeps it. Raw: a DOM element, never a proxy.
   */
  from: HTMLElement | null = $state.raw(null);

  /** Rolls a d20 for `ask`, in the sheet's mode unless the card's "again with advantage" asks for another. */
  d20(ask: D20Ask, { mode = ask.mode, from }: { mode?: RollMode; from?: HTMLElement } = {}) {
    const roll = rollD20(mode);
    this.show({ kind: 'd20', ask, roll, total: roll.result + ask.bonus }, from);
  }

  /** Rolls an attack's damage; a critical hit throws every die twice. */
  damage(ask: DamageAsk, { crit = false, from }: { crit?: boolean; from?: HTMLElement } = {}) {
    const roll = rollFormula(crit ? critical(ask.formula) : ask.formula);
    this.show({ kind: 'damage', ask, crit, roll }, from);
  }

  close() {
    this.shown = null;
    this.from = null;
  }

  private show(shown: Shown, from: HTMLElement | undefined) {
    this.shown = shown;
    if (from) this.from = from;
    this.count += 1;
  }
}

export const dice = new Dice();

/** Whether the attack roll on the card is a critical hit: a natural 20 on the die that counts. */
export const isCritical = (shown: Shown): boolean => shown.kind === 'd20' && natural(shown.roll) === 'nat20';

/** "2d10+4" for the card's damage button: doubled after a natural 20. */
export const damageText = (ask: DamageAsk, crit: boolean): string =>
  formulaText(crit ? critical(ask.formula) : ask.formula);

/** The card's head: "+2 Halberd attack roll", "+2 Halberd damage", "+2 Halberd critical damage". */
export function titleOf(shown: Shown, t: Texts): string {
  if (shown.kind === 'd20') return shown.ask.title;
  return fill(shown.crit ? t.diceCritTitle : t.diceDamageTitle, { name: shown.ask.name });
}

export const totalOf = (shown: Shown): number => (shown.kind === 'd20' ? shown.total : shown.roll.total);

/** What a screen reader hears after a roll: "Stealth: 7". */
export const spokenOf = (shown: Shown | null, t: Texts): string =>
  shown ? fill(t.diceSpoken, { title: titleOf(shown, t), total: totalOf(shown) }) : '';
