/**
 * The Build screen's steps, in order (Nick picked this layout, 2026-10-31). "Skills & languages" came
 * with M6.5, after the scores: class, species and background all give skills and languages. "Armour &
 * weapons" came with it too (Nick picked a Build step over editing them in the Combat tab, 2026-11-02).
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
  'modifiers',
] as const;
export type BuildStep = (typeof BUILD_STEPS)[number];
