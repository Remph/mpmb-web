// Puts the portrait and symbol back on the sheet's picture buttons (M10): the reverse of iconImage in
// icons.ts. Acrobat shows a button's picture from the widget's icon (/MK /I, a form that draws the image)
// and draws the button from its appearance (/AP /N). Both are written: the icon so that MPMB's own
// "change the picture" and Acrobat's layout work on it, the appearance so that every viewer shows it
// without redrawing the button.
//
// A picture the character doesn't have is left as the PDF has it: in a blank sheet that is MPMB's own
// "click here" placeholder.
import { PDFArray, PDFDict, PDFName, PDFNumber } from '@cantoo/pdf-lib';
import type { PDFDocument, PDFImage, PDFRef } from '@cantoo/pdf-lib';
import type { SheetImages } from '../engine/types.ts';
import { IMAGE_SLOTS } from '../engine/types.ts';
import { SAFE_PICTURE } from '../play/pictures.ts';
import { PICTURE_FIELDS } from './icons.ts';

const name = (key: string): PDFName => PDFName.of(key);
/** Two decimals are far finer than a printer dot (1/7200 inch). */
const DECIMALS = 2;
/** The scale needs more: 0.16 for 0.156 would shrink a 640-pixel portrait by 2.5 %. */
const SCALE_DECIMALS = 5;
/** A /Rect is [left bottom right top]. */
const RIGHT = 2;
const TOP = 3;
/** Centring: half the room that is left. */
const HALF = 2;

const num = (n: number): string => n.toFixed(DECIMALS);

/** The image drawn at its own size in pixels, as Acrobat stores a button icon (it scales it to the button). */
function iconForm(pdf: PDFDocument, image: PDFImage): PDFRef {
  const ops = `q ${image.width} 0 0 ${image.height} 0 0 cm /Img Do Q`;
  return pdf.context.register(
    pdf.context.flateStream(ops, {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, image.width, image.height],
      Resources: { XObject: { Img: image.ref } },
    }),
  );
}

/** The button's look: the icon scaled to fit the button and centred, as Acrobat's default icon fit does. */
function appearance(pdf: PDFDocument, widget: PDFDict, image: PDFImage, icon: PDFRef): PDFRef {
  const rect = pdf.context.lookup(widget.get(name('Rect')));
  const values = (rect instanceof PDFArray ? rect.asArray() : []).map((v) => {
    const n = pdf.context.lookup(v);
    return n instanceof PDFNumber ? n.asNumber() : 0;
  });
  const width = Math.abs((values[RIGHT] ?? 0) - (values[0] ?? 0));
  const height = Math.abs((values[TOP] ?? 0) - (values[1] ?? 0));
  const scale = Math.min(width / image.width, height / image.height) || 0;
  const x = (width - image.width * scale) / HALF;
  const y = (height - image.height * scale) / HALF;
  const ops = `q ${scale.toFixed(SCALE_DECIMALS)} 0 0 ${scale.toFixed(SCALE_DECIMALS)} ${num(x)} ${num(y)} cm /Icon Do Q`;
  return pdf.context.register(
    pdf.context.flateStream(ops, {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, Number(num(width)), Number(num(height))],
      Resources: { XObject: { Icon: icon } },
    }),
  );
}

/**
 * Writes each picture of the character onto every widget of its button. `widgetsOf` gives a field's
 * widget dictionaries by full name (the writer knows them after it rebuilt the form).
 */
export async function writeIcons(
  pdf: PDFDocument,
  images: SheetImages,
  widgetsOf: (field: string) => PDFDict[],
): Promise<void> {
  await Promise.all(
    IMAGE_SLOTS.map(async (slot) => {
      const src = images[slot]?.src;
      const kind = src ? SAFE_PICTURE.exec(src)?.[1] : undefined;
      const widgets = widgetsOf(PICTURE_FIELDS[slot]);
      if (!src || !kind || !widgets.length) return;
      const image = kind === 'png' ? await pdf.embedPng(src) : await pdf.embedJpg(src);
      // pdf-lib writes embedded images on save(); an incremental commit() needs them written now.
      await image.embed();
      const icon = iconForm(pdf, image);
      widgets.forEach((widget) => {
        const found = pdf.context.lookup(widget.get(name('MK')));
        const mk = found instanceof PDFDict ? found : (pdf.context.obj({}) as PDFDict);
        mk.set(name('I'), icon);
        widget.set(name('MK'), mk);
        widget.set(name('AP'), pdf.context.obj({ N: appearance(pdf, widget, image, icon) }));
      });
    }),
  );
}
