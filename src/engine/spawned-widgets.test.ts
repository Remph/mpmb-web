/* eslint-disable ts-patterns/no-magic-numbers -- page numbers and rows are the test data */
// Pages spawned from templates against the pages Acrobat spawned: the blank sheet's companion and notes
// pages and the wizard reference character's spell sheets. Then the repair of pages the engine made before
// it copied the right template's widgets.
import { describe, expect, test } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { blankSheet } from './sheet.ts';
import { repairSpawnedWidgets, templateWidgets } from './spawned-widgets.ts';
import type { FieldDef, SheetSnapshot, Widget } from './types.ts';

/** Matches the fields MPMB moves on a spell sheet (headers, dividers, glossary); see spawned-widgets.ts. */
// Try it: https://regex101.com/?regex=%5E(BlueText%5C.)%3Fspells(head%7Cdiv%7Cgloss)%5C.&testString=BlueText.spellshead.dc.2
const MOVED_BY_MPMB = /^(BlueText\.)?spells(head|div|gloss)\./;

/**
 * The widget boxes of every field on a spawned page, by the template original's name. Sorted: Acrobat lists
 * the widgets of a field with several (the companion page's decorations) in the template page's order, the
 * engine in the field's; scripts don't tell those widgets apart.
 */
function page(sheet: SheetSnapshot, prefix: string): Map<string, string[]> {
  return new Map(
    Object.entries(sheet.fields)
      .filter(([name]) => name.startsWith(prefix))
      .map(([name, def]) => [name.slice(prefix.length), def.widgets.map((w) => JSON.stringify(w.rect)).sort()]),
  );
}

describe('spawning a template', () => {
  // Acrobat's spawned pages: in the blank sheet (companion page 5, notes page 6) and the wizard's spell pages.
  const blank = blankSheet();
  const wizard = referenceSheet('wizard10-evoker');
  const cases: [string, SheetSnapshot, string][] = [
    ['AScomp', blank, 'P4.AScomp.'],
    ['ASnotes', blank, 'P5.ASnotes.'],
    ['SSfront', wizard, 'P6.SSfront.'],
    ['SSmore', wizard, 'P7.SSmore.'],
  ];

  test.each(cases)(
    '%s with renaming gives each field the widgets Acrobat gives it',
    (template, acrobatSheet, prefix) => {
      const engine = openSheet();
      const at = engine.doc.numPages;
      engine.evaluate(`this.getTemplate(${JSON.stringify(template)}).spawn(${at}, true, false)`);
      const ours = page(engine.snapshot(), `P${at}.${template}.`);
      const acrobat = page(acrobatSheet, prefix);
      const differ = [...acrobat]
        .filter(([original]) => !MOVED_BY_MPMB.test(original))
        .filter(([original, rects]) => JSON.stringify(ours.get(original)) !== JSON.stringify(rects))
        .map(
          ([original, rects]) =>
            `${original}: acrobat ${JSON.stringify(rects)}, ours ${JSON.stringify(ours.get(original))}`,
        );
      expect(differ).toEqual([]);
      expect([...ours.keys()].sort()).toEqual([...acrobat.keys()].sort());
    },
  );

  test('without renaming adds every widget of the template to its fields', () => {
    const engine = openSheet();
    const before = engine.snapshot().fields['Image.Divider']?.widgets.length ?? 0;
    const onComp = templateWidgets(blank.fields['Image.Divider']?.widgets ?? [], 'AScomp');
    expect(onComp.length).toBeGreaterThan(1);
    const at = engine.doc.numPages;
    engine.evaluate(`this.getTemplate("AScomp").spawn(${at}, false, false)`);
    const widgets = engine.snapshot().fields['Image.Divider']?.widgets ?? [];
    expect(widgets).toHaveLength(before + onComp.length);
    expect(widgets.filter((w) => w.page === at).map((w) => w.rect)).toEqual(onComp.map((w) => w.rect));
    expect(widgets.filter((w) => w.page === at).every((w) => w.template === undefined)).toBe(true);
  });
});

