// Writes a character into an MPMB sheet PDF the player brings (M10): the reverse of read-sheet.ts. The
// app never ships MPMB's PDF; the player picks their own copy of the same sheet (Colorful A4 v24.2.0,
// blank is best), and this writes the open character into it so that it opens in Acrobat as if it had
// been filled there.
//
// What a character changes in the PDF, and how each part is written:
// - Field values, flags, tooltips (/TU), MPMB's data in /TM, choice lists (with the entry they mark as
//   chosen) and scripts: on the fields.
// - Pages: MPMB adds pages from templates (hidden pages under /Names /Templates) and deletes pages. A page
//   made with renaming carries fields named "P<page>.<template>.<name>"; one made without renaming shows
//   the template's own fields with one more widget. The writer works out, for each page of the character,
//   which page of the given PDF it is, or which template it is a new copy of, and rebuilds the page list.
// - The portrait and symbol: see write-icons.ts.
// - How the values look: see "Drawing the values" below. Text fields get no new appearance here; a script
//   that runs when Acrobat opens the PDF has Acrobat draw them, with MPMB's Format scripts.
//
// The update is appended to the PDF (an incremental update, the way Acrobat saves), so MPMB's own bytes
// stay as they are.
import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFString,
  decodePDFRawStream,
} from '@cantoo/pdf-lib';
import type { PDFContext, PDFObject } from '@cantoo/pdf-lib';
import type { FieldDef, SheetImages, SheetSnapshot, Trigger } from '../engine/types.ts';
import { FF } from '../engine/types.ts';
import { readSheetPdf } from './read-sheet.ts';
import { REDRAW_MARK, redrawScript } from './redraw-script.ts';
import { trackChangesFast } from './track-changes.ts';
import { writeIcons } from './write-icons.ts';

const name = (key: string): PDFName => PDFName.of(key);

/** "P6.SSfront.spells.name.0": made by spawning template SSfront with renaming, as page 6. */
// Try it: https://regex101.com/?regex=%5E(P%5Cd%2B%5C.(%5B%5E.%5D%2B)%5C.)(.%2B)%24&testString=P6.SSfront.spells.name.0
const SPAWNED = /^(P\d+\.([^.]+)\.)(.+)$/;

/** Keys a field inherits from its parents (PDF 1.7, 12.7.3.1), plus the text style ones it may. */
const FIELD_KEYS = ['FT', 'Ff', 'V', 'DV', 'Opt', 'MaxLen', 'DA', 'Q', 'TU', 'TM', 'RV', 'DS', 'TI', 'I'] as const;
/** Keys of a widget annotation; a field merged with its only widget has both kinds. */
const WIDGET_KEYS = [
  'Type',
  'Subtype',
  'Rect',
  'F',
  'P',
  'AP',
  'AS',
  'MK',
  'BS',
  'Border',
  'H',
  'A',
  'StructParent',
  'NM',
  'M',
  'C',
  'Contents',
  'OC',
] as const;
/** Field triggers sit on the field; the mouse and focus ones on each widget (PDF 1.7, 12.6.3). */
const FIELD_TRIGGERS: readonly Trigger[] = ['K', 'F', 'V', 'C'];
const WIDGET_TRIGGERS: readonly Trigger[] = ['D', 'E', 'X', 'Fo', 'Bl'];
/** /Names arrays alternate key and value. */
const NAME_TREE_STEP = 2;
/** A given page is the same page when it has at least half of the character page's own fields. */
const SAME_PAGE_SHARE = 2;
/** Page attributes a page takes from the page tree above it (PDF 1.7, 7.7.3.4). */
const PAGE_INHERITED = ['Resources', 'MediaBox', 'CropBox', 'Rotate'] as const;
/** read-sheet.ts rounds boxes to hundredths of a point. */
const RECT_DECIMALS = 100;
/** Deeper field trees than this are broken (a /Parent loop). */
const MAX_FIELD_DEPTH = 32;
/**
 * The longest string Acrobat promises to handle, in bytes (PDF Reference 1.7, appendix C, "Implementation
 * limits"). Longer texts go as streams. Acrobat itself saves the megabytes of add-on scripts MPMB keeps in
 * User_Imported_Files that way, and a value or script may be a text stream (PDF 1.7, 12.7.4.3 and 12.6.4.16).
 */
const MAX_STRING_BYTES = 32_767;
/** UTF-16 takes two bytes per code unit, after a two-byte byte order mark. */
const UTF16_UNIT_BYTES = 2;
const UTF16_BOM = [0xfe, 0xff] as const;
const BYTE = 0xff;
const BITS_PER_BYTE = 8;

/** The PDF the player brought isn't the sheet the character was made on. */
export class WrongSheetError extends Error {}

interface Field {
  ref: PDFRef;
  dict: PDFDict;
  /** The widget annotations, in the order read-sheet.ts reads them. */
  widgets: PDFRef[];
}

/**
 * The character `target` written into `bytes`, a PDF of the same MPMB sheet. `source` is `bytes` as
 * read-sheet.ts reads it; passed in when the caller has it already (reading a 27 MB sheet takes seconds).
 */
