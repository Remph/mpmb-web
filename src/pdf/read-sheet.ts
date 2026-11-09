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
  pdfDocEncodingDecode,
} from '@cantoo/pdf-lib';
import type { Bookmark, FieldDef, PdfFieldType, SheetImages, SheetSnapshot, Trigger, Widget } from '../engine/types.ts';
import { FF, IMAGE_SLOTS, TRIGGERS } from '../engine/types.ts';
import { PICTURE_FIELDS, dataUrl, iconImage } from './icons.ts';

/** Keys that a field inherits from its parents in the field tree (PDF 1.7, 12.7.3.1). */
const INHERITED = ['FT', 'Ff', 'V', 'DV', 'Opt', 'MaxLen'] as const;
type Inherited = Partial<Record<(typeof INHERITED)[number], PDFObject>>;

const RECT_DECIMALS = 100;
/** The byte order marks as two Latin-1 characters each. */
const UTF16_BE_BOM = '\u00fe\u00ff';
const UTF16_LE_BOM = '\u00ff\u00fe';
const BOM_LENGTH = UTF16_BE_BOM.length;
/** UTF-8's byte order mark, which PDF 2.0 allows on text strings (7.9.2.2). */
const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;
/**
 * Bytes per call to pdf-lib's PDFDocEncoding decoder. It spreads every character into one function call,
 * and JavaScript engines refuse calls with a few hundred thousand arguments or fewer.
 */
const DECODE_CHUNK = 8192;
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

/**
 * A PDF text string's bytes as text (PDF 2.0, 7.9.2.2): UTF-16 or UTF-8 after a byte order mark, else
 * PDFDocEncoding. pdf-lib's own decodeText() does the same but overflows the call stack on long values,
 * such as the megabytes of add-on scripts MPMB keeps in one field.
 */
export function decodePdfText(bytes: Uint8Array): string {
  const head = String.fromCharCode(...bytes.subarray(0, BOM_LENGTH));
  if (head === UTF16_BE_BOM) return new TextDecoder('utf-16be').decode(bytes.subarray(BOM_LENGTH));
  if (head === UTF16_LE_BOM) return new TextDecoder('utf-16le').decode(bytes.subarray(BOM_LENGTH));
  if (UTF8_BOM.every((b, i) => bytes[i] === b)) return new TextDecoder('utf-8').decode(bytes.subarray(UTF8_BOM.length));
  const parts: string[] = [];
  for (let at = 0; at < bytes.length; at += DECODE_CHUNK) {
    parts.push(pdfDocEncodingDecode(bytes.subarray(at, at + DECODE_CHUNK)));
  }
  return parts.join('');
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
    if (v instanceof PDFString || v instanceof PDFHexString) return decodePdfText(v.asBytes());
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

  // Widget annotation -> the template whose hidden page it sits on. A field can have widgets on several
  // templates (MPMB's spell sheet rows are on both SSfront and SSmore, at other places), and spawning a
  // template copies the widgets of that template only.
  const templateOfWidget = new Map<string, string>();
  const templateNames = array(dict(dict(pdf.catalog.get(name('Names')))?.get(name('Templates')))?.get(name('Names')));
  templateNames.forEach((entry, i) => {
    if (i % NAME_TREE_STEP) return;
    const template = text(entry);
    if (template === undefined) return;
    array(dict(templateNames[i + 1])?.get(name('Annots'))).forEach((a) => {
      if (a instanceof PDFRef && !pageOfWidget.has(a.toString())) templateOfWidget.set(a.toString(), template);
    });
  });

  const fields: Record<string, FieldDef> = {};
  /** The widgets of the picture buttons (portrait, symbol), to read their icons after the walk. */
  const pictureWidgets = new Map<string, PDFDict[]>();
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
    const widget: Widget = { page, rect, flags: num(w?.get(name('F'))) ?? 0 };
    const template = page < 0 && ref instanceof PDFRef ? templateOfWidget.get(ref.toString()) : undefined;
    if (template !== undefined) widget.template = template;
    return widget;
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
    if (Object.values(PICTURE_FIELDS).includes(full)) pictureWidgets.set(full, widgetDicts);
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

  // The first widget whose icon is an image; the others show the same picture or MPMB's placeholder.
  const images: SheetImages = {};
  await IMAGE_SLOTS.reduce(async (previous, slot) => {
    await previous;
    const widgets = pictureWidgets.get(PICTURE_FIELDS[slot]) ?? [];
    const found = await widgets.reduce<Promise<Awaited<ReturnType<typeof iconImage>>>>(
      async (before, widget) => (await before) ?? iconImage(ctx, widget),
      Promise.resolve(null),
    );
    if (found) {
      const src = dataUrl(found.type, found.bytes);
      images[slot] = { src, thumb: src };
    }
  }, Promise.resolve());

  const sheet: SheetSnapshot = { fields, calcOrder, numPages: pdf.getPageCount(), templates, outline, info };
  if (Object.keys(images).length) sheet.images = images;
  return sheet;
}
