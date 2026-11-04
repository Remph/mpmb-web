// Advantage and disadvantage marks: the PDF's own check box pairs ("Ste Adv"/"Ste Dis", "Str ST Adv",
// "Init Adv", "Att Adv") hold them, so a mark stays in the sheet and in a printed or filled PDF.
import type { Advantage } from './read.ts';
import type { Step } from '../session.svelte.ts';

/** What a roll is marked with: nothing, advantage or disadvantage. */
export type Edge = '' | 'adv' | 'dis';

/** Both boxes ticked cancel out, as in the rules. */
export const edgeOf = (a: Advantage): Edge => (a.advantage === a.disadvantage ? '' : a.advantage ? 'adv' : 'dis');

/**
 * The clicks that leave the roll marked `to`. Ticking one box makes MPMB untick the other (SetDisAdv);
 * Normal unticks what is ticked. `boxes` is the prefix of MPMB's pair: "Ste", "Str ST", "Init", "Att".
 */
export function markSteps(state: Advantage, boxes: string, to: Edge): Step[] {
  const steps: Step[] = [];
  if (to === 'adv' && !state.advantage) steps.push({ click: `${boxes} Adv` });
  if (to === 'dis' && !state.disadvantage) steps.push({ click: `${boxes} Dis` });
  if (to === '' && state.advantage) steps.push({ click: `${boxes} Adv` });
  if (to === '' && state.disadvantage) steps.push({ click: `${boxes} Dis` });
  return steps;
}

/**
 * Whether an attack's "To Hit" is an attack roll. MPMB writes "DC 14" for attacks the target saves
 * against (a breath weapon, Sacred Flame); no attack roll, so the "Att Adv"/"Att Dis" mark doesn't apply.
 */
export const isAttackRoll = (toHit: string): boolean => toHit !== '' && !/^DC\b/i.test(toHit.trim());

/** The small arrows that show a mark next to a roll. */
export const ARROW = { adv: '▲', dis: '▼' } as const;