export async function writeSheetPdf(
  bytes: Uint8Array | ArrayBuffer,
  target: SheetSnapshot,
  source?: SheetSnapshot,
): Promise<Uint8Array> {
  const given = source ?? (await readSheetPdf(bytes));
  if (given.info.SheetType !== target.info.SheetType || given.info.SheetVersion !== target.info.SheetVersion) {
    throw new WrongSheetError(
      `The PDF is "${given.info.SheetType ?? '?'} v${given.info.SheetVersion ?? '?'}"; the character needs "${target.info.SheetType ?? '?'} v${target.info.SheetVersion ?? '?'}".`,
    );
  }
  const pdf = await PDFDocument.load(bytes, {
    updateMetadata: false,
    throwOnInvalidObject: false,
    forIncrementalUpdate: true,
  });
  trackChangesFast(pdf);
  new SheetWriter(pdf, given, target).write();
  await writeIcons(pdf, target.images ?? ({} as SheetImages), (field) => fieldWidgets(pdf, field));
  return pdf.commit();
}

/** The widget dictionaries of a field, by its full name: for the picture buttons. */
function fieldWidgets(pdf: PDFDocument, fullName: string): PDFDict[] {
  const found = walkFields(pdf.context, pdf.catalog).terminals.get(fullName);
  return found ? found.widgets.map((ref) => pdf.context.lookup(ref, PDFDict)) : [];
}

/** Every terminal field by full name, and the non-terminal ones (parents) by full name. */
function walkFields(
  ctx: PDFContext,
  catalog: PDFDict,
): { terminals: Map<string, Field>; parents: Map<string, { ref: PDFRef; dict: PDFDict }> } {
  const terminals = new Map<string, Field>();
  const parents = new Map<string, { ref: PDFRef; dict: PDFDict }>();
  const acroForm = lookDict(ctx, catalog.get(name('AcroForm')));
  const walk = (ref: PDFObject, parent: string): void => {
    if (!(ref instanceof PDFRef)) return;
    const dict = lookDict(ctx, ref);
    if (!dict) return;
    const partial = textOf(ctx, dict.get(name('T')));
    const full = [parent, partial].filter(Boolean).join('.');
    const kids = lookArray(ctx, dict.get(name('Kids')));
    if (kids.some((k) => lookDict(ctx, k)?.has(name('T')))) {
      parents.set(full, { ref, dict });
      kids.forEach((k) => walk(k, full));
      return;
    }
    const widgets = kids.length ? kids.filter((k): k is PDFRef => k instanceof PDFRef) : [ref];
    terminals.set(full, { ref, dict, widgets });
  };
  lookArray(ctx, acroForm?.get(name('Fields'))).forEach((ref) => walk(ref, ''));
  return { terminals, parents };
}

function lookDict(ctx: PDFContext, o: PDFObject | undefined): PDFDict | undefined {
  const v = o instanceof PDFRef ? ctx.lookup(o) : o;
  return v instanceof PDFDict ? v : undefined;
}

function lookArray(ctx: PDFContext, o: PDFObject | undefined): PDFObject[] {
  const v = o instanceof PDFRef ? ctx.lookup(o) : o;
  return v instanceof PDFArray ? v.asArray() : [];
}

function textOf(ctx: PDFContext, o: PDFObject | undefined): string | undefined {
  const v = o instanceof PDFRef ? ctx.lookup(o) : o;
  if (v instanceof PDFString || v instanceof PDFHexString || v instanceof PDFName) return v.decodeText();
  return undefined;
}

/**
 * A text for a value, rich value or script: a UTF-16 string as before, or a compressed text stream when that
 * string would be too long for Acrobat. A stream holds plain ASCII bytes when it can, as Acrobat writes it
 * (printable ASCII reads the same in PDFDocEncoding), and UTF-16 with a byte order mark otherwise.
 */
function textObject(ctx: PDFContext, text: string): PDFHexString | PDFRef {
  if (UTF16_UNIT_BYTES * (text.length + 1) <= MAX_STRING_BYTES) return PDFHexString.fromText(text);
  // Only the ASCII that PDFDocEncoding reads the same: it turns 0x18 to 0x1f into accents (breve, caron, ...),
  // and the other control characters and 0x7f mean nothing there.
  // Try it: https://regex101.com/?regex=%5E%5B%5Ct%5Cn%5Cr%5Cx20-%5Cx7e%5D%2A%24&testString=fire%20bolt
  const bytes = /^[\t\n\r\x20-\x7e]*$/.test(text) ? new TextEncoder().encode(text) : utf16Bytes(text);
  return ctx.register(ctx.flateStream(bytes));
}

/** `text` as UTF-16 big-endian with a byte order mark, the way PDF text strings and streams carry Unicode. */
function utf16Bytes(text: string): Uint8Array {
  const bytes = new Uint8Array(UTF16_UNIT_BYTES * (text.length + 1));
  bytes.set(UTF16_BOM);
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    bytes[UTF16_UNIT_BYTES * (i + 1)] = unit >> BITS_PER_BYTE;
    bytes[UTF16_UNIT_BYTES * (i + 1) + 1] = unit & BYTE;
  }
  return bytes;
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Where a page of the character comes from. */
type PageSource =
  | { kind: 'given'; page: number }
  | { kind: 'renamed'; template: string; prefix: string }
  | { kind: 'copy'; template: string };

