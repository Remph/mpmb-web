// Storage formats around SheetSnapshot.
//
// - The blank sheet ships "packed": the 4,345 fields share about 200 distinct scripts, so the scripts
//   are stored once and the fields point at them.
// - A character is stored as the difference from the blank sheet: only the fields (and the parts of
//   a field) that differ, plus the fields of pages spawned from templates. That keeps a character
//   small and lets a character made with one sheet version open on the same version's data.
import type { Bookmark, FieldDef, SheetSnapshot, Trigger } from './types.ts';

export const PACKED_FORMAT = 'mpmb-web-sheet';
export const CHARACTER_FORMAT = 'mpmb-web-character';
export const FORMAT_VERSION = 1;

type PackedActions = Partial<Record<Trigger, number>>;
type PackedField = Omit<FieldDef, 'actions'> & { actions?: PackedActions };

export interface PackedSheet {
  format: typeof PACKED_FORMAT;
  version: typeof FORMAT_VERSION;
  info: Record<string, string>;
  numPages: number;
  calcOrder: string[];
  templates: Record<string, string[]>;
  outline: Bookmark[];
  scripts: string[];
  /** [name, field] pairs: an array keeps the PDF's field order, which `getNthFieldName` exposes. */
  fields: [string, PackedField][];
}

export function packSheet(sheet: SheetSnapshot): PackedSheet {
  const scripts: string[] = [];
  const index = new Map<string, number>();
  const ref = (code: string): number => {
    const known = index.get(code);
    if (known !== undefined) return known;
    index.set(code, scripts.length);
    scripts.push(code);
    return scripts.length - 1;
  };
  const fields = Object.entries(sheet.fields).map(([name, def]): [string, PackedField] => {
    const { actions, ...rest } = def;
    const entries = Object.entries(actions) as [Trigger, string][];
    return [
      name,
      entries.length ? { ...rest, actions: Object.fromEntries(entries.map(([k, v]) => [k, ref(v)])) } : rest,
    ];
  });
  const { info, numPages, calcOrder, templates, outline } = sheet;
  return {
    format: PACKED_FORMAT,
    version: FORMAT_VERSION,
    info,
    numPages,
    calcOrder,
    templates,
    outline,
    scripts,
    fields,
  };
}

export function unpackSheet(packed: PackedSheet): SheetSnapshot {
  if (packed.format !== PACKED_FORMAT || packed.version !== FORMAT_VERSION)
    throw new Error('Unknown sheet data format');
  const fields: Record<string, FieldDef> = {};
  packed.fields.forEach(([name, def]) => {
    const actions = Object.fromEntries(
      Object.entries(def.actions ?? {}).map(([k, i]) => [k, packed.scripts[i] ?? '']),
    ) as FieldDef['actions'];
    fields[name] = { ...def, actions };
  });
  const { info, numPages, calcOrder, templates, outline } = packed;
  return { fields, info, numPages, calcOrder, templates, outline };
}

/** A field's differences from the blank sheet; `null` marks a key the character doesn't have. */
export type FieldPatch = { [K in keyof FieldDef]?: FieldDef[K] | null };

export interface CharacterData {
  format: typeof CHARACTER_FORMAT;
  version: typeof FORMAT_VERSION;
  info: Record<string, string>;
  numPages: number;
  /** Only when it differs from the blank sheet (MPMB adds calculations at run time). */
  calcOrder?: string[];
  outline?: Bookmark[];
  /**
   * Changed fields as patches; spawned fields as patches on their template original (or in full when
   * there is none); removed fields as `null`.
   */
  fields: Record<string, FieldPatch | null>;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Spawning a template with renaming copies each of its fields as `P<page>.<template>.<name>`, so a
 * spawned field is stored as its difference from the template's original field.
 * Matches "P6.SSfront.spells.name.0" (template SSfront, original "spells.name.0"), not "Page 6".
 * Try it: https://regex101.com/?regex=%5EP%5Cd%2B%5C.(%5B%5E.%5D%2B)%5C.(.%2B)%24&testString=P6.SSfront.spells.name.0
 */
const SPAWNED_NAME = /^P\d+\.([^.]+)\.(.+)$/;

/** The blank sheet's field that a field of this name starts from: itself, or its template original. */
export function baseFieldOf(blank: SheetSnapshot, name: string): FieldDef | undefined {
  const own = blank.fields[name];
  if (own) return own;
  const m = SPAWNED_NAME.exec(name);
  const [, template, original] = m ?? [];
  if (!template || !original || !blank.templates[template]?.includes(original)) return undefined;
  return blank.fields[original];
}

function patchOf(blank: FieldDef, own: FieldDef): FieldPatch | undefined {
  const keys = new Set([...Object.keys(blank), ...Object.keys(own)] as (keyof FieldDef)[]);
  const patch: Record<string, unknown> = {};
  keys.forEach((k) => {
    if (!same(blank[k], own[k])) patch[k] = own[k] ?? null;
  });
  return Object.keys(patch).length ? (patch as FieldPatch) : undefined;
}

export function diffCharacter(blank: SheetSnapshot, sheet: SheetSnapshot): CharacterData {
  const fields: CharacterData['fields'] = {};
  Object.entries(sheet.fields).forEach(([name, def]) => {
    const base = baseFieldOf(blank, name);
    const patch = base ? patchOf(base, def) : def;
    // A spawned field identical to its template original still has to be listed to exist.
    if (patch || !(name in blank.fields)) fields[name] = patch ?? {};
  });
  Object.keys(blank.fields).forEach((name) => {
    if (!(name in sheet.fields)) fields[name] = null;
  });
  const data: CharacterData = {
    format: CHARACTER_FORMAT,
    version: FORMAT_VERSION,
    info: sheet.info,
    numPages: sheet.numPages,
    fields,
  };
  if (!same(blank.calcOrder, sheet.calcOrder)) data.calcOrder = sheet.calcOrder;
  if (!same(blank.outline, sheet.outline)) data.outline = sheet.outline;
  return data;
}

/**
 * The full sheet of a character: the blank sheet with the character's differences applied. Spawned
 * fields come after the blank sheet's fields, as Acrobat lists fields made later.
 */
export function applyCharacter(blank: SheetSnapshot, data: CharacterData): SheetSnapshot {
  if (data.format !== CHARACTER_FORMAT || data.version !== FORMAT_VERSION) throw new Error('Unknown character format');
  const fields: Record<string, FieldDef> = {};
  Object.entries(blank.fields).forEach(([name, def]) => {
    const patch = data.fields[name];
    if (patch === null) return;
    fields[name] = patch ? applyPatch(def, patch) : structuredClone(def);
  });
  Object.entries(data.fields).forEach(([name, patch]) => {
    if (!patch || name in blank.fields) return;
    const base = baseFieldOf(blank, name);
    fields[name] = base ? applyPatch(base, patch) : structuredClone(patch as FieldDef);
  });
  return {
    fields,
    calcOrder: data.calcOrder ?? [...blank.calcOrder],
    numPages: data.numPages,
    templates: blank.templates,
    outline: data.outline ?? structuredClone(blank.outline),
    info: { ...data.info },
  };
}

function applyPatch(def: FieldDef, patch: FieldPatch): FieldDef {
  const out = structuredClone(def) as unknown as Record<string, unknown>;
  Object.entries(patch).forEach(([k, v]) => {
    if (v === null) delete out[k];
    else out[k] = structuredClone(v);
  });
  return out as unknown as FieldDef;
}
