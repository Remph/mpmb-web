/* eslint-disable ts-patterns/no-magic-numbers -- page sizes, positions and flags are the test data */
// The writer, read back with the reader. A small sheet made here with pdf-lib checks the moves MPMB
// makes (values, a page spawned from a template with renaming, deleting it again, the pictures). The real
// sheet runs too when MPMB_BLANK_PDF names a blank Colorful A4 v24.2.0 PDF: the app doesn't ship MPMB's
// PDF, so neither does the repo. Then both reference characters must come back field for field.
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFString } from '@cantoo/pdf-lib';
import { describe, expect, test } from 'vitest';
import { REFERENCE_CHARACTERS, referenceSheet } from '../../test/characters.ts';
import type { SheetSnapshot } from '../engine/types.ts';
import { dataUrl } from './icons.ts';
import { encodePng } from './png.ts';
import { readSheetPdf } from './read-sheet.ts';
import { WrongSheetError, writeSheetPdf } from './write-sheet.ts';

/**
 * One page with a name, a check box and a species drop-down you can also type into, and template "Spells"
 * with field "Spell" on its hidden page.
 */
async function makeSheet(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  const form = doc.getForm();
  form.createTextField('Name').addToPage(page, { x: 10, y: 150, width: 100, height: 20, borderWidth: 0 });
  form.createCheckBox('Inspired').addToPage(page, { x: 10, y: 120, width: 10, height: 10 });
  form.createButton('Portrait').addToPage('', page, { x: 120, y: 100, width: 60, height: 80 });
  const species = form.createDropdown('Species');
  species.addOptions(['', 'Dwarf', 'Elf']);
  species.enableEditing();
  species.addToPage(page, { x: 10, y: 90, width: 100, height: 20, borderWidth: 0 });
  // As on MPMB's blank sheet: the empty first entry marked as chosen.
  species.acroField.dict.set(PDFName.of('I'), doc.context.obj([0]));

  // The template's field goes on page 1 first; its widget then moves to the template page.
  form.createTextField('Spell').addToPage(page, { x: 10, y: 50, width: 100, height: 20, borderWidth: 0 });
  const annots = page.node.Annots();
  if (!annots) throw new Error('page 1 has no widgets');
  const last = annots.size() - 1;
  const widget = annots.get(last);
  annots.remove(last);
  const template = doc.context.register(
    doc.context.obj({ Type: 'Template', MediaBox: [0, 0, 200, 200], Annots: [widget] }),
  );
  doc.catalog.set(PDFName.of('Names'), doc.context.obj({ Templates: { Names: [PDFString.of('Spells'), template] } }));
  // MPMB keeps its sheet type and version in the document info; setTitle makes the info dictionary.
  doc.setTitle('Test sheet');
  const info = doc.context.lookup(doc.context.trailerInfo.Info, PDFDict);
  info.set(PDFName.of('SheetType'), PDFString.of('Test'));
  info.set(PDFName.of('SheetVersion'), PDFString.of('1'));
  return doc.save({ useObjectStreams: false });
}

/** `sheet` with page 2 spawned from "Spells" with renaming, as MPMB's DoTemplate does. */
function withSpellPage(sheet: SheetSnapshot): SheetSnapshot {
  const spell = sheet.fields.Spell;
  if (!spell) throw new Error('no Spell field');
  return {
    ...sheet,
    numPages: 2,
    fields: {
      ...sheet.fields,
      'P1.Spells.Spell': { ...spell, value: 'Fire Bolt', widgets: spell.widgets.map((w) => ({ ...w, page: 1 })) },
    },
  };
}

/** What a field is in the PDF, without the order its scripts are listed in. */
const shape = (sheet: SheetSnapshot): unknown =>
  Object.fromEntries(
    Object.entries(sheet.fields).map(([field, def]) => [
      field,
      { ...def, actions: Object.fromEntries(Object.entries(def.actions).sort(([a], [b]) => a.localeCompare(b))) },
    ]),
  );

/**
 * The entries the Species drop-down marks as chosen (/I). Firefox shows these, not the value, so they must
 * agree with it.
 */
async function speciesMarks(pdf: Uint8Array): Promise<number[] | undefined> {
  const dict = (await PDFDocument.load(pdf)).getForm().getDropdown('Species').acroField.dict;
  return dict
    .lookupMaybe(PDFName.of('I'), PDFArray)
    ?.asArray()
    .map((n) => (n as PDFNumber).asNumber());
}