class SheetWriter {
  private readonly ctx: PDFContext;
  private readonly terminals: Map<string, Field>;
  private readonly parents: Map<string, { ref: PDFRef; dict: PDFDict }>;
  private readonly acroForm: PDFDict;
  private readonly pageRefs: PDFRef[];
  /** Template name to its hidden page. */
  private readonly templatePages = new Map<string, { ref: PDFRef; dict: PDFDict }>();
  /** Annotation (widget) to the template page it sits on. */
  private readonly onTemplate = new Map<string, string>();
  /** Annotation to its page index in the given PDF. */
  private readonly pageOfAnnot = new Map<string, number>();

  private readonly pdf: PDFDocument;
  private readonly given: SheetSnapshot;
  private readonly target: SheetSnapshot;
  /**
   * The given PDF was filled by a version of this writer that set /NeedAppearances, so none of its values has
   * a drawing of its own: all filled fields need drawing, not only the ones this export changes. An empty field
   * keeps the drawing it has: MPMB's white boxes that cover parts of a page ("Whiteout") are empty text fields
   * that show only through it.
   */
  private readonly undrawn: boolean;
  /** The text fields whose value Acrobat must draw when it opens the PDF. */
  private readonly redraw: string[] = [];

  constructor(pdf: PDFDocument, given: SheetSnapshot, target: SheetSnapshot) {
    this.pdf = pdf;
    this.given = given;
    this.target = target;
    this.ctx = pdf.context;
    const walked = walkFields(this.ctx, pdf.catalog);
    this.terminals = walked.terminals;
    this.parents = walked.parents;
    const acroForm = lookDict(this.ctx, pdf.catalog.get(name('AcroForm')));
    if (!acroForm) throw new WrongSheetError('The PDF has no form.');
    this.acroForm = acroForm;
    this.undrawn = this.ctx.lookupMaybe(acroForm.get(name('NeedAppearances')), PDFBool)?.asBoolean() === true;
    this.pageRefs = pdf.getPages().map((page) => page.ref);
    this.pageRefs.forEach((ref, i) =>
      lookArray(this.ctx, this.ctx.lookup(ref, PDFDict).get(name('Annots'))).forEach((a) =>
        this.pageOfAnnot.set(a.toString(), i),
      ),
    );
    const names = lookArray(
      this.ctx,
      lookDict(this.ctx, lookDict(this.ctx, pdf.catalog.get(name('Names')))?.get(name('Templates')))?.get(
        name('Names'),
      ),
    );
    names.forEach((entry, i) => {
      if (i % NAME_TREE_STEP) return;
      const ref = names[i + 1];
      const dict = lookDict(this.ctx, ref);
      const template = textOf(this.ctx, entry);
      if (!(ref instanceof PDFRef) || !dict || template === undefined) return;
      this.templatePages.set(template, { ref, dict });
      lookArray(this.ctx, dict.get(name('Annots'))).forEach((a) => this.onTemplate.set(a.toString(), template));
    });
  }

  write(): void {
    const sources = this.pageSources();
    const pages = this.buildPages(sources);
    this.writeFields(sources, pages);
    this.writePageTree(pages);
    this.writeCalcOrder();
    this.writeInfo();
    this.writeRedraw();
  }

  // ---- Pages ----

  /** For each page of the character: the page of the given PDF it is, or the template it is new from. */
  private pageSources(): PageSource[] {
    const keysOn = (sheet: SheetSnapshot): { prefixes: Set<string>; originals: Set<string> }[] => {
      const pages = Array.from({ length: sheet.numPages }, () => ({
        prefixes: new Set<string>(),
        originals: new Set<string>(),
      }));
      Object.entries(sheet.fields).forEach(([field, def]) =>
        def.widgets.forEach((w) => {
          const page = pages[w.page];
          if (!page) return;
          const spawned = SPAWNED.exec(field);
          if (spawned?.[1]) page.prefixes.add(spawned[1]);
          else page.originals.add(field);
        }),
      );
      return pages;
    };
    const givenPages = keysOn(this.given);
    const used = new Set<number>();
    return keysOn(this.target).map((page, i): PageSource => {
      const prefix = [...page.prefixes][0];
      if (prefix) {
        const at = givenPages.findIndex((g, j) => !used.has(j) && g.prefixes.has(prefix));
        if (at >= 0) {
          used.add(at);
          return { kind: 'given', page: at };
        }
        // "P6.SSfront.": the template is the middle part.
        const template = prefix.split('.')[1] ?? '';
        if (!this.templatePages.has(template)) throw new Error(`Page ${i + 1}: no template "${template}"`);
        return { kind: 'renamed', template, prefix };
      }
      // A page with the sheet's own fields: the given page with the most of them in common, else a new
      // copy of the template that has the most.
      const overlap = (fields: Iterable<string>): number => [...fields].filter((f) => page.originals.has(f)).length;
      const best = givenPages
        .map((g, j) => ({ j, n: used.has(j) ? -1 : overlap(g.originals) }))
        .reduce((a, b) => (b.n > a.n ? b : a), { j: -1, n: 0 });
      if (best.j >= 0 && best.n * SAME_PAGE_SHARE >= page.originals.size) {
        used.add(best.j);
        return { kind: 'given', page: best.j };
      }
      const template = Object.entries(this.given.templates)
        .map(([t, fields]) => ({ t, n: overlap(fields) }))
        .reduce((a, b) => (b.n > a.n ? b : a), { t: '', n: 0 }).t;
      if (!template || !this.templatePages.has(template)) throw new Error(`Page ${i + 1}: no page or template fits`);
      return { kind: 'copy', template };
    });
  }

