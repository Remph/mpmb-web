/* eslint-disable ts-patterns/no-magic-numbers -- page sizes, positions and flags are the test data */
// The writer, read back with the reader. A small sheet made here with pdf-lib checks the moves MPMB
// makes (values, a page spawned from a template with renaming, deleting it again, the pictures). The real
// sheet runs too when MPMB_BLANK_PDF names a blank Colorful A4 v24.2.0 PDF: the app doesn't ship MPMB's
// PDF, so neither does the repo. Then both reference characters must come back field for field.
import fs from 'node:fs';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
  decodePDFRawStream,
} from '@cantoo/pdf-lib';
import { describe, expect, test } from 'vitest';
import { REFERENCE_CHARACTERS, referenceSheet } from '../../test/characters.ts';
import type { SheetSnapshot } from '../engine/types.ts';
import { dataUrl } from './icons.ts';
import { encodePng } from './png.ts';
import { readSheetPdf } from './read-sheet.ts';
import { REDRAW_MARK, WrongSheetError, redrawScript, writeSheetPdf } from './write-sheet.ts';

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

  test('long values and scripts go as compressed streams, as Acrobat saves them, and read back', async () => {
    const blank = await makeSheet();
    const given = await readSheetPdf(blank);
    // MPMB keeps the add-on scripts a player imported in one field, megabytes long. Plain ASCII goes as plain
    // bytes, anything else as UTF-16; a short value stays a string.
    const ascii = "{'2024':{'spells':['fire bolt']}}".repeat(100_000);
    const wide = 'Zauber • 🐉 '.repeat(5_000);
    const script = `// ${'x'.repeat(40_000)}\nevent.value = 1;`;
    const target = withSpellPage(given);
    target.fields.Name = { ...given.fields.Name!, value: ascii, actions: { K: script } };
    target.fields['P1.Spells.Spell'] = { ...target.fields['P1.Spells.Spell']!, value: wide };

    const written = await writeSheetPdf(blank, target);
    const back = await readSheetPdf(written);
    expect(shape(back)).toEqual(shape(target));

    const form = (await PDFDocument.load(written)).getForm();
    const valueOf = (field: string): unknown => {
      const dict = form.getTextField(field).acroField.dict;
      return dict.lookup(PDFName.of('V'));
    };
    const name = valueOf('Name');
    expect(name).toBeInstanceOf(PDFRawStream);
    expect((name as PDFRawStream).dict.get(PDFName.of('Filter'))).toBe(PDFName.of('FlateDecode'));
    expect(valueOf('P1.Spells.Spell')).toBeInstanceOf(PDFRawStream);
    expect(valueOf('Spell')).toBeUndefined();
  });

  test('a long stream is plain bytes only when PDFDocEncoding reads them the same', async () => {
    const blank = await makeSheet();
    const given = await readSheetPdf(blank);
    // PDFDocEncoding reads 0x1f as an accent (ogonek), not as the control character: such text goes as UTF-16.
    const plain = 'Fire Bolt;\t\r\n'.repeat(2_000);
    const control = `${plain}\u001f`;
    const fields = { ...given.fields, Name: { ...given.fields.Name!, value: plain } };
    const target = { ...given, fields: { ...fields, Spell: { ...given.fields.Spell!, value: control } } };
    const written = await writeSheetPdf(blank, target);
    expect(shape(await readSheetPdf(written))).toEqual(shape(target));

    const form = (await PDFDocument.load(written)).getForm();
    const head = (field: string): number[] => {
      const v = form.getTextField(field).acroField.dict.lookup(PDFName.of('V'));
      expect(v).toBeInstanceOf(PDFRawStream);
      return [
        ...decodePDFRawStream(v as PDFRawStream)
          .decode()
          .subarray(0, 2),
      ];
    };
    expect(head('Name')).toEqual([0x46, 0x69]);
    expect(head('Spell')).toEqual([0xfe, 0xff]);
  });

  test('a short value stays a text string', async () => {
    const blank = await makeSheet();
    const given = await readSheetPdf(blank);
    const target = { ...given, fields: { ...given.fields, Name: { ...given.fields.Name!, value: 'Ilsa' } } };
    const form = (await PDFDocument.load(await writeSheetPdf(blank, target))).getForm();
    expect(form.getTextField('Name').acroField.dict.lookup(PDFName.of('V'))).toBeInstanceOf(PDFHexString);
  });

  test('an export with a long value is a base for the next export, and so is one from before the fix', async () => {
    const blank = await makeSheet();
    const given = await readSheetPdf(blank);
    // Over a million characters: far more than the call stack took before the fix, and still quick.
    const long = 'Ray of Frost; '.repeat(80_000);
    const withLong = { ...given, fields: { ...given.fields, Name: { ...given.fields.Name!, value: long } } };
    const first = await writeSheetPdf(blank, withLong);
    // Before the fix the writer put every value in a UTF-16 hex string, and reading it back overflowed.
    const old = await PDFDocument.load(blank);
    old.getForm().getTextField('Name').acroField.dict.set(PDFName.of('V'), PDFHexString.fromText(long));
    const oldExport = await old.save();

    const next = { ...withLong, fields: { ...withLong.fields, Inspired: { ...given.fields.Inspired!, value: 'Yes' } } };
    expect(shape(await readSheetPdf(await writeSheetPdf(first, next)))).toEqual(shape(next));
    expect(shape(await readSheetPdf(await writeSheetPdf(oldExport, next)))).toEqual(shape(next));
  }, 30_000);

  test('a PDF of another sheet is refused', async () => {
    const blank = await makeSheet();
    const target = await readSheetPdf(blank);
    target.info = { ...target.info, SheetVersion: '2' };
    await expect(writeSheetPdf(blank, target)).rejects.toBeInstanceOf(WrongSheetError);
  });
});