describe('repairing spell pages the engine made before', () => {
  const blank = blankSheet();
  const TOP = 3;
  const BOTTOM = 1;
  /** The annotation flag that hides a widget (PDF 1.7, 12.5.3). */
  const HIDDEN = 2;
  /** What the engine spawned before: each field with its first widget off the pages, whichever template. */
  function oldSpawn(template: string, at: number): Record<string, FieldDef> {
    return Object.fromEntries(
      (blank.templates[template] ?? []).flatMap((original) => {
        const def = blank.fields[original];
        const first = def?.widgets.find((w) => w.page === -1);
        if (!def || !first) return [];
        const { template: _, ...widget } = first;
        return [[`P${at}.${template}.${original}`, { ...def, widgets: [{ ...widget, page: at }] }]];
      }),
    );
  }
  /** Acrobat's spawn: each field with its own template's widgets. */
  function rightSpawn(template: string, at: number): Record<string, FieldDef> {
    return Object.fromEntries(
      (blank.templates[template] ?? []).flatMap((original) => {
        const def = blank.fields[original];
        if (!def) return [];
        const widgets = templateWidgets(def.widgets, template).map(({ template: _, ...w }) => ({ ...w, page: at }));
        return [[`P${at}.${template}.${original}`, { ...def, widgets }]];
      }),
    );
  }
  const rectOf = (fields: Record<string, FieldDef>, name: string): number[] => fields[name]?.widgets[0]?.rect ?? [];
  const onTemplate = (original: string, template: string): Widget | undefined =>
    templateWidgets(blank.fields[original]?.widgets ?? [], template)[0];
  /**
   * MPMB's SetSpellSheetElement for header `n`: moves its fields so that the header's picture meets row
   * `row`, at the top as in Acrobat, or at the bottom as the engine did when it read rects upside down.
   */
  function placeHeader(fields: Record<string, FieldDef>, prefix: string, n: number, row: number, edge = TOP): void {
    // Try it: https://regex101.com/?regex=%5E(BlueText%5C.)%3Fspellshead%5C..%2B%5C.2%24&testString=BlueText.spellshead.dc.2
    const ofIt = new RegExp(`^(BlueText\\.)?spellshead\\..+\\.${n}$`);
    const dy =
      (rectOf(fields, `${prefix}spells.remember.${row}`)[edge] ?? 0) -
      (rectOf(fields, `${prefix}spellshead.Image.Header.Left.${n}`)[edge] ?? 0);
    Object.keys(fields)
      .filter((f) => f.startsWith(prefix) && ofIt.test(f.slice(prefix.length)))
      .forEach((f) => {
        const def = fields[f];
        const w = def?.widgets[0];
        // MPMB shows the header's fields (Show(), clearing the hidden flag) as it moves them.
        if (def && w)
          def.widgets = [{ ...w, rect: w.rect.map((v, i) => (i % 2 ? v + dy : v)), flags: w.flags & ~HIDDEN }];
      });
    const text = fields[`${prefix}spellshead.Text.header.${n}`];
    if (text) text.submitName = `${prefix}spells.remember.${row}`;
  }
  const sheetWith = (fields: Record<string, FieldDef>): SheetSnapshot => ({
    ...blank,
    fields: { ...blank.fields, ...fields },
  });
  /** The fields whose widgets differ in place (by more than rounding) or in being shown. */
  const misplaced = (want: Record<string, FieldDef>, got: Record<string, FieldDef>): string[] =>
    Object.keys(want).filter((name) => {
      const a = want[name]?.widgets ?? [];
      const b = got[name]?.widgets ?? [];
      return (
        a.length !== b.length ||
        a.some((w, i) => w.flags !== b[i]?.flags || w.rect.some((n, k) => Math.abs(n - (b[i]?.rect[k] ?? NaN)) > 0.015))
      );
    });

  test('a second spell page gets its rows where Acrobat has them, and its headers at the top of their rows', () => {
    const prefix = 'P7.SSmore.';
    const old = oldSpawn('SSmore', 7);
    // Before: the rows sit at the first spell page's places.
    expect(rectOf(old, `${prefix}spells.name.31`)).toEqual(onTemplate('spells.name.31', 'SSfront')?.rect);
    placeHeader(old, prefix, 1, 18, BOTTOM);
    placeHeader(old, prefix, 2, 31, BOTTOM);
    const right = rightSpawn('SSmore', 7);
    placeHeader(right, prefix, 1, 18);
    placeHeader(right, prefix, 2, 31);

    const { sheet, repaired } = repairSpawnedWidgets(blank, sheetWith(old));
    expect(repaired.length).toBeGreaterThan(800);
    expect(misplaced(right, sheet.fields)).toEqual([]);
    // The first header, unused here, is hidden as on SSmore, not shown as on SSfront.
    expect(old[`${prefix}spellshead.Text.header.0`]?.widgets[0]?.flags).not.toBe(
      sheet.fields[`${prefix}spellshead.Text.header.0`]?.widgets[0]?.flags,
    );
    expect(rectOf(sheet.fields, `${prefix}spellshead.Image.Header.Left.2`)[TOP]).toBe(
      rectOf(sheet.fields, `${prefix}spells.remember.31`)[TOP],
    );
  });

  test('a first spell page keeps its rows and gets its headers at the top of their rows', () => {
    const prefix = 'P6.SSfront.';
    const old = oldSpawn('SSfront', 6);
    placeHeader(old, prefix, 1, 28, BOTTOM);
    const right = rightSpawn('SSfront', 6);
    placeHeader(right, prefix, 1, 28);
    const { sheet, repaired } = repairSpawnedWidgets(blank, sheetWith(old));
    expect(misplaced(right, sheet.fields)).toEqual([]);
    // Fields it shares with the logsheet and wild shape pages go to their place on this page.
    expect(repaired).toContain('P6.SSfront.AdvLog.PC Name');
    expect(repaired).not.toContain('P6.SSfront.spells.name.0');
    // The first header stays above row 0, where the template has it.
    expect(repaired).not.toContain('P6.SSfront.spellshead.Text.header.0');
  });

  test('a field gets the widgets of its template the engine left out', () => {
    const { sheet } = repairSpawnedWidgets(blank, sheetWith(oldSpawn('AScomp', 8)));
    expect(misplaced(rightSpawn('AScomp', 8), sheet.fields)).toEqual([]);
    expect(sheet.fields['P8.AScomp.Image.Divider']?.widgets.length).toBeGreaterThan(1);
  });

  test('changes nothing the second time, nor on pages Acrobat spawned', () => {
    const old = oldSpawn('SSmore', 7);
    placeHeader(old, 'P7.SSmore.', 2, 31, BOTTOM);
    const once = repairSpawnedWidgets(blank, sheetWith(old)).sheet;
    expect(repairSpawnedWidgets(blank, once).repaired).toEqual([]);
    expect(repairSpawnedWidgets(blank, referenceSheet('wizard10-evoker')).repaired).toEqual([]);
    expect(repairSpawnedWidgets(blank, referenceSheet('paladin8-warlock2')).repaired).toEqual([]);
    expect(repairSpawnedWidgets(blank, blank).repaired).toEqual([]);
  });
});