  /** The page objects: given pages as they are, new pages as copies of their template page. */
  private buildPages(sources: PageSource[]): { ref: PDFRef; dict: PDFDict }[] {
    return sources.map((source) => {
      if (source.kind === 'given') {
        const ref = this.pageRefs[source.page];
        if (!ref) throw new Error(`No page ${source.page + 1}`);
        return { ref, dict: this.ctx.lookup(ref, PDFDict) };
      }
      const template = this.templatePages.get(source.template);
      if (!template) throw new Error(`No template "${source.template}"`);
      const dict = this.ctx.obj({}) as PDFDict;
      template.dict.entries().forEach(([key, value]) => {
        if (key !== name('Annots') && key !== name('Parent') && key !== name('TemplateInstantiated'))
          dict.set(key, value);
      });
      // A template page is /Type /Template; spawned, it is a page like the others, and names the template
      // it came from (PDF 1.7, 12.7.6; Acrobat writes it on every page it spawns).
      dict.set(name('Type'), name('Page'));
      dict.set(name('TemplateInstantiated'), name(source.template));
      dict.set(name('Annots'), this.ctx.obj([]));
      return { ref: this.ctx.register(dict), dict };
    });
  }

  private writePageTree(pages: { ref: PDFRef; dict: PDFDict }[]): void {
    const root = this.pdf.catalog.Pages();
    const rootRef = this.pdf.catalog.get(name('Pages'));
    pages.forEach((page) => {
      // The page list becomes flat; what a page took from the page tree nodes above it, it now holds.
      PAGE_INHERITED.forEach((key) => {
        const v = this.inherited(page.dict, key);
        if (v !== undefined && !page.dict.has(name(key))) page.dict.set(name(key), v);
      });
      if (rootRef) page.dict.set(name('Parent'), rootRef);
    });
    root.set(name('Kids'), this.ctx.obj(pages.map((page) => page.ref)));
    root.set(name('Count'), PDFNumber.of(pages.length));
  }

  // ---- Fields ----

  private writeFields(sources: PageSource[], pages: { ref: PDFRef; dict: PDFDict }[]): void {
    // The widgets each page gets, in the order of the given page or the template page.
    const annots = pages.map((page, i) => {
      const source = sources[i];
      return source?.kind === 'given'
        ? lookArray(this.ctx, page.dict.get(name('Annots'))).filter((a) => !(a instanceof PDFRef) || !this.isWidget(a))
        : [];
    });
    const placed = pages.map(() => new Map<string, PDFRef>());

    // Fields the character no longer has: out of the form.
    Object.keys(this.given.fields)
      .filter((field) => !(field in this.target.fields))
      .forEach((field) => this.removeField(field));

    Object.entries(this.target.fields).forEach(([field, def]) => {
      const existing = this.terminals.get(field);
      const spawned = SPAWNED.exec(field);
      if (!existing && !spawned) return; // not a field MPMB can make; nothing to write it on
      const entry = existing ?? this.newSpawnedField(field, spawned?.[3] ?? '');
      if (!entry) return;
      const givenDef = this.given.fields[field];
      const widgets = def.widgets.map((w, k) => this.widgetFor(field, entry, w.page, k, sources, pages));
      this.setWidgets(
        entry,
        widgets.map((w) => w.ref),
      );
      widgets.forEach((w, k) => {
        const page = def.widgets[k]?.page ?? -1;
        if (page >= 0) placed[page]?.set(w.ref.toString(), w.ref);
      });
      this.writeField(field, entry, def, givenDef);
    });

    // Each page's widgets: the given page's order first, then new ones in the template page's order.
    pages.forEach((page, i) => {
      const source = sources[i];
      const mine = placed[i] ?? new Map<string, PDFRef>();
      const order =
        source?.kind === 'given'
          ? lookArray(this.ctx, page.dict.get(name('Annots')))
          : lookArray(this.ctx, this.templatePages.get(source?.template ?? '')?.dict.get(name('Annots')));
      const known = order.filter((a) => mine.has(a.toString()));
      const rest = [...mine.values()].filter((ref) => !known.some((a) => a.toString() === ref.toString()));
      const all = [...(annots[i] ?? []), ...known, ...this.sortLikeTemplate(rest, source)];
      page.dict.set(name('Annots'), this.ctx.obj(all));
      all.forEach((a) => {
        const d = lookDict(this.ctx, a);
        if (d && this.isWidgetDict(d)) d.set(name('P'), page.ref);
      });
    });
  }

