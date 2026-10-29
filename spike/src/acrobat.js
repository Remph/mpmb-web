// M1 spike (throwaway): a stand-in for the parts of Acrobat's document JavaScript API that
// MPMB's scripts use. `installAcrobat` puts the API onto a global object, so the same code
// runs in a Web Worker (g = self) and in a Node vm context (g = the context's global).
// In Acrobat the document is the global object (`var tDoc = this;` in Functions0.js).
//
// Unknown API is not faked silently: every unmodelled call is counted in `doc.stats.missing`.

const DISPLAY = { visible: 0, hidden: 1, noPrint: 2, noView: 3 };
const COLOR = {
  transparent: ['T'],
  black: ['G', 0],
  white: ['G', 1],
  red: ['RGB', 1, 0, 0],
  green: ['RGB', 0, 1, 0],
  blue: ['RGB', 0, 0, 1],
  ltGray: ['G', 0.75],
  gray: ['G', 0.5],
  dkGray: ['G', 0.25],
};

// PDF form field flag bits (1-based bit position in /Ff)
const FF_READONLY = 1 << 0;
const FF_PUSHBUTTON = 1 << 16;

const color = COLOR;

export function installAcrobat(g, { defs, host, evalGlobal }) {
  const stats = { missing: {}, errors: [], events: 0, calcRuns: 0 };
  const missing = (what) => {
    stats.missing[what] = (stats.missing[what] ?? 0) + 1;
  };
  const logError = (where, err) => {
    stats.errors.push({ where, message: String(err?.stack ?? err).slice(0, 600) });
  };

  // ---- Field store -------------------------------------------------------------------

  const fields = new Map(); // name -> Field
  const order = []; // field names in creation order (getNthFieldName)
  let calcOrder = defs.calcOrder.slice();
  let calcFields = null;

  const scriptCache = new Map();
  function compile(code) {
    let fn = scriptCache.get(code);
    if (!fn) {
      fn = evalGlobal('(function(){' + code + '\n})');
      scriptCache.set(code, fn);
    }
    return fn;
  }

  // Acrobat has one global `event` object; nested events (a script sets another field)
  // get their own and the outer one is restored afterwards.
  function runAction(field, trigger, name, init) {
    const code = field.$.def.acts[trigger];
    if (!code) return null;
    const outer = g.event;
    const ev = {
      target: field,
      source: null,
      value: field.value,
      rc: true,
      willCommit: true,
      type: 'Field',
      name,
      change: '',
      changeEx: '',
      selStart: 0,
      selEnd: 0,
      shift: false,
      modifier: false,
      richValue: undefined,
      targetName: field.name,
      fieldFull: true,
      ...init,
    };
    g.event = ev;
    stats.events++;
    try {
      compile(code).call(g);
    } catch (err) {
      logError(`${field.name} ${name}`, err);
    } finally {
      g.event = outer;
    }
    return ev;
  }

  function normalize(field, v) {
    const { def } = field.$;
    if (def.type === 'Btn') return v === true ? (def.on?.[0] ?? 'Yes') : v === false ? 'Off' : String(v);
    if (v === null || v === undefined) return '';
    // Acrobat keeps line breaks in field values as \r, whatever the script wrote
    return (typeof v === 'string' ? v : String(v)).replace(/\r?\n/g, '\r');
  }

  function commitValue(field, v) {
    field.$.value = v;
  }

  let inCalc = false;
  function runFormat(field) {
    if (!field.$.def.acts.F) return;
    const ev = runAction(field, 'F', 'Format', { willCommit: false });
    if (ev) field.$.formatted = ev.value;
  }

  function runCalcChain(source) {
    if (inCalc) return;
    inCalc = true;
    stats.calcRuns++;
    try {
      if (!calcFields) {
        calcFields = calcOrder.map((n) => fields.get(n)).filter((f) => f?.$.def.acts.C);
      }
      for (const f of calcFields) {
        const ev = runAction(f, 'C', 'Calculate', { source, willCommit: false });
        if (ev && ev.rc !== false) {
          const nv = normalize(f, ev.value);
          if (nv !== f.$.value) {
            commitValue(f, nv);
            runFormat(f);
          }
        }
      }
    } finally {
      inCalc = false;
    }
  }

  // Setting `.value` from a script: Validate runs (MPMB relies on this, e.g. `setVal` in
  // doDropDownValCalcWithChoices), Keystroke does not. Then Format and the calculation chain.
  function setValue(field, raw) {
    const nv = normalize(field, raw);
    const { def } = field.$;
    // A calculation script that sets its own field's value (ProfBonus does) must not be undone by
    // the stale `event.value` afterwards
    const cur = g.event;
    if (cur?.target === field && cur.name === 'Calculate') {
      cur.value = nv;
      commitValue(field, nv);
      return;
    }
    if (def.acts.V) {
      const ev = runAction(field, 'V', 'Validate', { value: nv });
      if (ev && ev.rc === false) return;
      commitValue(field, normalize(field, ev ? ev.value : nv));
    } else {
      commitValue(field, nv);
    }
    runFormat(field);
    if (g.tDoc?.calculate !== false && doc.calculate) runCalcChain(field);
  }

  class Field {
    constructor(name, def) {
      const reset = def.dv ?? (def.type === 'Btn' ? 'Off' : '');
      Object.defineProperty(this, '$', {
        value: { def, value: def.v ?? reset, formatted: null, items: null },
        enumerable: false,
      });
      this.display = def.disp ?? DISPLAY.visible;
      this.readonly = !!(def.ff & FF_READONLY);
      this.userName = def.tu ?? '';
      this.submitName = def.tm ?? '';
      Object.defineProperty(this, 'name', { value: name, enumerable: false });
    }
    get type() {
      const { def } = this.$;
      if (def.type === 'Btn') return def.btn === 'push' ? 'button' : def.btn === 'radio' ? 'radiobutton' : 'checkbox';
      if (def.type === 'Ch') return def.ff & (1 << 17) ? 'combobox' : 'listbox';
      return 'text';
    }
    get value() {
      const { def, value } = this.$;
      // Acrobat hands out numbers for numeric text: MPMB adds `ProfB + ProfMod` on a text field's
      // value and the PDF still says "4", so "0" must have come back as 0. Only strings that
      // survive the round trip count (not "007" or "1.50"). To be checked against Acrobat in M2.
      if ((def.type === 'Tx' || def.type === 'Ch') && value !== '' && String(Number(value)) === value)
        return Number(value);
      return value;
    }
    set value(v) {
      setValue(this, v);
    }
    get valueAsString() {
      return String(this.$.value);
    }
    get defaultValue() {
      return this.$.def.dv ?? '';
    }
    set defaultValue(v) {
      this.$.def.dv = String(v);
    }
    get page() {
      const pg = this.$.def.pg;
      return pg.length > 1 ? pg : (pg[0] ?? 0);
    }
    get rect() {
      const r = this.$.def.rect;
      return r[0] ?? [];
    }
    get charLimit() {
      return this.$.def.maxLen ?? 0;
    }
    get multiline() {
      return !!(this.$.def.ff & (1 << 12));
    }
    get numItems() {
      return this.items().length;
    }
    items() {
      const s = this.$;
      // /Opt pairs are [export value, display text]; the JS API uses [display, export]
      s.items ??= (s.def.opt ?? []).map((o) => (Array.isArray(o) ? [o[1], o[0]] : [o, o]));
      return s.items;
    }
    getItemAt(i, bExport = true) {
      const it = this.items()[i];
      return it ? (bExport ? it[1] : it[0]) : null;
    }
    setItems(list) {
      this.$.items = list.map((o) => (Array.isArray(o) ? [o[0], o[1] ?? o[0]] : [o, o]));
    }
    clearItems() {
      this.$.items = [];
    }
    insertItemAt(cName, cExport, nIdx = -1) {
      const it = [cName, cExport ?? cName];
      const list = this.items();
      if (nIdx < 0 || nIdx > list.length) list.push(it);
      else list.splice(nIdx, 0, it);
    }
    deleteItemAt(n) {
      this.items().splice(n ?? this.currentValueIndices ?? 0, 1);
    }
    get currentValueIndices() {
      return this.items().findIndex((it) => it[1] === this.$.value);
    }
    set currentValueIndices(i) {
      const it = this.items()[i];
      if (it) setValue(this, it[1]);
    }
    checkThisBox(nWidget, bCheck = true) {
      setValue(this, bCheck ? (this.$.def.on?.[0] ?? 'Yes') : 'Off');
    }
    // Numbers, not booleans: the sheet compares `isBoxChecked(0) === 1`
    isBoxChecked() {
      return this.$.value !== 'Off' && this.$.value !== '' ? 1 : 0;
    }
    isDefaultChecked() {
      return (this.$.def.dv ?? 'Off') !== 'Off' ? 1 : 0;
    }
    defaultIsChecked(n, bCheck = true) {
      this.$.def.dv = bCheck ? (this.$.def.on?.[0] ?? 'Yes') : 'Off';
    }
    getArray() {
      return [this];
    }
    setAction(trigger, script) {
      const key =
        {
          Keystroke: 'K',
          Validate: 'V',
          Calculate: 'C',
          Format: 'F',
          MouseUp: 'A',
          MouseDown: 'D',
          MouseEnter: 'E',
          MouseExit: 'X',
          OnFocus: 'Fo',
          OnBlur: 'Bl',
        }[trigger] ?? trigger;
      this.$.def.acts[key] = script;
      if (key === 'C') {
        // A calculation added at run time joins the end of the calculation order
        if (script && !calcOrder.includes(this.name)) calcOrder.push(this.name);
        calcFields = null;
      }
    }
    setFocus() {}
    buttonSetIcon() {}
    buttonGetIcon() {
      return null;
    }
    buttonImportIcon() {
      return 0;
    }
    signatureInfo() {
      missing('Field.signatureInfo');
      return {};
    }
    browseForFileToSubmit() {}
  }
  // Acrobat's presentation-only Field methods: nothing to do without a PDF viewer.
  for (const m of [
    'buttonSetCaption',
    'buttonGetCaption',
    'buttonAlignX',
    'buttonAlignY',
    'buttonFitBounds',
    'buttonPosition',
    'buttonScaleHow',
    'buttonScaleWhen',
    'setLock',
    'getLock',
    'setRichValue',
  ]) {
    Field.prototype[m] = function () {
      return undefined;
    };
  }

  function addField(name, def) {
    const f = new Field(name, def);
    fields.set(name, f);
    order.push(name);
    return f;
  }

  const cloneDef = (def) => JSON.parse(JSON.stringify(def));
  for (const [name, def] of Object.entries(defs.fields)) addField(name, def);

  // A name that is only a prefix of other names ("Comp.Use.Attack.1") is a parent field.
  let parentNames = null;
  function parentField(name) {
    if (!parentNames) {
      parentNames = new Set();
      for (const n of fields.keys()) {
        for (let i = n.indexOf('.'); i !== -1; i = n.indexOf('.', i + 1)) parentNames.add(n.slice(0, i));
      }
    }
    if (!parentNames.has(name)) return null;
    const kids = [...fields.keys()].filter((n) => n.startsWith(name + '.')).map((n) => fields.get(n));
    return { name, getArray: () => kids, isParent: true };
  }

  // "Name.1" is the second widget of a field that has several (Acrobat's naming for widgets).
  // It shares the field's value but has its own rectangle and page.
  const widgets = new Map();
  function widgetField(name) {
    const m = /^(.*)\.(\d+)$/.exec(name);
    const base = m && fields.get(m[1]);
    const i = m ? Number(m[2]) : -1;
    if (!base || i >= base.$.def.pg.length || base.$.def.pg.length < 2) return null;
    let w = widgets.get(name);
    if (!w) {
      w = Object.create(base, {
        rect: { get: () => base.$.def.rect[i] ?? [] },
        page: { get: () => base.$.def.pg[i] },
      });
      widgets.set(name, w);
    }
    return w;
  }

  // ---- Templates ---------------------------------------------------------------------

  const templates = new Map();
  const pageState = { numPages: defs.numPages, spawned: [] };
  function getTemplate(name) {
    if (!defs.templates?.[name]) return null;
    let t = templates.get(name);
    if (!t) {
      t = {
        name,
        hidden: true,
        spawn(nPage, bRename) {
          const prefix = `P${nPage}.${name}.`;
          for (const orig of defs.templates[name]) {
            const src = fields.get(orig);
            if (!src) continue;
            const def = cloneDef(src.$.def);
            def.v = def.dv;
            if (bRename) {
              if (!fields.has(prefix + orig)) addField(prefix + orig, def);
            } else {
              // Without renaming, the page adds widgets to the fields that already exist.
              src.$.def.pg = [...src.$.def.pg, nPage];
              src.$.def.rect = [...src.$.def.rect, src.$.def.rect[0] ?? []];
            }
          }
          pageState.numPages++;
          pageState.spawned.push({ name, nPage, bRename });
          parentNames = null;
          calcFields = null;
        },
      };
      templates.set(name, t);
    }
    return t;
  }

  // ---- Bookmarks (MPMB keeps references to its sheet bookmarks and edits the tree) ----

  function makeBookmark(name, kids = []) {
    const b = {
      name,
      open: false,
      style: 0,
      color: color.black,
      children: [],
      createChild({ cName, cExpr, nIndex } = {}) {
        const kid = makeBookmark(cName ?? '');
        kid.action = cExpr;
        kid.parent = b;
        if (nIndex === undefined || nIndex < 0 || nIndex > b.children.length) b.children.push(kid);
        else b.children.splice(nIndex, 0, kid);
      },
      remove() {
        const sibs = b.parent?.children;
        if (sibs) sibs.splice(sibs.indexOf(b), 1);
      },
      execute() {},
    };
    for (const k of kids) {
      const kid = makeBookmark(k.name, k.children);
      kid.parent = b;
      b.children.push(kid);
    }
    return b;
  }

  // ---- Document ----------------------------------------------------------------------

  const doc = {
    stats,
    fields,
    calculate: true,
    delay: false,
    dirty: false,
    info: { ...defs.info },
    pageState,
    getField(name) {
      return fields.get(name) ?? widgetField(name) ?? parentField(name) ?? null;
    },
    get numFields() {
      return fields.size;
    },
    getNthFieldName(n) {
      return order[n] ?? null;
    },
    get numPages() {
      return pageState.numPages;
    },
    getTemplate,
    createTemplate() {
      missing('Doc.createTemplate');
    },
    deletePages() {
      missing('Doc.deletePages');
    },
    removeField(name) {
      fields.delete(name);
      parentNames = null;
      calcFields = null;
    },
    resetForm(names) {
      const list = names ? [].concat(names) : [...fields.keys()];
      for (const n of list) {
        const f = fields.get(n);
        if (f) commitValue(f, f.$.def.dv ?? (f.$.def.type === 'Btn' ? 'Off' : ''));
        else {
          const p = parentField(n);
          for (const c of p?.getArray() ?? []) commitValue(c, c.$.def.dv ?? (c.$.def.type === 'Btn' ? 'Off' : ''));
        }
      }
    },
    calculateNow() {
      runCalcChain(null);
    },
    bookmarkRoot: makeBookmark('', defs.outline ?? []),
    documentFileName: 'spike.pdf',
    path: '/spike.pdf',
    dataObjects: [],
    isWindows: true,
    getPrintParams() {
      missing('Doc.getPrintParams');
      return {};
    },
    print() {
      missing('Doc.print');
    },
    closeDoc() {
      missing('Doc.closeDoc');
    },
    extractPages() {
      missing('Doc.extractPages');
    },
    exportDataObject() {
      missing('Doc.exportDataObject');
    },
    importDataObject() {
      missing('Doc.importDataObject');
    },
    exportAsXFDF() {
      missing('Doc.exportAsXFDF');
    },
    exportAsXFDFStr() {
      missing('Doc.exportAsXFDFStr');
      return '';
    },
    importAnXFDF() {
      missing('Doc.importAnXFDF');
    },
    importAnFDF() {
      missing('Doc.importAnFDF');
    },
    // Test hooks (not Acrobat API)
    userCommit(name, text) {
      const f = fields.get(name);
      const k = runAction(f, 'K', 'Keystroke', { value: text, change: text, willCommit: true });
      if (k && k.rc === false) return false;
      setValue(f, k ? k.value : text);
      return true;
    },
    runCalcChain,
    resetCalcFields() {
      calcFields = null;
    },
    setCalcOrder(o) {
      calcOrder = o;
      calcFields = null;
    },
  };

  // ---- app, util, console, constants -------------------------------------------------

  const timers = [];
  let timerId = 0;
  const app = {
    viewerType: 'Exchange-Pro',
    viewerVersion: 25,
    platform: 'WIN',
    calculate: true,
    runtimeHighlight: false,
    runtimeHighlightColor: ['RGB', 0.8, 0.8, 1],
    monitors: [{ rect: [0, 0, 1920, 1080], workRect: [0, 0, 1920, 1040] }],
    alert(a, nIcon = 0, nType = 0, cTitle = '') {
      const opts = typeof a === 'object' && a !== null ? a : { cMsg: a, nIcon, nType, cTitle };
      return host.alert(opts);
    },
    execDialog(dlg, ...rest) {
      return host.execDialog(dlg, ...rest);
    },
    popUpMenuEx(...items) {
      return host.popUpMenuEx(items);
    },
    setTimeOut(expr, ms) {
      const t = { id: ++timerId, expr, ms, due: ms, interval: false };
      timers.push(t);
      return t;
    },
    setInterval(expr, ms) {
      const t = { id: ++timerId, expr, ms, due: ms, interval: true };
      timers.push(t);
      return t;
    },
    clearTimeOut(t) {
      const i = timers.indexOf(t);
      if (i !== -1) timers.splice(i, 1);
    },
    clearInterval(t) {
      app.clearTimeOut(t);
    },
    thermometer: { value: 0, duration: 0, text: '', cancelled: false, begin() {}, end() {} },
    addToolButton() {},
    removeToolButton() {},
    launchURL(url) {
      host.launchURL?.(url);
    },
    execMenuItem(name) {
      missing('app.execMenuItem ' + name);
    },
    openDoc() {
      missing('app.openDoc');
      return null;
    },
    listMenuItems() {
      return [];
    },
    beep() {},
    get language() {
      return 'ENU';
    },
  };
  app.thermometer.begin = () => {};
  app.thermometer.end = () => {};

  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const util = {
    // The subset of Acrobat's date format tokens that the sheet uses
    printd(fmt, d) {
      const f = typeof fmt === 'number' ? ['m/d/yy h:MM tt', 'm/d/yy', 'mm/dd/yy', 'mm/yy', 'm/d/yyyy'][fmt] : fmt;
      return f.replace(/yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|HH|H|hh|h|MM|M|ss|s|tt|t/g, (t) => {
        switch (t) {
          case 'yyyy':
            return d.getFullYear();
          case 'yy':
            return pad(d.getFullYear() % 100);
          case 'mmmm':
            return MONTHS[d.getMonth()];
          case 'mmm':
            return MONTHS[d.getMonth()].slice(0, 3);
          case 'mm':
            return pad(d.getMonth() + 1);
          case 'm':
            return d.getMonth() + 1;
          case 'dddd':
            return DAYS[d.getDay()];
          case 'ddd':
            return DAYS[d.getDay()].slice(0, 3);
          case 'dd':
            return pad(d.getDate());
          case 'd':
            return d.getDate();
          case 'HH':
            return pad(d.getHours());
          case 'H':
            return d.getHours();
          case 'hh':
            return pad(d.getHours() % 12 || 12);
          case 'h':
            return d.getHours() % 12 || 12;
          case 'MM':
            return pad(d.getMinutes());
          case 'M':
            return d.getMinutes();
          case 'ss':
            return pad(d.getSeconds());
          case 's':
            return d.getSeconds();
          case 'tt':
            return d.getHours() < 12 ? 'am' : 'pm';
          default:
            return d.getHours() < 12 ? 'a' : 'p';
        }
      });
    },
    scand(fmt, str) {
      const d = new Date(str);
      return isNaN(d) ? null : d;
    },
    printf(fmt, ...args) {
      let i = 0;
      return fmt.replace(/%(\+?)(0?)(\d*)(?:\.(\d+))?([dfsx%])/g, (m, plus, zero, w, prec, conv) => {
        if (conv === '%') return '%';
        const v = args[i++];
        let s =
          conv === 'f'
            ? Number(v).toFixed(prec === undefined ? 6 : Number(prec))
            : conv === 'x'
              ? Number(v).toString(16)
              : String(conv === 'd' ? Math.trunc(Number(v)) : v);
        if (plus && Number(v) >= 0 && conv !== 's') s = '+' + s;
        return s.padStart(Number(w) || 0, zero ? '0' : ' ');
      });
    },
    readFileIntoStream() {
      missing('util.readFileIntoStream');
      return null;
    },
    stringFromStream() {
      missing('util.stringFromStream');
      return '';
    },
    iconStreamFromIcon() {
      missing('util.iconStreamFromIcon');
      return null;
    },
  };

  const consoleStub = {
    println: (s) => host.log?.(String(s)),
    show() {},
    hide() {},
    clear() {},
  };

  // Acrobat's built-in format helpers (the sheet uses AFNumber_Format and AFRange_Validate)
  const af = {
    AFNumber_Format(nDec, sepStyle) {
      const ev = g.event;
      if (ev.value === '' || ev.value === undefined) return;
      const n = Number(String(ev.value).replace(',', '.'));
      if (isNaN(n)) return;
      let s = n.toFixed(nDec);
      if (sepStyle === 1 || sepStyle === 3) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      ev.value = s;
    },
    AFNumber_Keystroke() {},
    AFRange_Validate(bGreater, nGreater, bLess, nLess) {
      const ev = g.event;
      if (ev.value === '' || ev.value === undefined) return;
      const n = Number(ev.value);
      if ((bGreater && n < nGreater) || (bLess && n > nLess)) ev.rc = false;
    },
    AFDate_Format() {},
    AFDate_Keystroke() {},
  };

  Object.assign(g, doc, af, {
    app,
    util,
    event: {},
    console: consoleStub,
    display: DISPLAY,
    color: COLOR,
    border: { s: 'solid', b: 'beveled', d: 'dashed', i: 'inset', u: 'underline' },
    position: { textOnly: 0, iconOnly: 1, iconTextV: 2, textIconV: 3, iconTextH: 4, textIconH: 5, overlay: 6 },
    global: {},
    doc,
  });
  // Accessors on the document object must stay live accessors, not copies
  for (const key of ['numFields', 'numPages']) {
    Object.defineProperty(g, key, { get: () => doc[key], configurable: true });
  }
  for (const key of ['calculate', 'delay', 'dirty']) {
    Object.defineProperty(g, key, {
      get: () => doc[key],
      set: (v) => {
        doc[key] = v;
      },
      configurable: true,
    });
  }
  Object.defineProperty(g, 'info', { get: () => doc.info, configurable: true });

  // Run timers whose time has come, or all of them (deterministic tests, no real waiting)
  doc.runTimers = ({ all = true } = {}) => {
    let ran = 0;
    while (timers.length && ran < 1000) {
      const t = timers.shift();
      if (!all && t.due > 0) break;
      try {
        typeof t.expr === 'function' ? t.expr() : evalGlobal(t.expr);
      } catch (err) {
        logError('timer ' + String(t.expr).slice(0, 60), err);
      }
      if (t.interval) break; // intervals would never end
      ran++;
    }
    return ran;
  };
  doc.pendingTimers = () => timers.map((t) => ({ expr: String(t.expr).slice(0, 60), ms: t.ms }));

  return doc;
}
