// M1 spike (throwaway): read a filled Colorful A4 PDF in the browser with @cantoo/pdf-lib (an
// actively maintained fork of pdf-lib, MIT). Returns what the stand-in needs per field: value,
// submitName (/TM, where MPMB keeps data), tooltip (/TU), visibility flags and read-only.
import { PDFDocument, PDFName, PDFString, PDFHexString, PDFNumber } from '@cantoo/pdf-lib';

const text = (o) =>
  o instanceof PDFString || o instanceof PDFHexString || o instanceof PDFName ? o.decodeText() : null;

export async function readFilledPdf(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const fields = {};
  for (const f of doc.getForm().getFields()) {
    const dict = f.acroField.dict;
    const get = (key) => doc.context.lookup(f.acroField.getInheritableAttribute(PDFName.of(key)));
    const widget = f.acroField.getWidgets()[0]?.dict;
    const flags = widget?.lookup(PDFName.of('F')) instanceof PDFNumber ? widget.lookup(PDFName.of('F')).asNumber() : 4;
    let v = get('V');
    if (v instanceof PDFName) v = v.decodeText();
    else v = text(v);
    fields[f.getName()] = {
      v,
      tm: text(dict.lookup(PDFName.of('TM'))),
      tu: text(dict.lookup(PDFName.of('TU'))),
      disp: flags & 2 ? 1 : flags & 32 ? 3 : !(flags & 4) ? 2 : 0,
    };
  }
  const info = {};
  const infoDict = doc.context.lookup(doc.context.trailerInfo.Info);
  for (const [k, val] of infoDict?.entries() ?? []) info[k.decodeText()] = text(doc.context.lookup(val));
  return { fields, info };
}