  /** New widgets copied from a template, in the order of the template page's widgets they copy. */
  private sortLikeTemplate(refs: PDFRef[], source: PageSource | undefined): PDFRef[] {
    if (!source || source.kind === 'given') return refs;
    const order = lookArray(this.ctx, this.templatePages.get(source.template)?.dict.get(name('Annots'))).map((a) =>
      a.toString(),
    );
    const at = (ref: PDFRef): number => {
      const from = this.copiedFrom.get(ref.toString());
      const i = from ? order.indexOf(from) : -1;
      return i < 0 ? order.length : i;
    };
    return [...refs].sort((a, b) => at(a) - at(b));
  }

  /** New widget -> the template widget it copies, to keep the template page's order. */
  private readonly copiedFrom = new Map<string, string>();

  private isWidget(ref: PDFRef): boolean {
    const d = lookDict(this.ctx, ref);
    return d !== undefined && this.isWidgetDict(d);
  }

  private isWidgetDict(d: PDFDict): boolean {
    return d.get(name('Subtype')) === name('Widget');
  }

  /**
   * The widget for the character's widget `k` of a field: the given one on the same page, or a new copy
   * of the field's widget on the template page.
   */
  private widgetFor(
    field: string,
    entry: Field,
    page: number,
    k: number,
    sources: PageSource[],
    pages: { ref: PDFRef; dict: PDFDict }[],
  ): { ref: PDFRef } {
    const givenWidgets = entry.widgets;
    // The how-manieth widget of the field on this page (or on template pages) it is: a field can have
    // several on one page (MPMB's decorations) and on several templates.
    const nth = this.target.fields[field]?.widgets.slice(0, k).filter((w) => w.page === page).length ?? 0;
    if (page < 0) {
      // A widget on no page: on a template page, or left over from a page MPMB deleted. It stays as it is.
      const own = givenWidgets.filter((ref) => !this.pageOfAnnot.has(ref.toString()))[nth];
      if (!own) throw new Error(`${field}: no widget ${k + 1} off the pages`);
      return { ref: own };
    }
    const source = sources[page];
    if (source?.kind === 'given') {
      const found = givenWidgets.filter((ref) => this.pageOfAnnot.get(ref.toString()) === source.page)[nth];
      if (found) return { ref: found };
    }
    // A new copy of the template's widget for this field: the nth of its widgets on the page of the template
    // the page comes from. A field can have widgets on several templates, at other places (spell rows sit
    // on SSfront and SSmore), and several on one.
    const original = SPAWNED.exec(field)?.[3] ?? field;
    const template = this.terminals.get(original);
    const from = source?.kind === 'given' ? undefined : source?.template;
    const onTemplates = template?.widgets.filter((ref) => this.onTemplate.has(ref.toString())) ?? [];
    const onFrom = onTemplates.filter((ref) => this.onTemplate.get(ref.toString()) === from);
    const templateWidget = onFrom[nth] ?? onFrom[0] ?? onTemplates[0] ?? template?.widgets[0];
    if (!templateWidget) throw new Error(`${field}: nothing to copy its widget from`);
    const copy = this.copyWidget(templateWidget, pages[page]?.ref);
    this.copiedFrom.set(copy.toString(), templateWidget.toString());
    return { ref: copy };
  }

  private copyWidget(from: PDFRef, page: PDFRef | undefined): PDFRef {
    const src = this.ctx.lookup(from, PDFDict);
    const dict = this.ctx.obj({}) as PDFDict;
    WIDGET_KEYS.forEach((key) => {
      const v = src.get(name(key));
      if (v !== undefined) dict.set(name(key), v instanceof PDFDict ? (v.clone(this.ctx) as PDFDict) : v);
    });
    // A merged field's widget may carry its own widget triggers in /AA.
    const aa = lookDict(this.ctx, src.get(name('AA')));
    if (aa) {
      const widgetAa = this.ctx.obj({}) as PDFDict;
      WIDGET_TRIGGERS.forEach((t) => {
        const v = aa.get(name(t));
        if (v !== undefined) widgetAa.set(name(t), v);
      });
      if (widgetAa.keys().length) dict.set(name('AA'), widgetAa);
    }
    const da = src.get(name('DA'));
    if (da !== undefined) dict.set(name('DA'), da);
    if (page) dict.set(name('P'), page);
    return this.ctx.register(dict);
  }

  /**
   * A field made by spawning a template with renaming: a copy of the template field (its inherited keys
   * resolved) under "P<page>" > "<template>" > the original's own parents.
   */
  private newSpawnedField(field: string, original: string): Field | undefined {
    const template = this.terminals.get(original);
    if (!template) return undefined;
    const dict = this.ctx.obj({}) as PDFDict;
    FIELD_KEYS.forEach((key) => {
      const v = this.inherited(template.dict, key);
      if (v !== undefined) dict.set(name(key), v);
    });
    const aa = lookDict(this.ctx, template.dict.get(name('AA')));
    if (aa) dict.set(name('AA'), aa.clone(this.ctx));
    const parts = field.split('.');
    dict.set(name('T'), PDFHexString.fromText(parts[parts.length - 1] ?? ''));
    const ref = this.ctx.register(dict);
    this.attach(ref, dict, parts.slice(0, -1));
    const entry: Field = { ref, dict, widgets: [] };
    this.terminals.set(field, entry);
    return entry;
  }

