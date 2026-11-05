// The engine: MPMB's document scripts running on a stand-in for Acrobat's JavaScript API.
//
// `Engine.load` puts the API onto the realm's global object (in Acrobat the document is the global
// object: `var tDoc = this;` in Functions0.js), adds `toSource`, then runs MPMB's 27 scripts in
// Acrobat's order. The last line of Startup.js calls InitializeEverything(), so a loaded engine is a
// sheet that has just been opened. The UI (and the tests) then act like a user: edit fields, click
// buttons and bookmarks, answer pop-ups.
//
// Not modelled (counted in `stats.missing` when a script asks for it): printing, XFDF and FDF import
// and export, attachments, making templates, icons from files.
//
// In the browser the scripts' realm is the worker's own global scope, so what MPMB changes there
// changes it for this code too. MPMB replaces the find method of arrays (theirs returns an index), so the
// engine never calls find(); engine-code.test.ts checks that.
import * as af from './af.ts';
import { BookmarkNode } from './bookmarks.ts';
import { runDialog } from './dialog.ts';
import type { DialogSpec } from './dialog.ts';
import { EditCancelled, SheetDocument } from './document.ts';
import type { AcroEvent, EngineStats } from './document.ts';
import type { FieldState } from './field.ts';
import { copyMenu, menuItems } from './host.ts';
import type { Host, MenuItem } from './host.ts';
import { ALERT_ANSWER, ALERT_BUTTONS } from './host.ts';
import { realmTools } from './realm.ts';
import type { Realm, RealmTools } from './realm.ts';
import { installAcrobatReplace } from './acrobat-replace.ts';
import { installToSource } from './to-source.ts';
import type { RealmConstructors } from './to-source.ts';
import type { ImageSlot, SheetImage, SheetImages, SheetSnapshot } from './types.ts';
import { DISPLAY } from './types.ts';
import { printd, printf, scand } from './util.ts';

export interface SheetScript {
  name: string;
  code: string;
}

export interface EngineOptions {
  sheet: SheetSnapshot;
  /** MPMB's document scripts; they run in name order, like Acrobat runs document-level scripts. */
  scripts: readonly SheetScript[];
  host: Host;
  realm: Realm;
  /** Milliseconds since some start, for timings and timers; defaults to performance.now. */
  now?: () => number;
  /** Timers (their code) that may run; the others wait forever. Defaults to all. */
  allowTimer?: (expr: string) => boolean;
}

interface Timer {
  id: number;
  expr: unknown;
  ms: number;
  due: number;
  interval: boolean;
}

/* eslint-disable ts-patterns/no-magic-numbers -- these tables name the numbers of Acrobat's API */
/** Acrobat's colour arrays, as the `color` object names them. */
const COLOR = {
  transparent: ['T'],
  black: ['G', 0],
  white: ['G', 1],
  red: ['RGB', 1, 0, 0],
  green: ['RGB', 0, 1, 0],
  blue: ['RGB', 0, 0, 1],
  cyan: ['CMYK', 1, 0, 0, 0],
  magenta: ['CMYK', 0, 1, 0, 0],
  yellow: ['CMYK', 0, 0, 1, 0],
  dkGray: ['G', 0.25],
  gray: ['G', 0.5],
  ltGray: ['G', 0.75],
};
const CONSTANTS = {
  display: DISPLAY,
  border: { s: 'solid', b: 'beveled', d: 'dashed', i: 'inset', u: 'underline' },
  position: { textOnly: 0, iconOnly: 1, iconTextV: 2, textIconV: 3, iconTextH: 4, textIconH: 5, overlay: 6 },
  scaleHow: { proportional: 0, anamorphic: 1 },
  scaleWhen: { always: 0, never: 1, tooBig: 2, tooSmall: 3 },
  highlight: { n: 'none', i: 'invert', p: 'push', o: 'outline' },
  style: { ch: 'check', cr: 'cross', di: 'diamond', ci: 'circle', st: 'star', sq: 'square' },
  font: {
    Times: 'Times-Roman',
    TimesB: 'Times-Bold',
    TimesI: 'Times-Italic',
    TimesBI: 'Times-BoldItalic',
    Helv: 'Helvetica',
    HelvB: 'Helvetica-Bold',
    HelvI: 'Helvetica-Oblique',
    HelvBI: 'Helvetica-BoldOblique',
    Cour: 'Courier',
    CourB: 'Courier-Bold',
    CourI: 'Courier-Oblique',
    CourBI: 'Courier-BoldOblique',
    Symbol: 'Symbol',
    ZapfD: 'ZapfDingbats',
  },
  zoomtype: { none: 'NoVary', fitP: 'FitPage', fitW: 'FitWidth', fitH: 'FitHeight', fitV: 'FitVisibleWidth' },
};
/** The Acrobat this stand-in claims to be. MPMB checks the version for features (25 = Acrobat 2025). */
const VIEWER_VERSION = 25;
const SCREEN = { width: 1920, height: 1080, taskbar: 40 };
/** Acrobat's default highlight colour for fields (light blue). */
const HIGHLIGHT_COLOR = ['RGB', 0.8, 0.8, 1];
const ZOOM_PERCENT = 100;
/* eslint-enable ts-patterns/no-magic-numbers */

