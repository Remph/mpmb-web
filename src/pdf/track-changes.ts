// pdf-lib's incremental update saves the objects that changed. To find which object a changed dictionary
// or array belongs to, it searches every object of the PDF, and for one inside another object it looks
// into all of them (PDFContext.registerObjectChange). On MPMB's sheet (over 50,000 objects) that makes
// each of the writer's tens of thousands of changes take milliseconds: minutes in all. This looks the
// owner up in a map made once instead.
import { PDFArray, PDFDict, PDFRawStream, PDFRef } from '@cantoo/pdf-lib';
import type { PDFDocument, PDFObject } from '@cantoo/pdf-lib';

/** The object the PDF stores (by reference) that holds each dictionary or array written inside it. */
function ownersOf(pdf: PDFDocument): WeakMap<PDFObject, PDFRef> {
  const owners = new WeakMap<PDFObject, PDFRef>();
  const visit = (obj: PDFObject, ref: PDFRef): void => {
    // A reference is another stored object, with its own owner; a dictionary seen before is shared.
    if (obj instanceof PDFRef || owners.has(obj)) return;
    if (obj instanceof PDFRawStream) {
      owners.set(obj, ref);
      visit(obj.dict, ref);
    } else if (obj instanceof PDFDict) {
      owners.set(obj, ref);
      obj.values().forEach((v) => visit(v, ref));
    } else if (obj instanceof PDFArray) {
      owners.set(obj, ref);
      obj.asArray().forEach((v) => visit(v, ref));
    }
  };
  pdf.context.enumerateIndirectObjects().forEach(([ref, obj]) => visit(obj, ref));
  return owners;
}

/**
 * Makes pdf-lib's change tracking fast for this document. Call after loading with
 * `forIncrementalUpdate` and before changing anything. Objects made later need no entry: new objects
 * are saved anyway, and putting a new dictionary into a stored one marks the stored one.
 */
export function trackChangesFast(pdf: PDFDocument): void {
  const ctx = pdf.context;
  const owners = ownersOf(pdf);
  ctx.registerObjectChange = (obj: PDFObject): void => {
    const ref = owners.get(obj);
    if (ref) ctx.snapshot?.markRefForSave(ref);
  };
}
