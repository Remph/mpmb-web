// Experience points in the play view: MPMB keeps them in "Total Experience" and works out "Next level".
import type { Step } from '../session.svelte.ts';
import type { FieldViews } from '../worker/views.ts';
import { numberOf } from './read.ts';

/** The points so far and what the next level needs (empty at level 20, so null). */
export function readExperience(fields: FieldViews): { total: number; next: number | null } {
  return { total: numberOf(fields, 'Total Experience') ?? 0, next: numberOf(fields, 'Next level') };
}

/**
 * Adds points MPMB's way: its "Add Experience" box, then its button (AddExperiencePoints). When the new
 * total reaches another level, MPMB asks whether to go up a level, as in Acrobat. The button does nothing
 * while the box is empty, so both steps always go together.
 */
export const addExperienceSteps = (amount: number): Step[] => [
  { edit: 'Add Experience', text: String(Math.max(0, Math.round(amount))) },
  { click: 'Add Experience Button' },
];
