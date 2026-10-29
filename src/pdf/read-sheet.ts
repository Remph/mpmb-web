// Reads an MPMB sheet PDF (blank or filled) into the engine's SheetSnapshot: every form field with its
// type, flags, value, scripts and widgets, plus the calculation order, templates, bookmarks and the
// document info. The same reader makes the blank-sheet data that ships with the app and imports a
// player's filled PDF, so both sides of a comparison come from one code path.
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFRef,
  PDFString,
  decodePDFRawStream,
} from '@cantoo/pdf-lib';
import type { Bookmark, FieldDef, PdfFieldType, SheetSnapshot, Trigger, Widget } from '../engine/types.ts';
import { FF, TRIGGERS } from '../engine/types.ts';

/** Keys that a field inherits from its parents in the field tree (PDF 1.7, 12.7.3.1). */
const INHERITED = ['FT', 'Ff', 'V', 'DV', 'Opt', 'MaxLen'] as const;
type Inherited = Partial<Record<(typeof INHERITED)[number], PDFObject>>;

const RECT_DECIMALS = 100;
/** The byte order marks as two Latin-1 characters each. */
const UTF16_BE_BOM = '\u00fe\u00ff';
const UTF16_LE_BOM = '\u00ff\u00fe';
const BOM_LENGTH = UTF16_BE_BOM.length;
/** /Names arrays alternate key and value. */
const NAME_TREE_STEP = 2;

const name = (key: string): PDFName => PDFName.of(key);

