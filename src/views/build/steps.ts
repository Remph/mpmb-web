/** The Build screen's seven steps, in order (Nick picked this layout, 2026-10-31). */
export const BUILD_STEPS = ['class', 'species', 'background', 'abilities', 'feats', 'choices', 'modifiers'] as const;
export type BuildStep = (typeof BUILD_STEPS)[number];