describe('writing a character into a sheet PDF', () => {
  test('values, a check box and a page spawned from a template come back as written', async () => {
    const blank = await makeSheet();
    const given = await readSheetPdf(blank);
    const target = withSpellPage(given);
    target.fields.Name = { ...given.fields.Name!, value: 'Ilsa' };
    target.fields.Inspired = { ...given.fields.Inspired!, value: 'Yes' };

    const written = await writeSheetPdf(blank, target);
    const back = await readSheetPdf(written);
    expect(back.numPages).toBe(2);
    expect(shape(back)).toEqual(shape(target));
    // The new page names its template, as on a page Acrobat spawned.
    const pages = (await PDFDocument.load(written)).getPages();
    expect(pages[1]?.node.get(PDFName.of('TemplateInstantiated'))).toBe(PDFName.of('Spells'));
    // The template stays as it was, for MPMB to spawn from again.
    expect(back.templates).toEqual(given.templates);
  });

  test('a drop-down marks the entry its value names, or none for a typed value', async () => {
    const blank = await makeSheet();
    const given = await readSheetPdf(blank);
    const chosen = async (value: string): Promise<number[] | undefined> => {
      const target = { ...given, fields: { ...given.fields, Species: { ...given.fields.Species!, value } } };
      return speciesMarks(await writeSheetPdf(blank, target));
    };
    expect(await chosen('Elf')).toEqual([2]);
    expect(await chosen('')).toEqual([0]);
    expect(await chosen('Thri-kreen')).toBeUndefined();
  });

  test('a stale mark is fixed even when the value stays: a PDF filled before the fix, picked as the base', async () => {
    // Such a PDF has the value Elf but still marks the empty first entry.
    const old = await PDFDocument.load(await makeSheet());
    old.getForm().getDropdown('Species').acroField.dict.set(PDFName.of('V'), PDFString.of('Elf'));
    const base = await old.save();
    expect(await speciesMarks(await writeSheetPdf(base, await readSheetPdf(base)))).toEqual([2]);
  });

  test('the original bytes stay in front: the PDF grows by an update, as Acrobat saves', async () => {
    const blank = await makeSheet();
    const written = await writeSheetPdf(blank, withSpellPage(await readSheetPdf(blank)));
    expect(written.subarray(0, blank.length)).toEqual(blank);
  });

  test('a page the character deleted goes, with its fields', async () => {
    const blank = await makeSheet();
    const spawned = await writeSheetPdf(blank, withSpellPage(await readSheetPdf(blank)));
    const target = await readSheetPdf(blank);
    const back = await readSheetPdf(await writeSheetPdf(spawned, target));
    expect(back.numPages).toBe(1);
    expect(back.fields['P1.Spells.Spell']).toBeUndefined();
    expect(shape(back)).toEqual(shape(target));
  });

  test('the portrait goes on its button and reads back as the same picture', async () => {
    const blank = await makeSheet();
    const pixels = {
      width: 2,
      height: 2,
      channels: 3,
      data: new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9]),
    };
    const src = dataUrl('image/png', await encodePng(pixels));
    const target = { ...(await readSheetPdf(blank)), images: { portrait: { src, thumb: src } } };
    const back = await readSheetPdf(await writeSheetPdf(blank, target));
    expect(back.images?.portrait?.src).toBe(src);
  });

  test('a PDF of another sheet is refused', async () => {
    const blank = await makeSheet();
    const target = await readSheetPdf(blank);
    target.info = { ...target.info, SheetVersion: '2' };
    await expect(writeSheetPdf(blank, target)).rejects.toBeInstanceOf(WrongSheetError);
  });
});

const BLANK_PDF = process.env.MPMB_BLANK_PDF;

/** A 1 × 1 baseline JPEG (one gray pixel), as in icons.test.ts. */
const JPEG = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  ),
  (c) => c.charCodeAt(0),
);

describe.runIf(BLANK_PDF)('the real sheet (MPMB_BLANK_PDF)', () => {
  test.each(REFERENCE_CHARACTERS)(
    '%s comes back field for field, with its pages',
    async (name) => {
      const blank = new Uint8Array(fs.readFileSync(BLANK_PDF ?? ''));
      const target = referenceSheet(name);
      const back = await readSheetPdf(await writeSheetPdf(blank, target));
      expect(back.numPages).toBe(target.numPages);
      expect(back.calcOrder).toEqual(target.calcOrder);
      expect(shape(back)).toEqual(shape(target));
    },
    120_000,
  );

  test("the portrait (JPEG) and the symbol (PNG) go on the sheet's own buttons", async () => {
    const blank = new Uint8Array(fs.readFileSync(BLANK_PDF ?? ''));
    const portrait = dataUrl('image/jpeg', JPEG);
    const pixels = { width: 2, height: 1, channels: 3, data: new Uint8Array([200, 30, 30, 30, 30, 200]) };
    const symbol = dataUrl('image/png', await encodePng(pixels));
    const target = {
      ...referenceSheet('paladin8-warlock2'),
      images: { portrait: { src: portrait, thumb: portrait }, symbol: { src: symbol, thumb: symbol } },
    };
    const back = await readSheetPdf(await writeSheetPdf(blank, target));
    expect(back.images?.portrait?.src).toBe(portrait);
    expect(back.images?.symbol?.src).toBe(symbol);
  }, 120_000);
});
