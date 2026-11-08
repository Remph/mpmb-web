// Effects: a feature that works only while it is on (a stance, an aura, a song) and changes numbers the
// sheet shows. MPMB has no switch for these: its scripts add such bonuses for good or leave them to the
// player, and a feature that comes from no script at all (typed in by hand) has no rules in the sheet to
// read. So the player sets an effect up once (its AC bonus, the ability its weapon attacks use) and the
// switch writes those changes into MPMB's own fields, and takes them out again. The effects themselves
// live only in the app, next to the character (like the ult charges); the changes they made are ordinary
// sheet values, so a printed or filled PDF shows them while they are on.
import type { Step } from '../session.svelte.ts';
import type { FieldViews } from '../worker/views.ts';
import { ABILITIES, isOn, numberOf, readAttacks, valueOf } from './read.ts';

export type EffectAbility = (typeof ABILITIES)[number];

/** What the switch changed, so switching off puts back exactly that and nothing the player changed since. */
export interface Applied {
  /** The AC field the bonus went into, its old value and description, and what the effect wrote there. */
  ac?: { field: AcField; before: string; beforeNote: string; value: string; note: string };
  /** The attack rows whose ability changed: the row, the weapon in it then, and the ability before. */
  attacks: { row: number; weapon: string; before: string }[];
}

export interface Effect {
  id: string;
  name: string;
  /** The AC bonus: an ability's modifier, a number, or both ("Int+1"); none when both are empty. */
  acAbility: EffectAbility | '';
  acNumber: number;
  /** The ability weapon attacks use instead of Strength or Dexterity, if any. */
  weaponAbility: EffectAbility | '';
  /** Set while the effect is on. */
  applied: Applied | null;
}

/** MPMB's two free AC fields ("AC Misc Mod 1" and "2", each with a description beside it). */
const AC_FIELDS = [1, 2] as const;
type AcField = (typeof AC_FIELDS)[number];
const isAcField = (n: unknown): n is AcField => AC_FIELDS.includes(n as AcField);
/** Long enough for any field value or weapon name the sheet keeps; a hand-edited backup can't bloat it. */
const MAX_TEXT = 200;
const MAX_ID = 60;
const acField = (n: number): string => `AC Misc Mod ${n}`;
const acNote = (n: number): string => `AC Misc Mod ${n} Description`;
/** The attack ability MPMB's "Mod" drop-down stores: "Int Mod" (shown as "Int"). */
const modValue = (ability: EffectAbility): string => `${ability} Mod`;
/** Weapon attacks: the rows that use Strength or Dexterity (spells and cantrips use other ones or none). */
const WEAPON_MODS = new Set(['Str Mod', 'Dex Mod']);

export const MAX_EFFECTS = 8;
export const MAX_NAME = 40;
export const MAX_AC_NUMBER = 10;

export const newEffect = (id: string, name = ''): Effect => ({
  id,
  name,
  acAbility: '',
  acNumber: 0,
  weaponAbility: '',
  applied: null,
});

export const effectOn = (effect: Effect): boolean => effect.applied !== null;

/**
 * The AC bonus as MPMB's AC fields take it: "Int", "2", "Int+1", "Int-1"; empty for none. MPMB works out
 * the ability part itself, so the AC follows a new Intelligence score while the effect is on.
 */
export function acText(effect: Pick<Effect, 'acAbility' | 'acNumber'>): string {
  const { acAbility: ability, acNumber: n } = effect;
  if (!ability) return n ? String(n) : '';
  if (!n) return ability;
  return n > 0 ? `${ability}+${n}` : `${ability}${n}`;
}

const isAbility = (value: unknown): value is EffectAbility => ABILITIES.includes(value as EffectAbility);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const text = (value: unknown, max = MAX_TEXT): string => (typeof value === 'string' ? value.slice(0, max) : '');

function readApplied(value: unknown): Applied | null {
  if (!isObject(value)) return null;
  const attacks = Array.isArray(value.attacks)
    ? value.attacks
        .filter(isObject)
        .flatMap((a) =>
          typeof a.row === 'number' && Number.isInteger(a.row)
            ? [{ row: a.row, weapon: text(a.weapon), before: text(a.before) }]
            : [],
        )
    : [];
  const ac = value.ac;
  if (!isObject(ac) || !isAcField(ac.field)) return { attacks };
  return {
    ac: {
      field: ac.field,
      before: text(ac.before),
      beforeNote: text(ac.beforeNote),
      value: text(ac.value),
      note: text(ac.note),
    },
    attacks,
  };
}