/** The script the PDF runs when it opens, or undefined. */
async function openScript(pdf: Uint8Array): Promise<{ code: string; next: unknown } | undefined> {
  const doc = await PDFDocument.load(pdf);
  const action = doc.catalog.lookupMaybe(PDFName.of('OpenAction'), PDFDict);
  if (!action) return undefined;
  const js = action.lookup(PDFName.of('JS'));
  const code =
    js instanceof PDFRawStream
      ? new TextDecoder().decode(decodePDFRawStream(js).decode())
      : (js as PDFHexString | PDFString).decodeText();
  return { code, next: action.get(PDFName.of('Next')) };
}

/** Runs the opening script on a stand-in for Acrobat's document, with `values` as its fields. */
function runOpenScript(code: string, values: Record<string, string>, info: Record<string, string> = {}) {
  const log: string[] = [];
  const doc = {
    info,
    calculate: true,
    delay: false,
    getField: (n: string) =>
      n in values
        ? {
            // As in Acrobat: text that looks like a number comes back as one ("+8" as 8).
            get value() {
              const v = values[n] ?? '';
              return v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
            },
            get valueAsString() {
              return values[n] ?? '';
            },
            set value(v: string | number) {
              // What Acrobat does on a set: draws the field. The stand-in notes the state it drew it in.
              log.push(`${n}=${String(v)} calculate:${String(doc.calculate)} delay:${String(doc.delay)}`);
            },
          }
        : null,
  };
  const consoleLog: string[] = [];
  new Function('console', code).call(doc, { println: (s: string) => consoleLog.push(s) });
  return { log, doc, consoleLog };
}