/** A loop of timers that keep rescheduling themselves would never end; this many in a row is the limit. */
const MAX_TIMERS_PER_RUN = 1000;
const MS_DECIMALS = 10;

export class Engine {
  readonly doc: SheetDocument;
  readonly tools: RealmTools;
  readonly host: Host;
  /** Script load times in milliseconds, by script name. */
  readonly timings: [string, number][] = [];
  private readonly timers: Timer[] = [];
  private timerId = 0;
  private readonly now: () => number;
  private readonly allowTimer: (expr: string) => boolean;
  private readonly root: BookmarkNode;
  /** The text behind each stream object `util.readFileIntoStream` gave the scripts. */
  private readonly streams = new WeakMap<object, string>();
  /**
   * The portrait and symbol. They ride along with the sheet so that a save keeps them; MPMB's scripts
   * never see them (in Acrobat they are button icons, which the scripts only copy or reset).
   */
  private images: SheetImages;
  /** The other document `app.openDoc` opens: the old sheet MPMB's import reads (see source-doc.ts). */
  private openable: object | null = null;
  /** While an edit runs that a cancelled pop-up cancels (see edit): its field, and whether that happened. */
  private cancelable: { field: string; cancelled: boolean } | null = null;

  private constructor({ sheet, host, realm, now, allowTimer }: EngineOptions) {
    this.images = { ...sheet.images };
    this.tools = realmTools(realm);
    this.host = host;
    this.now = now ?? (() => performance.now());
    this.allowTimer = allowTimer ?? (() => true);
    this.doc = new SheetDocument({ sheet, tools: this.tools });
    this.root = new BookmarkNode(
      { tools: this.tools, runAction: (node, script) => this.runBookmarkScript(node, script) },
      this.doc.bookmarkRoot,
      null,
    );
  }

  static load(options: EngineOptions): Engine {
    const engine = new Engine(options);
    engine.install();
    const realm = engine.tools.realm;
    installToSource(realm.global as unknown as RealmConstructors);
    installAcrobatReplace(realm.global as unknown as RealmConstructors);
    [...options.scripts]
      .sort((a, b) => (a.name < b.name ? -1 : Number(a.name > b.name)))
      .forEach((s) => {
        const t0 = engine.now();
        try {
          realm.evaluate(s.code, s.name);
        } catch (err) {
          engine.doc.logError('load ' + s.name, err);
        }
        engine.timings.push([s.name, Math.round((engine.now() - t0) * MS_DECIMALS) / MS_DECIMALS]);
      });
    return engine;
  }

  /** Offers a document to `app.openDoc` (null: none again), for MPMB's "Import from another sheet". */
  offerDocument(source: object | null): void {
    this.openable = source;
  }

  get stats(): EngineStats {
    return this.doc.stats;
  }

  // ---- The global API the scripts see ----