/** Whatever a stored or restored entry holds, made into valid effects (old or hand-edited backups). */
export function readEffects(value: unknown): Effect[] {
  if (!Array.isArray(value)) return [];
  // The ids key the card's switches: a repeated one (a copied entry in a hand-edited backup) would make
  // Svelte's keyed list fail, so a repeat gets a new id.
  const ids = new Set<string>();
  const free = (id: string, i: number): string => (ids.has(id) ? free(`${id}-${i}`, i) : id);
  const uniqueId = (wanted: string, i: number): string => {
    const id = free(wanted || `effect-${i}`, i);
    ids.add(id);
    return id;
  };
  return value
    .filter(isObject)
    .slice(0, MAX_EFFECTS)
    .map((v, i) => {
      const n = typeof v.acNumber === 'number' && Number.isFinite(v.acNumber) ? Math.round(v.acNumber) : 0;
      return {
        id: uniqueId(text(v.id, MAX_ID), i),
        name: text(v.name, MAX_NAME),
        acAbility: isAbility(v.acAbility) ? v.acAbility : '',
        acNumber: Math.max(-MAX_AC_NUMBER, Math.min(MAX_AC_NUMBER, n)),
        weaponAbility: isAbility(v.weaponAbility) ? v.weaponAbility : '',
        applied: readApplied(v.applied),
      };
    });
}

/** The modifier of an ability as the sheet has it (0 when the field is empty). */
const modifier = (fields: FieldViews, ability: string): number => numberOf(fields, `${ability} Mod`) ?? 0;

/**
 * The attacks the switch would change: weapon rows on Str or Dex that the character is proficient with and
 * whose own modifier is not higher.
 */