/** Script streams are UTF-16 with a byte order mark in some PDFs and plain bytes in others. */
export function decodeScriptBytes(bytes: Uint8Array): string {
  const head = String.fromCharCode(...bytes.subarray(0, BOM_LENGTH));
  if (head === UTF16_BE_BOM) return new TextDecoder('utf-16be').decode(bytes.subarray(BOM_LENGTH));
  if (head === UTF16_LE_BOM) return new TextDecoder('utf-16le').decode(bytes.subarray(BOM_LENGTH));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

export async function readSheetPdf(bytes: Uint8Array | ArrayBuffer): Promise<SheetSnapshot> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
  const ctx = pdf.context;
  const look = (o: PDFObject | undefined): PDFObject | undefined => (o instanceof PDFRef ? ctx.lookup(o) : o);
  const dict = (o: PDFObject | undefined): PDFDict | undefined => {
    const d = look(o);
    return d instanceof PDFDict ? d : undefined;
  };
  const array = (o: PDFObject | undefined): PDFObject[] => {
    const a = look(o);
    return a instanceof PDFArray ? a.asArray() : [];
  };
  const text = (o: PDFObject | undefined): string | undefined => {
    const v = look(o);
    if (v instanceof PDFString || v instanceof PDFHexString) return v.decodeText();
    if (v instanceof PDFName) return v.decodeText();
    if (v instanceof PDFRawStream) return decodeScriptBytes(decodePDFRawStream(v).decode());
    return undefined;
  };
  const num = (o: PDFObject | undefined): number | undefined => {
    const v = look(o);
    return v instanceof PDFNumber ? v.asNumber() : undefined;
  };
  const script = (action: PDFObject | undefined): string | undefined => text(dict(action)?.get(name('JS')));

  // Widget annotation -> page index, for the pages that are part of the document. Widgets on
  // template pages (hidden pages under /Names /Templates) are not in this map and get page -1.
  const pageOfWidget = new Map<string, number>();
  pdf.getPages().forEach((page, i) => {
    array(page.node.get(name('Annots'))).forEach((a) => {
      if (a instanceof PDFRef) pageOfWidget.set(a.toString(), i);
    });
  });

  const fields: Record<string, FieldDef> = {};
  // Field or widget object -> field name, to resolve the calculation order (/CO points at either).
  const nameOfRef = new Map<string, string>();

  const valueOf = (o: PDFObject | undefined): string | string[] | undefined => {
    const v = look(o);
    if (v instanceof PDFArray) return v.asArray().map((x) => text(x) ?? '');
    return text(v);
  };

  const widgetOf = (ref: PDFObject): Widget => {
    const w = dict(ref);
    const rect = array(w?.get(name('Rect'))).map((x) => Math.round((num(x) ?? 0) * RECT_DECIMALS) / RECT_DECIMALS);
    const page = ref instanceof PDFRef ? (pageOfWidget.get(ref.toString()) ?? -1) : -1;
    return { page, rect, flags: num(w?.get(name('F'))) ?? 0 };
  };

  /** The name of a check box or radio widget's "on" appearance state (anything but Off). */
  const onStateOf = (w: PDFDict | undefined): string | undefined =>
    dict(dict(w?.get(name('AP')))?.get(name('N')))
      ?.keys()
      .map((k) => k.decodeText())
      .filter((s) => s !== 'Off')[0];

  const actionsOf = (holders: PDFDict[]): FieldDef['actions'] => {
    const acts: FieldDef['actions'] = {};
    // Actions can sit on the field or on its widgets (kids without a name).
    holders.forEach((h) => {
      const aa = dict(h.get(name('AA')));
      aa?.keys().forEach((k) => {
        const key = k.decodeText();
        const js = script(aa.get(k));
        if (js !== undefined && key in TRIGGERS) acts[key as Trigger] = js;
      });
      const mouseUp = script(h.get(name('A')));
      if (mouseUp !== undefined) acts.A = mouseUp;
    });
    return acts;
  };

  const optionsOf = (o: PDFObject | undefined): FieldDef['options'] =>
    array(o).map((item) => {
      const pair = array(item);
      return pair.length ? [text(pair[0]) ?? '', text(pair[1]) ?? ''] : (text(item) ?? '');
    });

  const walk = (ref: PDFObject, parent: string, inheritedFrom: Inherited): void => {
    const f = dict(ref);
    if (!f) return;
    const inherited: Inherited = { ...inheritedFrom };
    INHERITED.forEach((key) => {
      const v = f.get(name(key));
      if (v !== undefined) inherited[key] = v;
    });
    const partial = text(f.get(name('T')));
    const full = [parent, partial].filter((p) => p).join('.');
    const kids = array(f.get(name('Kids')));
    // Kids with a name are child fields; kids without one are this field's widgets.
    if (kids.some((k) => dict(k)?.has(name('T')))) {
      kids.forEach((k) => walk(k, full, inherited));
      return;
    }
    const widgetRefs = kids.length ? kids : [ref];
    const widgetDicts = widgetRefs.map(dict).filter((d): d is PDFDict => d !== undefined);
    const type = (text(inherited.FT) ?? 'Tx') as PdfFieldType;
    const def: FieldDef = {
      type,
      flags: num(inherited.Ff) ?? 0,
      actions: actionsOf([f, ...(kids.length ? widgetDicts : [])]),
      widgets: widgetRefs.map(widgetOf),
    };
    const value = valueOf(inherited.V);
    const defaultValue = valueOf(inherited.DV);
    if (value !== undefined) def.value = value;
    if (defaultValue !== undefined) def.defaultValue = defaultValue;
    const strings = { richValue: 'RV', userName: 'TU', submitName: 'TM' } as const;
    (Object.keys(strings) as (keyof typeof strings)[]).forEach((key) => {
      const s = text(f.get(name(strings[key])));
      if (s) def[key] = s;
    });
    const maxLen = num(inherited.MaxLen);
    if (maxLen !== undefined) def.maxLen = maxLen;
    if (type === 'Ch') def.options = optionsOf(inherited.Opt);
    if (type === 'Btn' && !(def.flags & FF.pushButton)) {
      def.widgets = def.widgets.map((w, i) => ({ ...w, on: onStateOf(widgetDicts[i]) ?? 'Yes' }));
    }
    fields[full] = def;
    [ref, ...kids].forEach((r) => {
      if (r instanceof PDFRef && !nameOfRef.has(r.toString())) nameOfRef.set(r.toString(), full);
    });
  };

  const acroForm = dict(pdf.catalog.get(name('AcroForm')));
  array(acroForm?.get(name('Fields'))).forEach((ref) => walk(ref, '', {}));

  const calcOrder = array(acroForm?.get(name('CO')))
    .map((r) => (r instanceof PDFRef ? nameOfRef.get(r.toString()) : undefined))
    .filter((n): n is string => n !== undefined);

  // Templates: name -> names of the fields whose widgets sit on the template's page.
  const templates: Record<string, string[]> = {};
  const fullName = (widget: PDFDict | undefined): string => {
    if (!widget) return '';
    const own = text(widget.get(name('T')));
    return [fullName(dict(widget.get(name('Parent')))), own].filter((p) => p).join('.');
  };
  const templateNames = array(dict(dict(pdf.catalog.get(name('Names')))?.get(name('Templates')))?.get(name('Names')));
  templateNames.forEach((entry, i) => {
    if (i % NAME_TREE_STEP) return;
    const page = dict(templateNames[i + 1]);
    const onPage = array(page?.get(name('Annots')))
      .map(dict)
      .filter((a) => text(a?.get(name('Subtype'))) === 'Widget')
      .map(fullName)
      .filter((n) => n !== '');
    templates[text(entry) ?? ''] = [...new Set(onPage)];
  });

  // Bookmarks: MPMB keeps references to its sheet bookmarks and edits the tree.
  const outlineOf = (item: PDFObject | undefined): Bookmark[] => {
    const d = dict(item);
    if (!d) return [];
    const here: Bookmark = { name: text(d.get(name('Title'))) ?? '', children: outlineOf(d.get(name('First'))) };
    const action = script(d.get(name('A')));
    if (action !== undefined) here.action = action;
    return [here, ...outlineOf(d.get(name('Next')))];
  };
  const outline = outlineOf(dict(pdf.catalog.get(name('Outlines')))?.get(name('First')));

  const info: Record<string, string> = {};
  const infoDict = dict(ctx.trailerInfo.Info);
  infoDict?.entries().forEach(([k, v]) => {
    const s = text(v);
    if (s !== undefined) info[k.decodeText()] = s;
  });

  return { fields, calcOrder, numPages: pdf.getPageCount(), templates, outline, info };
}