  private install(): void {
    const { doc, tools } = this;
    const g = tools.realm.global;
    const methods: Record<string, unknown> = {
      getField: (name: unknown) => doc.getField(String(name)),
      getNthFieldName: (n: number) => doc.getNthFieldName(Number(n)),
      resetForm: (names?: unknown) => doc.resetForm(names),
      calculateNow: () => doc.calculateNow(),
      removeField: (name: unknown) => doc.removeField(String(name)),
      getTemplate: (name: unknown) => this.template(String(name)),
      deletePages: (start?: unknown, end?: unknown) => {
        // deletePages(n), deletePages(nStart, nEnd) or deletePages({nStart, nEnd}).
        const args =
          typeof start === 'object' && start !== null
            ? (start as { nStart?: number; nEnd?: number })
            : { nStart: start as number, nEnd: end as number };
        doc.deletePages(Number(args.nStart ?? 0), args.nEnd === undefined ? undefined : Number(args.nEnd));
      },
      createTemplate: missing(doc, 'Doc.createTemplate'),
      getPrintParams: missing(doc, 'Doc.getPrintParams', tools.object({})),
      print: missing(doc, 'Doc.print'),
      closeDoc: missing(doc, 'Doc.closeDoc'),
      saveAs: missing(doc, 'Doc.saveAs'),
      extractPages: missing(doc, 'Doc.extractPages'),
      exportDataObject: missing(doc, 'Doc.exportDataObject'),
      importDataObject: missing(doc, 'Doc.importDataObject'),
      exportAsXFDF: missing(doc, 'Doc.exportAsXFDF'),
      exportAsXFDFStr: missing(doc, 'Doc.exportAsXFDFStr', ''),
      importAnXFDF: missing(doc, 'Doc.importAnXFDF'),
      importAnFDF: missing(doc, 'Doc.importAnFDF'),
      exportAsFDF: missing(doc, 'Doc.exportAsFDF'),
      submitForm: missing(doc, 'Doc.submitForm'),
      mailDoc: missing(doc, 'Doc.mailDoc'),
      getURL: (url: unknown) => this.host.launchURL?.(String(url)),
      flattenPages: missing(doc, 'Doc.flattenPages'),
      bringToFront: () => undefined,
      // Acrobat's name for a document object; MPMB's import checks it on the document it opened.
      toString: () => '[object Doc]',
      syncAnnotScan: () => undefined,
    };
    Object.assign(g, methods, {
      app: this.app(),
      util: this.util(),
      event: tools.object({}),
      global: tools.object({}),
      color: tools.copy(COLOR),
      ...tools.copy(CONSTANTS),
      AFNumber_Format: this.afCall((ev, nDec: number, sepStyle: number) => af.AFNumber_Format(ev, nDec, sepStyle)),
      AFNumber_Keystroke: this.afCall((ev) => af.AFNumber_Keystroke(ev)),
      AFRange_Validate: this.afCall((ev, bGt: boolean, nGt: number, bLt: boolean, nLt: number) =>
        af.AFRange_Validate(ev, bGt, nGt, bLt, nLt),
      ),
      AFDate_Format: this.afCall((ev, index: number) => af.AFDate_Format(ev, index)),
      AFDate_FormatEx: this.afCall((ev, format: string) => af.AFDate_FormatEx(ev, format)),
      AFDate_Keystroke: this.afCall((ev, index: number) => af.AFDate_Keystroke(ev, index)),
      AFDate_KeystrokeEx: this.afCall((ev, format: string) => af.AFDate_KeystrokeEx(ev, format)),
    });
    this.installConsole(g);
    // Document properties stay live: reading them asks the document each time.
    const live: Record<string, PropertyDescriptor> = {
      numFields: { get: () => doc.numFields },
      numPages: { get: () => doc.numPages },
      calculate: { get: () => doc.calculate, set: (v: unknown) => (doc.calculate = Boolean(v)) },
      delay: { get: () => doc.delay, set: (v: unknown) => (doc.delay = Boolean(v)) },
      dirty: { get: () => doc.dirty, set: (v: unknown) => (doc.dirty = Boolean(v)) },
      bookmarkRoot: { get: () => this.root },
      info: { value: caseBlindInfo(tools.copy(doc.info)), writable: true },
      documentFileName: { value: 'character.pdf', writable: true },
      path: { value: '/character.pdf', writable: true },
      filesize: { value: 0, writable: true },
      isWindows: { value: true, writable: true },
      external: { value: false, writable: true },
      layout: { value: 'SinglePage', writable: true },
      pageNum: { value: 0, writable: true },
      zoom: { value: ZOOM_PERCENT, writable: true },
    };
    Object.entries(live).forEach(([key, desc]) => Object.defineProperty(g, key, { ...desc, configurable: true }));
  }

