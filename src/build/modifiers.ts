// The Build screen's Modifiers step (M6): MPMB's "blue fields", where the player adds to what MPMB works
// out (a Ring of Protection to the armor class, Aura of Protection to all saves). The PDF hides them until
// the player shows them; the app writes them as if typed, and MPMB adds them up as usual.
import { FF } from '../engine/types.ts';
import type { FieldViews } from '../worker/views.ts';
import { ABILITIES, SKILLS, valueOf } from '../play/read.ts';
import type { AbilityKey, SkillKey } from '../play/read.ts';

export interface Modifier {
  /** The blue field. */
  field: string;
  /** The field MPMB adds it to, whose value the page shows next to it; empty where it adds to many. */
  result: string;
  /** The field that names it (the armor class extras: "Ring of Protection"); empty for none. */
  name: string;
}

const mod = (field: string, result: string, name = ''): Modifier => ({ field, result, name });

export const ARMOR_CLASS = [
  // Both add to the armor class, which the page shows once for the two.
  mod('AC Misc Mod 1', '', 'AC Misc Mod 1 Description'),
  mod('AC Misc Mod 2', '', 'AC Misc Mod 2 Description'),
];
export const INITIATIVE = mod('Init Bonus', 'Initiative bonus');
export const ALL_SAVES = mod('All ST Bonus', '');
export const SAVES: { key: AbilityKey; modifier: Modifier }[] = ABILITIES.map((key) => ({
  key,
  modifier: mod(`${key} ST Bonus`, `${key} ST Mod`),
}));
export const ALL_SKILLS = mod('All Skills Bonus', '');
export const SKILL_MODIFIERS: { key: SkillKey; modifier: Modifier }[] = SKILLS.map(([key]) => ({
  key,
  modifier: mod(`${key} Bonus`, key),
}));
export const PASSIVE_PERCEPTION = mod('Passive Perception Bonus', 'Passive Perception');
export const PROFICIENCY = mod('Proficiency Bonus Modifier', 'Proficiency Bonus');

/** MPMB's two ability save DCs on the first page. */
const DC_SLOTS = ['1', '2'] as const;

export interface SaveDc {
  modifier: Modifier;
  /** The ability it uses ("Cha"). */
  ability: AbilityKey;
  /**
   * MPMB takes it from a spellcasting class on the spell sheet, where its modifiers go (it makes the
   * blue field read-only then).
   */
  linked: boolean;
}

/** The save DCs the player gave an ability (the second one is often empty). */
export function saveDcs(fields: FieldViews): SaveDc[] {
  return DC_SLOTS.flatMap((n) => {
    // The ability's choice reads "Cha Mod": the field with its modifier.
    const ability = valueOf(fields, `Spell DC ${n} Mod`).split(' ')[0] as AbilityKey;
    if (!ability || !ABILITIES.includes(ability as (typeof ABILITIES)[number])) return [];
    const field = `Spell DC ${n} Bonus`;
    return [
      {
        modifier: mod(field, `Spell save DC ${n}`),
        ability,
        linked: ((fields[field]?.flags ?? 0) & FF.readonly) !== 0,
      },
    ];
  });
}

/** Whether the player set it: MPMB's empty value is "" or "0". */
export function isSet(fields: FieldViews, modifier: Modifier): boolean {
  const value = valueOf(fields, modifier.field).trim();
  return value !== '' && value !== '0';
}

/** Every blue field of the step, for the count next to the step's name. */
export function allModifiers(fields: FieldViews): Modifier[] {
  return [
    ...ARMOR_CLASS,
    INITIATIVE,
    ALL_SAVES,
    ...SAVES.map((s) => s.modifier),
    ALL_SKILLS,
    ...SKILL_MODIFIERS.map((s) => s.modifier),
    PASSIVE_PERCEPTION,
    ...saveDcs(fields).map((d) => d.modifier),
    PROFICIENCY,
  ];
}

export const setCount = (fields: FieldViews): number => allModifiers(fields).filter((m) => isSet(fields, m)).length;
