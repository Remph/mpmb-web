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

/** A healing potion drunk from the inventory (M17): already applied to the hit points when the card shows it. */
export interface HealShown {
  kind: 'heal';
  /** "Potion of Healing". */
  name: string;
  /** An action heals the full value (the group's house rule), a bonus action rolls. */
  how: 'action' | 'bonus';
  formula: Formula;
  /** The dice of a bonus action, null for an action. */
  roll: FormulaRoll | null;
  total: number;
  /** Hit points after drinking, and the maximum. */
  hp: number;
  max: number;
  /** Potions of this kind left on the row, null when the row doesn't count them. */
  left: number | null;
  /** Puts the hit points and the count back, as before the drink. */
  undo: () => void;
}

export type Shown =
  | HealShown
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

  /** Shows a drunk potion; the inventory has already written its healing. */
  heal(shown: Omit<HealShown, 'kind'>, { from }: { from?: HTMLElement } = {}) {
    this.show({ kind: 'heal', ...shown }, from);
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
  if (shown.kind === 'heal')
    return fill(shown.how === 'action' ? t.diceDrankAction : t.diceDrankBonus, { name: shown.name });
  return fill(shown.crit ? t.diceCritTitle : t.diceDamageTitle, { name: shown.ask.name });
}

export function totalOf(shown: Shown): number {
  if (shown.kind === 'damage') return shown.roll.total;
  return shown.total;
}

/** What a screen reader hears after a roll: "Stealth: 7". */
export const spokenOf = (shown: Shown | null, t: Texts): string =>
  shown ? fill(t.diceSpoken, { title: titleOf(shown, t), total: totalOf(shown) }) : '';