  /** Acrobat's console; the worker and the tests have a console of their own, which keeps working. */
  private installConsole(g: Record<string, unknown>): void {
    const own = (g.console ?? this.tools.object({})) as Record<string, unknown>;
    const log = (s: unknown) => this.host.log?.(String(s));
    const acrobat = { println: log, show: () => undefined, hide: () => undefined, clear: () => undefined };
    // Adds the methods to the realm's console object (Reflect.set: the realm's, not a parameter's copy).
    Object.entries(acrobat).forEach(([k, fn]) => Reflect.set(own, k, fn));
    Reflect.set(g, 'console', own);
  }

  /** Wraps an AF helper: it reads the current event and the result is applied to it. */
  private afCall<A extends unknown[]>(fn: (ev: af.AfEvent, ...args: A) => af.AfResult): (...args: A) => void {
    return (...args: A) => {
      const ev = this.tools.realm.global.event as AcroEvent;
      const { alert, ...change } = fn(ev, ...args);
      Object.assign(ev, change);
      if (alert) this.alert({ cMsg: alert, nIcon: 0, nType: ALERT_BUTTONS.ok, cTitle: '' });
    };
  }

  private template(name: string): unknown {
    if (!this.doc.templates[name]) return null;
    return this.tools.object({
      name,
      hidden: true,
      spawn: (nPage?: unknown, bRename?: unknown, bOverlay?: unknown) => {
        // spawn(nPage, bRename, bOverlay) or spawn({nPage, bRename, bOverlay}); renaming is on by default.
        const args =
          typeof nPage === 'object' && nPage !== null
            ? (nPage as { nPage?: number; bRename?: boolean; bOverlay?: boolean })
            : { nPage: nPage as number, bRename: bRename as boolean, bOverlay: bOverlay as boolean };
        this.doc.spawn(name, Number(args.nPage ?? 0), args.bRename !== false, args.bOverlay === true);
        return null;
      },
    });
  }

  // ---- app ----

  private alert(a: unknown, nIcon?: unknown, nType?: unknown, cTitle?: unknown): number {
    const o = (typeof a === 'object' && a !== null ? a : { cMsg: a, nIcon, nType, cTitle }) as {
      cMsg?: unknown;
      nIcon?: unknown;
      nType?: unknown;
      cTitle?: unknown;
      oCheckbox?: { cMsg?: unknown; bInitialValue?: unknown; bAfterValue?: unknown };
    };
    const buttons = Number(o.nType ?? ALERT_BUTTONS.ok);
    const reply = this.host.alert({
      message: String(o.cMsg ?? ''),
      title: String(o.cTitle ?? ''),
      icon: Number(o.nIcon ?? 0),
      buttons,
      checkbox: o.oCheckbox
        ? { message: String(o.oCheckbox.cMsg ?? ''), value: Boolean(o.oCheckbox.bInitialValue) }
        : undefined,
    });
    if (o.oCheckbox) o.oCheckbox.bAfterValue = reply?.checkboxValue ?? Boolean(o.oCheckbox.bInitialValue);
    // Without the user: OK for a message, No (or Cancel) for a question, the safe answer.
    const fallback =
      buttons === ALERT_BUTTONS.yesNo || buttons === ALERT_BUTTONS.yesNoCancel ? ALERT_ANSWER.no : ALERT_ANSWER.ok;
    return reply?.answer ?? fallback;
  }

