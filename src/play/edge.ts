// Advantage and disadvantage marks: the PDF's own check box pairs ("Ste Adv"/"Ste Dis", "Str ST Adv",
// "Init Adv", "Att Adv") hold them, so a mark stays in the sheet and in a printed or filled PDF.
import type { Texts } from '../i18n.ts';
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

/**
 * The group's house rule (playtest 2026-11-14, note 8): "double" advantage or disadvantage, three d20 and
 * the highest or lowest counts. The PDF has only the plain pair of boxes, so the app keeps which pairs are
 * doubled, and of which kind, with the character: { "Ste": "adv" }. A double mark counts only while the
 * PDF's boxes still show that kind, so a mark changed elsewhere (in Acrobat) never shows doubled by mistake.
 */
export type DoubleMarks = Readonly<Record<string, 'adv' | 'dis'>>;

/** The key of the "attacks against you" mark, which has no boxes of its own. */
export const AGAINST = 'AC';

export const isDouble = (marks: DoubleMarks, boxes: string, edge: Edge): boolean =>
  edge !== '' && marks[boxes] === edge;

/** The marks with `boxes` doubled as `edge`, or no longer doubled. */
export function withDouble(marks: DoubleMarks, boxes: string, edge: Edge, double: boolean): DoubleMarks {
  const { [boxes]: _old, ...rest } = marks;
  return double && edge !== '' ? { ...rest, [boxes]: edge } : rest;
}

/** ▲, or ▲▲ for a double mark. */
export const arrowOf = (edge: 'adv' | 'dis', double: boolean): string =>
  double ? ARROW[edge] + ARROW[edge] : ARROW[edge];

/** "advantage", "double disadvantage": the mark in words, for screen readers and legends. */
export function edgeWord(
  t: Pick<Texts, 'advantage' | 'disadvantage' | 'doubleAdvantage' | 'doubleDisadvantage'>,
  edge: 'adv' | 'dis',
  double: boolean,
): string {
  if (edge === 'adv') return double ? t.doubleAdvantage : t.advantage;
  return double ? t.doubleDisadvantage : t.disadvantage;
}