  /** A key of a field (or a page), from it or the nearest parent in its tree that has it. */
  private inherited(dict: PDFDict | undefined, key: string, depth = 0): PDFObject | undefined {
    if (!dict || depth > MAX_FIELD_DEPTH) return undefined;
    return dict.get(name(key)) ?? this.inherited(lookDict(this.ctx, dict.get(name('Parent'))), key, depth + 1);
  }

  /** Hangs a field under its parents, making the parents that don't exist yet. */
  private attach(ref: PDFRef, dict: PDFDict, parentPath: string[]): void {
    if (!parentPath.length) {
      this.kidsOf(this.acroForm, 'Fields').push(ref);
      return;
    }
    const full = parentPath.join('.');
    let parent = this.parents.get(full);
    if (!parent) {
      const pdict = this.ctx.obj({}) as PDFDict;
      pdict.set(name('T'), PDFHexString.fromText(parentPath[parentPath.length - 1] ?? ''));
      pdict.set(name('Kids'), this.ctx.obj([]));
      const pref = this.ctx.register(pdict);
      this.attach(pref, pdict, parentPath.slice(0, -1));
      parent = { ref: pref, dict: pdict };
      this.parents.set(full, parent);
    }
    dict.set(name('Parent'), parent.ref);
    this.kidsOf(parent.dict, 'Kids').push(ref);
  }

  private kidsOf(dict: PDFDict, key: 'Kids' | 'Fields'): PDFArray {
    const found = dict.get(name(key));
    const arr = found instanceof PDFRef ? this.ctx.lookup(found) : found;
    if (arr instanceof PDFArray) return arr;
    const made = this.ctx.obj([]);
    dict.set(name(key), made);
    return made;
  }

  /**
   * Gives a field exactly these widgets. A field merged with its widget (one dictionary for both) stays
   * merged when that widget is all it keeps; otherwise the widget part moves into a dictionary of its own.
   */
  private setWidgets(entry: Field, wanted: PDFRef[]): void {
    const self = entry.ref.toString();
    const merged = entry.widgets.length === 1 && entry.widgets[0]?.toString() === self;
    if (merged && wanted.length === 1 && wanted[0]?.toString() === self) return;
    const own = merged ? this.splitMerged(entry) : undefined;
    const widgets = own ? wanted.map((w) => (w.toString() === self ? own : w)) : wanted;
    widgets.forEach((w) => this.ctx.lookup(w, PDFDict).set(name('Parent'), entry.ref));
    if (widgets.length) entry.dict.set(name('Kids'), this.ctx.obj(widgets));
    else entry.dict.delete(name('Kids'));
    entry.widgets = widgets;
  }

  /** Moves the widget keys of a merged field into a new widget, which takes its place on its page. */
  private splitMerged(entry: Field): PDFRef {
    const widget = this.ctx.obj({}) as PDFDict;
    WIDGET_KEYS.forEach((key) => {
      const v = entry.dict.get(name(key));
      if (v === undefined) return;
      widget.set(name(key), v);
      entry.dict.delete(name(key));
    });
    const aa = lookDict(this.ctx, entry.dict.get(name('AA')));
    if (aa) {
      const widgetAa = this.ctx.obj({}) as PDFDict;
      WIDGET_TRIGGERS.forEach((t) => {
        const v = aa.get(name(t));
        if (v === undefined) return;
        widgetAa.set(name(t), v);
        aa.delete(name(t));
      });
      if (widgetAa.keys().length) widget.set(name('AA'), widgetAa);
    }
    const da = entry.dict.get(name('DA'));
    if (da !== undefined) widget.set(name('DA'), da);
    const ref = this.ctx.register(widget);
    // The page (or template page) that showed the merged field shows the new widget instead.
    const key = entry.ref.toString();
    const holders = [
      ...this.pageRefs.map((r) => this.ctx.lookup(r, PDFDict)),
      ...[...this.templatePages.values()].map((t) => t.dict),
    ];
    holders.forEach((page) => {
      const list = lookArray(this.ctx, page.get(name('Annots')));
      if (list.some((a) => a.toString() === key))
        page.set(name('Annots'), this.ctx.obj(list.map((a) => (a.toString() === key ? ref : a))));
    });
    if (this.onTemplate.has(key)) this.onTemplate.set(ref.toString(), this.onTemplate.get(key) ?? '');
    const page = this.pageOfAnnot.get(key);
    if (page !== undefined) this.pageOfAnnot.set(ref.toString(), page);
    return ref;
  }

  private removeField(field: string): void {
    const entry = this.terminals.get(field);
    if (!entry) return;
    this.unhang(entry.ref, entry.dict);
    this.terminals.delete(field);
  }