  private app(): Record<string, unknown> {
    const { tools } = this;
    const doc = this.doc;
    const app = tools.object({
      viewerType: 'Exchange-Pro',
      viewerVariation: 'Full',
      viewerVersion: VIEWER_VERSION,
      platform: 'WIN',
      language: 'ENU',
      runtimeHighlight: false,
      runtimeHighlightColor: tools.copy(HIGHLIGHT_COLOR),
      focusRect: true,
      fs: tools.object({ isFullScreen: false }),
      monitors: tools.copy([
        { rect: [0, 0, SCREEN.width, SCREEN.height], workRect: [0, 0, SCREEN.width, SCREEN.height - SCREEN.taskbar] },
      ]),
      thermometer: tools.object({
        value: 0,
        duration: 0,
        text: '',
        cancelled: false,
        begin: () => undefined,
        end: () => undefined,
      }),
      alert: (a: unknown, nIcon?: unknown, nType?: unknown, cTitle?: unknown) => this.alert(a, nIcon, nType, cTitle),
      execDialog: (spec: DialogSpec) => this.cancelEditOn(runDialog(spec, this.host, tools)),
      popUpMenuEx: (...items: MenuItem[]) => this.host.popUpMenu(menuItems(copyMenu(items))),
      popUpMenu: missing(doc, 'app.popUpMenu', null),
      setTimeOut: (expr: unknown, ms: unknown) => this.addTimer(expr, Number(ms) || 0, false),
      setInterval: (expr: unknown, ms: unknown) => this.addTimer(expr, Number(ms) || 0, true),
      clearTimeOut: (t: unknown) => this.clearTimer(t),
      clearInterval: (t: unknown) => this.clearTimer(t),
      launchURL: (url: unknown) => this.host.launchURL?.(String(url)),
      addToolButton: () => undefined,
      removeToolButton: () => undefined,
      addMenuItem: () => undefined,
      addSubMenu: () => undefined,
      hideMenuItem: () => undefined,
      listMenuItems: () => tools.array([]),
      listToolbarButtons: () => tools.array([]),
      execMenuItem: (name: unknown) => doc.missing('app.execMenuItem ' + String(name)),
      // Whatever the path, the one document on offer: the app has no files to open.
      openDoc: () => {
        if (this.openable) return this.openable;
        doc.missing('app.openDoc');
        return null;
      },
      newDoc: missing(doc, 'app.newDoc', null),
      browseForDoc: missing(doc, 'app.browseForDoc', null),
      response: missing(doc, 'app.response', null),
      beep: () => undefined,
      trustedFunction: (fn: unknown) => fn,
      beginPriv: () => undefined,
      endPriv: () => undefined,
    });
    Object.defineProperty(app, 'calculate', {
      get: () => doc.appCalculate,
      set: (v: unknown) => (doc.appCalculate = Boolean(v)),
      configurable: true,
    });
    return app;
  }

  /**
   * An Acrobat stream for a file's text. MPMB only hands it to `util.stringFromStream`, so the object
   * itself carries nothing; the text stays here, out of the scripts' reach.
   */
  private stream(text: string): object {
    const stream = this.tools.object({}) as object;
    this.streams.set(stream, text);
    return stream;
  }

  private util(): Record<string, unknown> {
    const doc = this.doc;
    return this.tools.object({
      printd: (format: string | number, date: Date) => printd(format, date),
      printf: (format: string, ...args: unknown[]) => printf(format, ...args),
      scand: (format: string | number, text: unknown) => {
        const d = scand(format, text);
        // A Date from the scripts' realm, so `instanceof Date` holds there.
        return d ? (this.tools.realm.evaluate(`new Date(${d.getTime()})`) as Date) : null;
      },
      printx: (format: string, text: unknown) => String(text ?? ''),
      // Null is what Acrobat returns when the player cancels its file picker: MPMB then stops quietly.
      // A path (opening a known file without asking) is something a browser can't do.
      readFileIntoStream: (path?: unknown) => {
        if (path !== undefined) {
          doc.missing('util.readFileIntoStream with a path');
          return null;
        }
        const text = this.host.openFile?.() ?? null;
        return text === null ? null : this.stream(text);
      },
      stringFromStream: (stream: unknown) => {
        const text = this.streams.get(stream as object);
        if (text === undefined) doc.missing('util.stringFromStream');
        return text ?? '';
      },
      streamFromString: missing(doc, 'util.streamFromString', null),
      iconStreamFromIcon: missing(doc, 'util.iconStreamFromIcon', null),
      crackURL: (url: unknown) => this.tools.object({ cURL: String(url) }),
    });
  }

