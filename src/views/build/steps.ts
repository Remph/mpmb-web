/**
 * The Build screen's steps, in order (Nick picked this layout, 2026-10-31). "Skills & languages" came
 * with M6.5, after the scores: class, species and background all give skills and languages.
 */
export const BUILD_STEPS = [
  'class',
  'species',
  'background',
  'abilities',
  'skills',
  'feats',
  'choices',
  'modifiers',
] as const;
export type BuildStep = (typeof BUILD_STEPS)[number];
