// MPMB's feature texts send the player to the PDF's "Choose Feature" button, which in the app is the
// Build screen's Choices step. This finds those texts and the choice a feature's name stands for.
import type { Choice } from '../engine/choices.ts';

/** The PDF's button, as MPMB names it in a feature's usage note: 'Select option with "Choose Feature"'. */
const CHOOSE_FEATURE = '"Choose Feature"';

export const pointsToChooseFeature = (text: string): boolean => text.includes(CHOOSE_FEATURE);

/**
 * MPMB's sentences about the PDF's button: 'Use the "Choose Feature" button above to select them', '… using the
 * "Choose Feature" button above.' Matches the phrase from "the" to "above"; rejects 'Select option with "Choose
 * Feature"' (the usage note, which becomes the pill).
 * Try it: https://regex101.com/?regex=(%3F%3Athe+)%3F%22Choose+Feature%22+button(%3F%3A+above)%3F&flags=gi&testString=Use+the+%22Choose+Feature%22+button+above+to+select+them.%0ASelect+option+with+%22Choose+Feature%22
 */
const CHOOSE_BUTTON = /(?:the )?"Choose Feature" button(?: above)?/gi;

/**
 * A text split at MPMB's mentions of the PDF's button, which the app doesn't have: the odd parts are the
 * mentions, which the play view shows as the link to the Build screen instead (UI review 2, finding 07).
 */
export const splitAtChooseButton = (text: string): string[] => text.split(new RegExp(`(${CHOOSE_BUTTON.source})`, 'i'));

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

/** The address of the Build screen's "Armour & weapons" step (the Combat tab's "Change weapons"). */
export const gearHref = (characterId: string): string => `#/character/${encodeURIComponent(characterId)}/build/gear`;

/** The address of the Build screen's "Spells" step (the Spells tab's "Choose spells"). */
export const spellsHref = (characterId: string): string =>
  `#/character/${encodeURIComponent(characterId)}/build/spells`;