  // ---- Timers ----
  // Acrobat runs timers on its own clock. Here they wait in a queue until `runTimers` (after each user
  // action), which keeps runs repeatable. MPMB uses them to finish work after the current event
  // (calcCont after calcStop) and to show its welcome dialogs 3 s after opening.

  private addTimer(expr: unknown, ms: number, interval: boolean): unknown {
    const timer: Timer = { id: ++this.timerId, expr, ms, due: this.now() + ms, interval };
    this.timers.push(timer);
    // The scripts keep the returned object to clear the timer later.
    return this.tools.object({ id: timer.id });
  }

  private clearTimer(handle: unknown): void {
    const id = (handle as { id?: number } | null)?.id;
    const at = this.timers.findIndex((t) => t.id === id);
    if (at !== -1) this.timers.splice(at, 1);
  }

  /** Pending timers (their code, shortened), for tests and diagnostics. */
  pendingTimers(): { expr: string; ms: number }[] {
    return this.timers.map((t) => ({ expr: String(t.expr), ms: t.ms }));
  }

  /**
   * Runs the waiting timers in the order they are due, including timers they add. Intervals run once
   * per call. `filter` holds some back for this run, on top of the engine's `allowTimer`.
   */
  runTimers(filter: (expr: string) => boolean = () => true): number {
    const step = (ran: number, skipped: Set<number>): number => {
      const ready = this.timers.filter((t) => !skipped.has(t.id)).sort((a, b) => a.due - b.due)[0];
      if (!ready || ran >= MAX_TIMERS_PER_RUN) return ran;
      const code = String(ready.expr);
      if (!this.allowTimer(code) || !filter(code)) return step(ran, new Set([...skipped, ready.id]));
      if (!ready.interval) this.timers.splice(this.timers.indexOf(ready), 1);
      try {
        const { expr } = ready;
        if (typeof expr === 'function') (expr as () => void).call(this.tools.realm.global);
        else this.tools.realm.evaluate(String(expr), 'timer');
      } catch (err) {
        this.doc.logError('timer ' + code.slice(0, MAX_TIMER_LABEL), err);
      }
      // An interval runs once per call, so the loop ends.
      return step(ran + 1, ready.interval ? new Set([...skipped, ready.id]) : skipped);
    };
    return step(0, new Set());
  }

  // ---- What a user does ----

  /**
   * Into the field, type `text`, commit, out of the field; then the timers MPMB set run.
   *
   * `cancelable`: a pop-up the player cancels while the field's scripts run cancels the whole edit. The
   * scripts stop there and the field gets its old value back through its own scripts, which undo what
   * the stopped run had applied. MPMB asks a magic item's armour or weapon type (adamantine armor: chain
   * mail, full plate …) in a pop-up with only OK, halfway through applying the item; in Acrobat closing
   * it anyway leaves the item half applied. In the app the pop-up can be closed, and that means "don't".
   */
  edit(name: string, text: string, { cancelable = false }: { cancelable?: boolean } = {}): boolean {
    const old = this.doc.states.get(name)?.value;
    // MPMB keeps notes on the field object for the field's later events (the form's name in setValPrepared,
    // see doDropDownValCalcWithChoices). Notes from a cancelled run must not reach the undo below.
    const field = cancelable ? this.doc.getField(name) : null;
    const notes = field ? { ...field } : null;
    this.cancelable = cancelable ? { field: name, cancelled: false } : null;
    let ok: boolean;
    let cancelled = false;
    try {
      ok = this.doc.edit(name, text);
      cancelled = this.cancelable?.cancelled ?? false;
    } finally {
      this.cancelable = null;
    }
    // The field kept its old value; typing it again runs the scripts that put the sheet back to match it.
    if (cancelled && typeof old === 'string') {
      if (field && notes) {
        const own = field as unknown as Record<string, unknown>;
        Object.keys(own).forEach((key) => {
          if (!(key in notes)) delete own[key];
        });
        Object.assign(own, notes);
      }
      this.doc.edit(name, old);
    }
    this.runTimers();
    return ok && !cancelled;
  }

