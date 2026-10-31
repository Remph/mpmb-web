// Small helpers the species and background steps share.
import type { SpeciesFacts } from '../../engine/origins.ts';
import { fill } from '../../i18n.ts';
import type { Texts } from '../../i18n.ts';

const SIZE_KEYS = ['buildSize0', 'buildSize1', 'buildSize2', 'buildSize3', 'buildSize4', 'buildSize5'] as const;

/** MPMB's size numbers in words: [3, 4] is "Medium or Small". */
export function sizeText(sizes: number[], t: Texts): string {
  const words = sizes.map((n) => {
    const key = SIZE_KEYS[n];
    return key ? t[key] : '';
  });
  const known = words.filter(Boolean);
  const last = known.pop() ?? '';
  return known.length ? fill(t.buildOr, { a: known.join(', '), b: last }) : last;
}

/** "Medium · speed 9 m · Darkvision 18 m" (the senses in MPMB's English). */
export const factsLine = (facts: SpeciesFacts, t: Texts): string =>
  [sizeText(facts.size, t), facts.speed && fill(t.buildSpeed, { speed: facts.speed }), ...facts.vision]
    .filter(Boolean)
    .join(' · ');