  /**
   * Takes a field out of its parent's kids, and a parent that has no kids left out of its own: an empty
   * "P6.SSfront" would read as a field of its own.
   */
  private unhang(ref: PDFRef, dict: PDFDict): void {
    const parentRef = dict.get(name('Parent'));
    const parent = parentRef instanceof PDFRef ? this.ctx.lookup(parentRef, PDFDict) : undefined;
    const kids = this.kidsOf(parent ?? this.acroForm, parent ? 'Kids' : 'Fields');
    const at = kids.asArray().findIndex((k) => k.toString() === ref.toString());
    if (at >= 0) kids.remove(at);
    if (!parent || !(parentRef instanceof PDFRef) || kids.size()) return;
    [...this.parents].filter(([, p]) => p.ref === parentRef).forEach(([full]) => this.parents.delete(full));
    this.unhang(parentRef, parent);
  }

  /** The field's value, flags, texts, list and scripts, and each widget's flags, box and on/off state. */
  private writeField(field: string, entry: Field, def: FieldDef, givenDef: FieldDef | undefined): void {
    const d = entry.dict;
    const changed = <K extends keyof FieldDef>(key: K): boolean => !givenDef || !sameJson(givenDef[key], def[key]);
    if (changed('flags')) d.set(name('Ff'), PDFNumber.of(def.flags));
    if (changed('value')) this.setValue(d, def);
    const filled = Array.isArray(def.value) ? def.value.length > 0 : Boolean(def.value);
    const stale = changed('value') || (this.undrawn && filled);
    if ((def.type === 'Tx' || def.type === 'Ch') && stale) this.undraw(field, entry, def);
    const strings = { richValue: 'RV', userName: 'TU', submitName: 'TM' } as const;
    (Object.keys(strings) as (keyof typeof strings)[]).forEach((key) => {
      if (!changed(key)) return;
      const v = def[key];
      // A rich value may be a stream; a tooltip and MPMB's /TM data must be strings (PDF 1.7, 12.7.3.1).
      if (v) d.set(name(strings[key]), key === 'richValue' ? textObject(this.ctx, v) : PDFHexString.fromText(v));
      else d.delete(name(strings[key]));
    });
    if (changed('maxLen')) {
      if (def.maxLen === undefined) d.delete(name('MaxLen'));
      else d.set(name('MaxLen'), PDFNumber.of(def.maxLen));
    }
    if (def.type === 'Ch' && changed('options')) {
      d.set(
        name('Opt'),
        this.ctx.obj(
          (def.options ?? []).map((o) =>
            typeof o === 'string'
              ? PDFHexString.fromText(o)
              : this.ctx.obj([PDFHexString.fromText(o[0]), PDFHexString.fromText(o[1])]),
          ),
        ),
      );
    }
    // Checked on every drop-down, not only changed ones: a PDF filled by an older version of this writer
    // may still mark another entry than its value.
    if (def.type === 'Ch') this.setChosen(d, def);
    if (changed('actions')) this.setActions(entry, def);
    def.widgets.forEach((w, k) => {
      const ref = entry.widgets[k];
      if (!ref) return;
      const wd = this.ctx.lookup(ref, PDFDict);
      // Against the widget itself: the given field's widget k may be another one than the character's.
      const flags = this.ctx.lookupMaybe(wd.get(name('F')), PDFNumber)?.asNumber() ?? 0;
      if (flags !== w.flags) wd.set(name('F'), PDFNumber.of(w.flags));
      const rect = lookArray(this.ctx, wd.get(name('Rect'))).map(
        (n) => Math.round((this.ctx.lookupMaybe(n, PDFNumber)?.asNumber() ?? 0) * RECT_DECIMALS) / RECT_DECIMALS,
      );
      if (!sameJson(rect, w.rect)) wd.set(name('Rect'), this.ctx.obj(w.rect));
      if (def.type === 'Btn' && !(def.flags & FF.pushButton)) {
        const on = w.on ?? 'Yes';
        wd.set(name('AS'), name(def.value === on ? on : 'Off'));
      }
    });
  }

  /**
   * Drops the drawing (/AP) of a text field or drop-down whose value changed: it shows the old value. A text
   * field with a value goes on the list for the script that has Acrobat draw it; Acrobat draws drop-downs
   * without help.
   */
  private undraw(field: string, entry: Field, def: FieldDef): void {
    entry.widgets.forEach((ref) => this.ctx.lookup(ref, PDFDict).delete(name('AP')));
    if (def.type === 'Tx' && typeof def.value === 'string' && def.value !== '') this.redraw.push(field);
  }

  private setValue(d: PDFDict, def: FieldDef): void {
    const v = def.value;
    if (v === undefined || (def.type === 'Btn' && v === '')) {
      d.delete(name('V'));
      return;
    }
    if (def.type === 'Btn') d.set(name('V'), name(Array.isArray(v) ? (v[0] ?? 'Off') : v));
    else if (Array.isArray(v)) d.set(name('V'), this.ctx.obj(v.map((s) => PDFHexString.fromText(s))));
    // Only a text field's value may be a stream; a drop-down's must be a string (PDF 1.7, 12.7.4.4).
    else d.set(name('V'), def.type === 'Tx' ? textObject(this.ctx, v) : PDFHexString.fromText(v));
  }