export function weaponRows(fields: FieldViews, ability: EffectAbility | ''): { row: number; name: string }[] {
  if (!ability) return [];
  return readAttacks(fields).flatMap(({ row, name }) => {
    const mod = valueOf(fields, `Attack.${row}.Mod`);
    // "Use Int instead of Str or Dex" is a choice the player makes when it helps: a weapon whose own
    // ability is higher keeps it.
    if (!WEAPON_MODS.has(mod) || modifier(fields, mod.replace(' Mod', '')) > modifier(fields, ability)) return [];
    // Features like this work with weapons the character is trained with (MPMB's own scripts for them test
    // the row's proficiency box too); a weapon without proficiency keeps its ability.
    if (!isOn(fields, `Attack.${row}.Proficiency`)) return [];
    return [{ row, name }];
  });
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The field text with one term taken out: "Int+2" without "Int" is "2", "2+Int" without "Int" is "2";
 * null when the text holds no such term. Terms are what MPMB adds up in an AC field, joined by "+" or "-",
 * so "Int" is not found in "Int2" and "1" is not found in "10".
 */
export function withoutTerm(text: string, term: string): string | null {
  if (!term) return null;
  if (text === term) return '';
  if (text.endsWith(`+${term}`)) return text.slice(0, -term.length - 1);
  if (text.startsWith(`${term}+`)) return text.slice(term.length + 1);
  // "Int-1" without "Int" keeps the minus: "-1".
  if (text.startsWith(`${term}-`)) return text.slice(term.length);
  const at = text.search(new RegExp(`\\+${escape(term)}[+-]`));
  if (at < 0) return null;
  // "1+Int+2" without "Int": "1+2"; "1+Int-2": "1-2".
  return text.slice(0, at) + text.slice(at + term.length + 1);
}

/** The description with one name taken out of its list ("Ring, Stance" without "Stance"); null if it isn't there. */
export function withoutName(note: string, name: string): string | null {
  const names = note.split(', ');
  const at = names.indexOf(name);
  if (!name || at < 0) return null;
  names.splice(at, 1);
  return names.join(', ');
}

/**
 * The AC field that already holds this effect's bonus under its name, if one does and no other effect
 * that is on claims it. The app's record of an effect can fall behind the sheet (a restored backup, an
 * older copy of the character): switching on then takes over what is there instead of adding it again.
 */
function heldField(fields: FieldViews, effect: Effect, bonus: string, others: readonly Effect[]): AcField | undefined {
  return AC_FIELDS.find(
    (n) =>
      withoutTerm(valueOf(fields, acField(n)), bonus) !== null &&
      withoutName(valueOf(fields, acNote(n)), effect.name) !== null &&
      !others.some((o) => o.id !== effect.id && o.name === effect.name && o.applied?.ac?.field === n),
  );
}

/**
 * The changes that switch an effect on, and what they changed (to keep with the effect). `others` are the
 * character's other effects: one of them that is on may hold a bonus under the same name.
 */
export function switchOn(
  fields: FieldViews,
  effect: Effect,
  others: readonly Effect[] = [],
): { steps: Step[]; applied: Applied } {
  const steps: Step[] = [];
  const applied: Applied = { attacks: [] };
  const bonus = acText(effect);
  const held = bonus ? heldField(fields, effect, bonus, others) : undefined;
  if (held) {
    // Already in the sheet: nothing to write, and switching off takes out just this bonus.
    const value = valueOf(fields, acField(held));
    const note = valueOf(fields, acNote(held));
    const before = withoutTerm(value, bonus) ?? '';
    const beforeNote = withoutName(note, effect.name) ?? '';
    applied.ac = { field: held, before, beforeNote, value, note };
  } else if (bonus) {
    // A free AC field if there is one; otherwise the bonus goes on top of the first one's.
    const free = AC_FIELDS.find((n) => valueOf(fields, acField(n)) === '' && valueOf(fields, acNote(n)) === '');
    const field = free ?? AC_FIELDS[0];
    const before = valueOf(fields, acField(field));
    const beforeNote = valueOf(fields, acNote(field));
    const value = before === '' ? bonus : `${before}+${bonus}`;
    const note = beforeNote === '' ? effect.name : `${beforeNote}, ${effect.name}`;
    steps.push({ edit: acField(field), text: value }, { edit: acNote(field), text: note });
    applied.ac = { field, before, beforeNote, value, note };
  }
  if (effect.weaponAbility) {
    const to = modValue(effect.weaponAbility);
    weaponRows(fields, effect.weaponAbility).forEach(({ row, name }) => {
      const before = valueOf(fields, `Attack.${row}.Mod`);
      if (before === to) return;
      steps.push({ edit: `Attack.${row}.Mod`, text: to });
      applied.attacks.push({ row, weapon: name, before });
    });
  }
  return { steps, applied };
}

/**
 * The changes that switch an effect off: each field it changed goes back, as long as it still holds what
 * the effect wrote (a field the player changed since keeps the player's value). An AC field where more
 * was added since (another effect on top, or MPMB's own bonus) loses only this effect's bonus and name.
 * Copies of the bonus under the effect's name that an older version of the app added twice (quick taps)
 * go too, so switching off once repairs such a sheet. `others`: as for switchOn.
 */
export function switchOff(fields: FieldViews, effect: Effect, others: readonly Effect[] = []): Step[] {
  const applied = effect.applied;
  if (!applied) return [];
  const steps: Step[] = [];
  const { ac } = applied;
  const bonus = acText(effect);
  AC_FIELDS.forEach((n) => {
    const was = { value: valueOf(fields, acField(n)), note: valueOf(fields, acNote(n)) };
    let { value, note } = was;
    if (ac?.field === n) {
      if (value === ac.value) {
        value = ac.before;
        note = note === ac.note ? ac.beforeNote : (withoutName(note, effect.name) ?? note);
      } else {
        const rest = withoutTerm(value, bonus);
        if (rest !== null) [value, note] = [rest, withoutName(note, effect.name) ?? note];
      }
    }
    // Another effect that is on, with the same name, may hold the rest of this field.
    const claimed = others.some((o) => o.id !== effect.id && o.name === effect.name && o.applied?.ac?.field === n);
    for (let i = 0; !claimed && i < MAX_EFFECTS; i++) {
      const rest = withoutTerm(value, bonus);
      const restNote = withoutName(note, effect.name);
      if (rest === null || restNote === null) break;
      [value, note] = [rest, restNote];
    }
    if (value !== was.value) steps.push({ edit: acField(n), text: value });
    if (note !== was.note) steps.push({ edit: acNote(n), text: note });
  });
  const to = effect.weaponAbility ? modValue(effect.weaponAbility) : '';
  applied.attacks.forEach(({ row, weapon, before }) => {
    const same = valueOf(fields, `Attack.${row}.Weapon Selection`) === weapon;
    if (same && to && valueOf(fields, `Attack.${row}.Mod`) === to)
      steps.push({ edit: `Attack.${row}.Mod`, text: before });
  });
  return steps;
}

/**
 * One tap on an effect's switch: the sheet's changes and the effects after it. The effect is looked up
 * by id in `effects`, the list as it is now, never taken from what the page showed when it was tapped:
 * a second tap that comes before the page has caught up with the first would otherwise see the effect
 * still off and add its bonus a second time (each such tap raised the AC again).
 */
export function toggle(
  fields: FieldViews,
  effects: readonly Effect[],
  id: string,
): { steps: Step[]; effects: Effect[] } {
  const effect = effects.find((e) => e.id === id);
  if (!effect) return { steps: [], effects: [...effects] };
  if (effectOn(effect)) {
    const steps = switchOff(fields, effect, effects);
    return { steps, effects: effects.map((e) => (e.id === id ? { ...e, applied: null } : e)) };
  }
  const { steps, applied } = switchOn(fields, effect, effects);
  return { steps, effects: effects.map((e) => (e.id === id ? { ...e, applied } : e)) };
}
