/**
 * The Build screen's steps, in order (Remph picked this layout, 2026-10-31). "Skills & languages" came
 * with M6.5, after the scores: class, species and background all give skills and languages. "Armour &
 * weapons" came with it too (Remph picked a Build step over editing them in the Combat tab, 2026-11-02).
 * "Spells" came with M7 (Remph, 2026-11-03), after Choices: feats and features chosen there add spell sources.
 */
export const BUILD_STEPS = [
  'class',
  'species',
  'background',
  'abilities',
  'skills',
  'feats',
  'gear',
  'choices',
  'spells',
  'modifiers',
] as const;
export type BuildStep = (typeof BUILD_STEPS)[number];
