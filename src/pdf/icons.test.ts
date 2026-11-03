/* eslint-disable ts-patterns/no-magic-numbers -- pixel values and sizes are the test data */
// The portrait as Acrobat stores it: a button whose icon (/MK /I) is a form that draws an image. The test
// PDFs are made here with pdf-lib: one with a JPEG, one with a PNG that has see-through pixels (pdf-lib
// stores it as raw pixels plus an alpha mask, as Acrobat does), one with a vector icon.
import { PDFDocument, PDFName } from '@cantoo/pdf-lib';
import type { PDFImage } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { readSheetPdf } from './read-sheet.ts';
import { encodePng } from './png.ts';

/** A 1 × 1 baseline JPEG (one gray pixel). */
const JPEG = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  ),
  (c) => c.charCodeAt(0),
);

/** A PDF with a "Portrait" button whose icon draws `image` (or only a line, for a vector icon). */
async function sheetWith(embed: (pdf: PDFDocument) => Promise<PDFImage | null>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const image = await embed(pdf);
  const content = image ? 'q 10 0 0 10 0 0 cm /Im0 Do Q' : '0 0 m 10 10 l S';
  const resources = image ? { XObject: { Im0: image.ref } } : {};
  const icon = pdf.context.register(
    pdf.context.stream(new TextEncoder().encode(content), {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Resources: resources,
    }),
  );
  const button = pdf.getForm().createButton('Portrait');
  button.addToPage('', page, { x: 10, y: 10, width: 100, height: 120 });
  button.acroField.getWidgets()[0]?.dict.set(PDFName.of('MK'), pdf.context.obj({ I: icon }));
  return pdf.save();
}

const decode = (src: string): Uint8Array => Uint8Array.from(atob(src.split(',')[1] ?? ''), (c) => c.charCodeAt(0));

describe('the portrait in a PDF', () => {
  it('comes as it is when it is a JPEG', async () => {
    const sheet = await readSheetPdf(await sheetWith((pdf) => pdf.embedJpg(JPEG)));
    const src = sheet.images?.portrait?.src ?? '';
    expect(src.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(decode(src)).toEqual(JPEG);
  });

  it('becomes a PNG with its see-through parts when Acrobat stored raw pixels', async () => {
    // 2 × 1: an opaque red pixel and a see-through blue one.
    const original = await encodePng({
      width: 2,
      height: 1,
      channels: 4,
      data: Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 0]),
    });
    const sheet = await readSheetPdf(await sheetWith((pdf) => pdf.embedPng(original)));
    const src = sheet.images?.portrait?.src ?? '';
    expect(src.startsWith('data:image/png;base64,')).toBe(true);
    // pdf-lib stores the colour and the alpha mask apart; put together again, they are the same PNG.
    expect(decode(src)).toEqual(original);
  });

  it('is left out when the icon is a drawing, such as MPMB\'s "click me" placeholder', async () => {
    const sheet = await readSheetPdf(await sheetWith(() => Promise.resolve(null)));
    expect(sheet.images).toBeUndefined();
  });
});