  /**
   * The entries a drop-down or list marks as chosen (/I), to agree with its value. Viewers other than
   * Acrobat (Firefox's among them) show the marked entry, not the value, so a stale mark shows the blank
   * sheet's empty first entry. A typed value that is no entry marks none, as Acrobat saves it.
   */
  private setChosen(d: PDFDict, def: FieldDef): void {
    const entries = (def.options ?? []).map((o) => (typeof o === 'string' ? o : o[0]));
    const values = def.value === undefined ? [] : Array.isArray(def.value) ? def.value : [def.value];
    const at = values.map((v) => entries.indexOf(v)).sort((a, b) => a - b);
    const want = values.length && at.every((i) => i >= 0) ? at : undefined;
    const has = lookArray(this.ctx, d.get(name('I'))).map((n) => this.ctx.lookupMaybe(n, PDFNumber)?.asNumber());
    if (want && sameJson(has, want)) return;
    if (!want && !d.has(name('I'))) return;
    if (want) d.set(name('I'), this.ctx.obj(want));
    else d.delete(name('I'));
  }

  /** Field triggers on the field, mouse and focus triggers and the click (/A) on each widget. */
  private setActions(entry: Field, def: FieldDef): void {
    const js = (code: string): PDFDict => this.ctx.obj({ S: 'JavaScript', JS: textObject(this.ctx, code) }) as PDFDict;
    const fieldAa = this.ctx.obj({}) as PDFDict;
    FIELD_TRIGGERS.forEach((t) => {
      const code = def.actions[t];
      if (code !== undefined) fieldAa.set(name(t), js(code));
    });
    const merged = entry.widgets.some((w) => w.toString() === entry.ref.toString());
    const widgetAa = (): PDFDict => {
      const aa = merged ? fieldAa : (this.ctx.obj({}) as PDFDict);
      WIDGET_TRIGGERS.forEach((t) => {
        const code = def.actions[t];
        if (code !== undefined) aa.set(name(t), js(code));
      });
      return aa;
    };
    entry.widgets.forEach((ref) => {
      const wd = this.ctx.lookup(ref, PDFDict);
      const aa = widgetAa();
      if (aa.keys().length) wd.set(name('AA'), aa);
      else wd.delete(name('AA'));
      if (def.actions.A !== undefined) wd.set(name('A'), js(def.actions.A));
      else wd.delete(name('A'));
    });
    if (!merged) {
      if (fieldAa.keys().length) entry.dict.set(name('AA'), fieldAa);
      else entry.dict.delete(name('AA'));
    }
  }

  // ---- The rest of the form and the document ----

  private writeCalcOrder(): void {
    if (sameJson(this.given.calcOrder, this.target.calcOrder)) return;
    const refs = this.target.calcOrder
      .map((field) => this.terminals.get(field)?.ref)
      .filter((r): r is PDFRef => r !== undefined);
    this.acroForm.set(name('CO'), this.ctx.obj(refs));
  }

  private writeInfo(): void {
    const changed = Object.entries(this.target.info).filter(([k, v]) => this.given.info[k] !== v);
    if (!changed.length) return;
    const infoRef = this.ctx.trailerInfo.Info;
    const info = lookDict(this.ctx, infoRef);
    if (!info) return;
    changed.forEach(([k, v]) => info.set(name(k), PDFHexString.fromText(v)));
  }

  // ---- Drawing the values ----
  //
  // Each field shows a drawing of its value (its appearance, /AP), which the program that sets the value
  // makes. Acrobat makes it with the field's Format script (MPMB's "+2", "64,000"). This writer can't run
  // those, and /NeedAppearances, which asks the viewer to draw every field when the PDF opens, breaks MPMB in
  // Acrobat: its scripts then can't find the fields on hidden template pages ("SaveIMG.Patreon", checked by
  // Remph in Acrobat on 2026-11-09). So a script that runs when the PDF opens sets each filled text field to
  // its own value, and Acrobat draws it as if typed in. It runs once: the stamp it leaves in the document
  // info stops it the next time, also after Acrobat saved the PDF.

  private writeRedraw(): void {
    this.acroForm.delete(name('NeedAppearances'));
    if (!this.redraw.length) return;
    const ours = (action: PDFObject | undefined): boolean => {
      const js = lookDict(this.ctx, action)?.get(name('JS'));
      const code = js instanceof PDFRef ? this.ctx.lookup(js) : js;
      const text =
        code instanceof PDFRawStream
          ? new TextDecoder().decode(decodePDFRawStream(code).decode())
          : textOf(this.ctx, code);
      return text?.startsWith(REDRAW_MARK) ?? false;
    };
    const before = this.pdf.catalog.get(name('OpenAction'));
    const action = this.ctx.obj({
      S: 'JavaScript',
      JS: textObject(this.ctx, redrawScript(this.redraw, crypto.randomUUID())),
    });
    // Another opening action (a page to show, a script) still runs after ours. Ours from an earlier export goes,
    // and what ran after it runs after the new one.
    const next = before && ours(before) ? lookDict(this.ctx, before)?.get(name('Next')) : before;
    if (next) action.set(name('Next'), lookDict(this.ctx, next) ? next : this.ctx.obj({ S: 'GoTo', D: next }));
    this.pdf.catalog.set(name('OpenAction'), this.ctx.register(action));
  }
}