  /**
   * A pop-up's result, or the end of a cancelable edit (see edit). Only in the edited field's own events:
   * their runEvent turns the throw into a rejected value (event.rc = false).
   */
  private cancelEditOn(result: string): string {
    const edit = this.cancelable;
    const event = this.tools.realm.global.event as AcroEvent | undefined;
    if (result === 'cancel' && edit && event?.targetName === edit.field) {
      edit.cancelled = true;
      throw new EditCancelled(`${edit.field}: cancelled in a pop-up`);
    }
    return result;
  }

  click(name: string, widget = 0, shift = false): void {
    this.doc.click(name, widget, shift);
    this.runTimers();
  }

  /** Clicks a bookmark (MPMB's menu), found by its path of names from the top. */
  clickBookmark(path: readonly string[]): void {
    const node = path.reduce<BookmarkNode | undefined>(
      (at, name) => (at?.children ?? []).filter((c) => c.name === name)[0],
      this.root,
    );
    if (!node) throw new Error(`No bookmark ${path.join(' > ')}`);
    node.execute();
    this.runTimers();
  }

  private runBookmarkScript(node: BookmarkNode, script: string): void {
    const g = this.tools.realm.global;
    const outer = g.event;
    g.event = this.tools.object({ name: 'Mouse Up', type: 'Bookmark', target: node, targetName: node.name, rc: true });
    try {
      (this.tools.realm.evaluate(`(function(){${script}\n})`, 'bookmark') as () => void).call(g);
    } catch (err) {
      this.doc.logError(`bookmark ${node.name}`, err);
    } finally {
      g.event = outer;
    }
  }

  /** Runs code in the sheet (tests and diagnostics). */
  evaluate(code: string): unknown {
    return this.tools.realm.evaluate(code, 'evaluate');
  }

  /** Every field's value as stored, by name. */
  values(): Record<string, string | string[]> {
    const out: Record<string, string | string[]> = {};
    this.doc.states.forEach((s: FieldState, name) => {
      out[name] = s.value;
    });
    return out;
  }

  /** The whole sheet as it is now, including the document info the scripts changed. */
  snapshot(): SheetSnapshot {
    const snap = this.doc.snapshot();
    const info = this.tools.realm.global.info as Record<string, unknown>;
    snap.info = Object.fromEntries(Object.entries(info).map(([k, v]) => [k, String(v)]));
    if (Object.keys(this.images).length) snap.images = { ...this.images };
    return snap;
  }

  /** Puts a picture on the sheet, or takes it off (null). */
  setImage(slot: ImageSlot, image: SheetImage | null): void {
    const { [slot]: _old, ...others } = this.images;
    this.images = image ? { ...others, [slot]: image } : others;
  }
}

/** The document info entries Acrobat also answers in lower case (`info.title` is `info.Title`). */
const STANDARD_INFO = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate'];

/**
 * Adds the lower-case names of the standard entries to a document info object, as getters that don't show
 * when the entries are listed (so a saved sheet keeps one entry each). MPMB's import reads `info.title`.
 */
function caseBlindInfo(info: Record<string, unknown>): Record<string, unknown> {
  STANDARD_INFO.forEach((name) => {
    const lower = name.charAt(0).toLowerCase() + name.slice(1);
    Object.defineProperty(info, lower, {
      get: () => info[name],
      set: (v: unknown) => (info[name] = v),
      enumerable: false,
      configurable: true,
    });
  });
  return info;
}

/** Timer code in error messages is cut to this length. */
const MAX_TIMER_LABEL = 60;

/** A stand-in for an API the engine doesn't model: it counts the call and returns `result`. */
function missing(doc: SheetDocument, what: string, result: unknown = undefined): () => unknown {
  return () => {
    doc.missing(what);
    return result;
  };
}
