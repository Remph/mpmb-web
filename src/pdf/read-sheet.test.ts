/* eslint-disable ts-patterns/no-magic-numbers -- page sizes, positions and flags are the test data */
// The reader on a small PDF made here with pdf-lib: fields with scripts, a check box, a field tree,
// the calculation order, a template page, bookmarks and the document info.
import { PDFDocument, PDFHexString, PDFName, PDFString } from '@cantoo/pdf-lib';
import type { PDFDict, PDFRef } from '@cantoo/pdf-lib';
import { describe, expect, test } from 'vitest';
import { decodeScriptBytes, readSheetPdf } from './read-sheet.ts';

const js = (doc: PDFDocument, code: string): PDFDict =>
  doc.context.obj({ S: 'JavaScript', JS: PDFHexString.fromText(code) });

async function makePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Test sheet');
  const page = doc.addPage([200, 200]);
  doc.addPage([200, 200]);
  const form = doc.getForm();

  const a = form.createTextField('A');
  a.setText('5');
  a.addToPage(page, { x: 10, y: 10, width: 50, height: 20, borderWidth: 0 });
  a.acroField.dict.set(PDFName.of('TU'), PDFString.of('Tooltip'));
  a.acroField.dict.set(PDFName.of('TM'), PDFString.of('({kept:true})'));
  a.acroField.dict.set(PDFName.of('AA'), doc.context.obj({ C: js(doc, 'event.value = 1;'), K: js(doc, '// keys') }));

  const box = form.createCheckBox('Group.Box');
  box.addToPage(page, { x: 10, y: 40, width: 10, height: 10 });
  box.acroField.dict.set(PDFName.of('A'), js(doc, 'log("clicked");'));

  // A template: a page that is not in the page tree, named under /Names /Templates. The field goes
  // on page 1 first and its widget then moves to the template page.
  const note = form.createTextField('Note');
  note.addToPage(page, { x: 10, y: 10, width: 50, height: 20, borderWidth: 0 });
  const annots = page.node.Annots();
  if (!annots) throw new Error('page 1 has no widgets');
  const last = annots.size() - 1;
  const noteWidget = annots.get(last);
  annots.remove(last);
  const tplPage = doc.context.register(doc.context.obj({ Type: 'Page', Annots: [noteWidget] }));
  doc.catalog.set(PDFName.of('Names'), doc.context.obj({ Templates: { Names: [PDFString.of('Extra'), tplPage] } }));

  const acroForm = doc.catalog.lookup(PDFName.of('AcroForm')) as PDFDict;
  acroForm.set(PDFName.of('CO'), doc.context.obj([a.ref]));

  const outlineRoot = doc.context.nextRef();
  const item: PDFRef = doc.context.register(
    doc.context.obj({ Title: PDFHexString.fromText('Menu •'), Parent: outlineRoot, A: js(doc, 'menu();') }),
  );
  doc.context.assign(outlineRoot, doc.context.obj({ Type: 'Outlines', First: item, Last: item, Count: 1 }));
  doc.catalog.set(PDFName.of('Outlines'), outlineRoot);

  return doc.save({ updateFieldAppearances: true });
}

describe('readSheetPdf', async () => {
  const sheet = await readSheetPdf(await makePdf());

  test('fields with their value, names, scripts and widgets', () => {
    expect(sheet.fields.A).toMatchObject({
      type: 'Tx',
      value: '5',
      userName: 'Tooltip',
      submitName: '({kept:true})',
      actions: { C: 'event.value = 1;', K: '// keys' },
      widgets: [{ page: 0, rect: [10, 10, 60, 30] }],
    });
  });

  test('check boxes in a field tree, with their on state and mouse-up script', () => {
    expect(sheet.fields['Group.Box']).toMatchObject({
      type: 'Btn',
      actions: { A: 'log("clicked");' },
      widgets: [{ page: 0, on: 'Yes' }],
    });
  });

  test('calculation order, pages, templates, bookmarks and info', () => {
    expect(sheet.calcOrder).toEqual(['A']);
    expect(sheet.numPages).toBe(2);
    expect(sheet.templates).toEqual({ Extra: ['Note'] });
    expect(sheet.fields.Note?.widgets[0]?.page).toBe(-1);
    expect(sheet.outline).toEqual([{ name: 'Menu •', children: [], action: 'menu();' }]);
    expect(sheet.info.Title).toBe('Test sheet');
  });
});

describe('decodeScriptBytes', () => {
  test('UTF-16 with a byte order mark, UTF-8, and Latin-1 as the fallback', () => {
    expect(decodeScriptBytes(new Uint8Array([0xfe, 0xff, 0, 0x41, 0x20, 0x22]))).toBe('A•');
    expect(decodeScriptBytes(new TextEncoder().encode('café'))).toBe('café');
    expect(decodeScriptBytes(new Uint8Array([0x63, 0xe9]))).toBe('cé');
  });
});
