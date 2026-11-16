// The roll the card shows (M14, Nick picked mock B on 2026-11-15): a tap on a to-hit, a save, a skill or
// initiative rolls at once with the mark on the sheet, and the card at the bottom of the play view shows it.
// One roll at a time: the next tap replaces it. The rolls never leave this browser (sharing waits for sync).
import { critical, formulaText, natural, plus, rollD20, rollFormula } from '../dice/dice.ts';
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
  /**
   * A spell that deals more with a higher slot (MPMB's "8d6+3+1d6/SL"): its own level and what each level above
   * adds. The card then has a slot level to step up (M17).
   */
  upcast?: { level: number; per: Formula };
}

/** The highest spell slot level. */
export const TOP_SLOT = 9;

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
  | { kind: 'damage'; ask: DamageAsk; crit: boolean; slot: number | null; roll: FormulaRoll };

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
  /**
   * The slot level the card's damage is for, when the damage grows with it; null otherwise. A roll from the sheet
   * starts at the spell's own level; the card's stepper changes it for the next damage roll.
   */
  slot: number | null = $state(null);

  /** Rolls a d20 for `ask`, in the sheet's mode unless the card's "again with advantage" asks for another. */
  d20(ask: D20Ask, { mode = ask.mode, from }: { mode?: RollMode; from?: HTMLElement } = {}) {
    if (from) this.slot = ask.damage?.upcast?.level ?? null;
    const roll = rollD20(mode);
    this.show({ kind: 'd20', ask, roll, total: roll.result + ask.bonus }, from);
  }

  /** Rolls an attack's damage; a critical hit throws every die twice. */
  damage(ask: DamageAsk, { crit = false, from }: { crit?: boolean; from?: HTMLElement } = {}) {
    if (from) this.slot = ask.upcast?.level ?? null;
    const formula = formulaAt(ask, this.slot);
    const roll = rollFormula(crit ? critical(formula) : formula);
    this.show({ kind: 'damage', ask, crit, slot: ask.upcast ? this.slot : null, roll }, from);
  }

  /** The card's slot level stepper: from the spell's own level up to 9. */
  setSlot(slot: number) {
    this.slot = slot;
  }

  close() {
    this.shown = null;
    this.from = null;
    this.slot = null;
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

/** The damage at a slot level: the spell's own level (or no slot at all) adds nothing. */
export const formulaAt = (ask: DamageAsk, slot: number | null): Formula =>
  ask.upcast && slot !== null ? plus(ask.formula, ask.upcast.per, slot - ask.upcast.level) : ask.formula;

/** "2d10+4" for the card's damage button: doubled after a natural 20, grown with a higher slot. */
export const damageText = (ask: DamageAsk, crit: boolean, slot: number | null = null): string =>
  formulaText(crit ? critical(formulaAt(ask, slot)) : formulaAt(ask, slot));

/** The card's head: "+2 Halberd attack roll", "+2 Halberd damage", "+2 Halberd critical damage". */
export function titleOf(shown: Shown, t: Texts): string {
  if (shown.kind === 'd20') return shown.ask.title;
  return fill(shown.crit ? t.diceCritTitle : t.diceDamageTitle, { name: shown.ask.name });
}

export const totalOf = (shown: Shown): number => (shown.kind === 'd20' ? shown.total : shown.roll.total);

/** What a screen reader hears after a roll: "Stealth: 7". */
export const spokenOf = (shown: Shown | null, t: Texts): string =>
  shown ? fill(t.diceSpoken, { title: titleOf(shown, t), total: totalOf(shown) }) : '';
