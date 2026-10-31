// MPMB's feature texts send the player to the PDF's "Choose Feature" button, which in the app is the
// Build screen's Choices step. This finds those texts and the choice a feature's name stands for.
import type { Choice } from '../engine/choices.ts';

/** The PDF's button, as MPMB names it in a feature's usage note: 'Select option with "Choose Feature"'. */
const CHOOSE_FEATURE = '"Choose Feature"';

export const pointsToChooseFeature = (text: string): boolean => text.includes(CHOOSE_FEATURE);

/** The feature mark MPMB puts before a feature's name ("◆ Fighting Style"). */
const FEATURE_MARK = '◆';

const plain = (name: string): string => name.replace(FEATURE_MARK, '').trim().toLowerCase();

/**
 * The class choice behind a feature, by name. MPMB's menu and the feature text may differ in the
 * plural ("Eldritch Invocation" in the menu, "Eldritch Invocations" as a feature), so either may
 * start with the other. Null when none fits: the Choices step then shows the first open choice.
 */
export function choiceNamed(choices: Choice[], name: string): Choice | null {
  const wanted = plain(name);
  if (!wanted) return null;
  const fits = (choice: Choice): boolean => {
    const own = plain(choice.name);
    return own === wanted || own.startsWith(wanted) || wanted.startsWith(own);
  };
  return choices.filter((c) => c.kind === 'class' && fits(c))[0] ?? null;
}

/** The address of the Build screen's Choices step at a feature's choice (App.svelte reads it). */
export const choicesHref = (characterId: string, feature: string): string =>
  `#/character/${encodeURIComponent(characterId)}/build/choices/${encodeURIComponent(feature.replace(FEATURE_MARK, '').trim())}`;