describe('drawing the values in Acrobat', () => {
  test('a script at opening has Acrobat draw the changed text fields; no NeedAppearances', async () => {
    const blank = await makeSheet();
    const given = await readSheetPdf(blank);
    const target = withSpellPage(given);
    target.fields.Name = { ...given.fields.Name!, value: 'Ilsa' };
    target.fields.Inspired = { ...given.fields.Inspired!, value: 'Yes' };
    const written = await writeSheetPdf(blank, target);

    const doc = await PDFDocument.load(written);
    // NeedAppearances makes Acrobat lose the fields on MPMB's hidden template pages, and MPMB with them.
    expect(doc.catalog.lookup(PDFName.of('AcroForm'), PDFDict).has(PDFName.of('NeedAppearances'))).toBe(false);
    // The old drawing of a changed text field goes: it shows the blank sheet's empty box.
    const nameWidget = doc.getForm().getTextField('Name').acroField.getWidgets()[0];
    expect(nameWidget?.dict.has(PDFName.of('AP'))).toBe(false);

    const script = await openScript(written);
    expect(script?.code.startsWith(REDRAW_MARK)).toBe(true);
    // The text fields with a new value, not the check box (its on and off drawings are in the PDF already).
    const { log } = runOpenScript(script?.code ?? '', { Name: 'Ilsa', 'P1.Spells.Spell': 'Fire Bolt', Spell: '' });
    expect(log).toEqual([
      'Name=Ilsa calculate:false delay:true',
      'P1.Spells.Spell=Fire Bolt calculate:false delay:true',
    ]);
  });

  test('a number-like text stays as typed ("+8", not 8)', () => {
    expect(runOpenScript(redrawScript(['To Hit'], 's'), { 'To Hit': '+8' }).log).toEqual([
      'To Hit=+8 calculate:false delay:true',
    ]);
  });

  test('the script runs once: its stamp in the document info stops it, and it puts calculations back on', () => {
    const code = redrawScript(['Name', 'Gone'], 'stamp-1');
    const first = runOpenScript(code, { Name: 'Ilsa' });
    expect(first.log).toHaveLength(1);
    expect(first.doc).toMatchObject({ calculate: true, delay: false, info: { MPMBWebDrawn: 'stamp-1' } });
    expect(runOpenScript(code, { Name: 'Ilsa' }, { MPMBWebDrawn: 'stamp-1' }).log).toEqual([]);
  });

  test('field names outside ASCII are escaped, so the script reads the same in any encoding', () => {
    const code = redrawScript(['Zauber • 1', 'a\u2028b'], 'x');
    expect(code).toMatch(/^[\x20-\x7e\n]*$/);
    expect(runOpenScript(code, { 'Zauber • 1': 'v', 'a\u2028b': 'w' }).log).toHaveLength(2);
  });

  test('a PDF an older version filled (NeedAppearances, no drawings) gets all its text values drawn', async () => {
    const old = await PDFDocument.load(await makeSheet());
    old.getForm().getTextField('Name').setText('Ilsa');
    old.catalog.lookup(PDFName.of('AcroForm'), PDFDict).set(PDFName.of('NeedAppearances'), old.context.obj(true));
    const base = await old.save();
    const written = await writeSheetPdf(base, await readSheetPdf(base));
    const doc = await PDFDocument.load(written);
    expect(doc.catalog.lookup(PDFName.of('AcroForm'), PDFDict).has(PDFName.of('NeedAppearances'))).toBe(false);
    const script = await openScript(written);
    expect(runOpenScript(script?.code ?? '', { Name: 'Ilsa' }).log).toEqual(['Name=Ilsa calculate:false delay:true']);
  });

  test('the next export replaces the script, and another opening action still runs after it', async () => {
    const blank = await makeSheet();
    const given = await readSheetPdf(blank);
    const named = (value: string) => ({
      ...given,
      fields: { ...given.fields, Name: { ...given.fields.Name!, value } },
    });
    const first = await writeSheetPdf(blank, named('Ilsa'));
    const second = await writeSheetPdf(first, named('Brom'), await readSheetPdf(first));
    expect((await openScript(second))?.next).toBeUndefined();

    const other = await PDFDocument.load(blank);
    other.catalog.set(PDFName.of('OpenAction'), other.context.obj({ S: 'JavaScript', JS: PDFString.of('hello();') }));
    const withOther = await other.save();
    const once = await writeSheetPdf(withOther, named('Ilsa'));
    expect(String((await openScript(once))?.next)).toContain('hello();');
    const twice = await writeSheetPdf(once, named('Brom'), await readSheetPdf(once));
    expect(String((await openScript(twice))?.next)).toContain('hello();');
  });

  test('no script when no text value changed', async () => {
    const blank = await makeSheet();
    expect(await openScript(await writeSheetPdf(blank, await readSheetPdf(blank)))).toBeUndefined();
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

  test('megabytes of imported add-on scripts come back, and the export is a base for the next one', async () => {
    const blank = new Uint8Array(fs.readFileSync(BLANK_PDF ?? ''));
    const target = referenceSheet('paladin8-warlock2');
    const field = 'User_Imported_Files.Stringified';
    // What MPMB keeps there: its add-on scripts, about 3 MB for a group with a few of them.
    const scripts = `({'My add-on.js':${JSON.stringify('var x = "Fire Bolt • ✦";\n'.repeat(120_000))}})`;
    target.fields[field] = { ...target.fields[field]!, value: scripts };
    const written = await writeSheetPdf(blank, target);
    const back = await readSheetPdf(written);
    expect(back.fields[field]?.value).toBe(scripts);
    expect(shape(back)).toEqual(shape(target));
    expect(shape(await readSheetPdf(await writeSheetPdf(written, target, back)))).toEqual(shape(target));
  }, 240_000);

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
