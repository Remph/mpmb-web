// The document side of the Acrobat stand-in: the field store, Acrobat's field events in Acrobat's
// order, the calculation order, templates and pages, bookmarks and `resetForm`. The global API that
// MPMB's scripts see (getField, app, util, event, ...) is put together in engine.ts.
//
// Event order (Acrobat JavaScript API reference, "Event processing"), as modelled here:
// - A user types into a field: OnFocus; Keystroke for the typing (willCommit false); on commit
//   Keystroke (willCommit true), Validate, the value is stored, the whole calculation order runs,
//   then Format of the field; OnBlur when the user leaves it.
// - A script sets `field.value`: Validate (MPMB relies on it), store, calculations, Format.
// - A calculation that changes a field's value runs that field's Format right away.
// - While `calculate` is off (MPMB's calcStop), values are stored without calculations; MPMB runs
//   `calculateNow()` itself when it switches them back on.
/* eslint-disable ts-patterns/no-param-reassign -- FieldState is the live, mutable state of a field: the store's job is to change it */
import { Field, ParentField, newFieldState, resetValue, spansText, stateOf } from './field.ts';
import type { FieldOwner, FieldState, Span } from './field.ts';
import type { RealmTools } from './realm.ts';
import type { Bookmark, FieldDef, SheetSnapshot, Trigger } from './types.ts';
import { EVENT_NAMES, FF, TRIGGERS } from './types.ts';
import { acrobatValue } from './util.ts';

/** Acrobat's `event` object, as far as field scripts use it. */
export interface AcroEvent {
  name: string;
  type: string;
  target: unknown;
  targetName: string;
  source: unknown;
  value: unknown;
  rc: boolean;
  change: string;
  changeEx: string;
  willCommit: boolean;
  selStart: number;
  selEnd: number;
  shift: boolean;
  modifier: boolean;
  commitKey: number;
  fieldFull: boolean;
  keyDown: boolean;
  richValue?: Span[];
  richChange?: Span[];
  richChangeEx?: Span[];
}

export interface EngineStats {
  /** Script errors: where (field and trigger, or timer) and the message. Acrobat logs them and goes on. */
  errors: { where: string; message: string }[];
  /** API calls that the stand-in knows about but doesn't model, with counts. */
  missing: Record<string, number>;
  events: number;
  calcRuns: number;
}

const TRIGGER_BY_NAME: Record<string, Trigger> = Object.fromEntries(
  Object.entries(TRIGGERS).map(([key, name]) => [name, key as Trigger]),
);
/** Error messages keep their first lines; a stack through MPMB's scripts can be very long. */
const ERROR_TEXT_LIMIT = 800;
/**
 * Acrobat keeps line breaks in field values as \r, whatever the script wrote: "a\nb" and "a\r\nb"
 * become "a\rb"; a lone "\r" stays. Try it: https://regex101.com/?regex=%5Cr%3F%5Cn&testString=a%0D%0Ab
 */
const LINE_BREAK = /\r?\n/g;
/** "Commit by pressing Enter": what a typed-in commit reports to Keystroke scripts. */
const COMMIT_KEY_ENTER = 2;

/**
 * A name that ends in ".<number>" can mean a widget of a field with several: "Name.1" is widget 1 of
 * "Name"; "Name" alone doesn't match. Try it: https://regex101.com/?regex=%5E(.*)%5C.(%5Cd%2B)%24&testString=Name.1
 */
const WIDGET_NAME = /^(.*)\.(\d+)$/;
/**
 * Fields made by spawning a template with renaming: "P<page>.<template>.<name>". Matches
 * "P6.SSfront.spells.name.0" (page 6, template SSfront); not "Page 6".
 * Try it: https://regex101.com/?regex=%5EP(%5Cd%2B)%5C.(%5B%5E.%5D%2B)%5C.&testString=P6.SSfront.spells.name.0
 */
const SPAWNED_PREFIX = /^P(\d+)\.([^.]+)\./;

export interface DocumentOptions {
  sheet: SheetSnapshot;
  tools: RealmTools;
}

export class SheetDocument implements FieldOwner {
  readonly stats: EngineStats = { errors: [], missing: {}, events: 0, calcRuns: 0 };
  readonly tools: RealmTools;
  readonly states = new Map<string, FieldState>();
  /** Field names in Acrobat's order (`getNthFieldName`); removed fields leave it. */
  private order: string[] = [];
  private calcOrder: string[];
  private calcList: FieldState[] | null = null;
  private fieldObjects = new Map<string, Field>();
  private parents: Set<string> | null = null;
  private compiled = new Map<string, () => void>();
  private inCalc = false;
  /** Counts value changes, so that a caller can tell whether scripts changed anything. */
  private changes = 0;
  readonly templates: Record<string, string[]>;
  numPages: number;
  info: Record<string, string>;
  bookmarkRoot: Bookmark;
  /** Acrobat's doc.calculate (MPMB's calcStop/calcCont switch it). */
  calculate = true;
  /** Acrobat's app.calculate; MPMB switches it together with doc.calculate. */
  appCalculate = true;
  delay = false;
  dirty = false;
  /** Called whenever a field changes, for the UI (M4). */
  onChange: ((state: FieldState) => void) | null = null;

  constructor({ sheet, tools }: DocumentOptions) {
    this.tools = tools;
    Object.entries(sheet.fields).forEach(([name, def]) => this.addField(name, structuredClone(def)));
    this.calcOrder = [...sheet.calcOrder];
    this.templates = sheet.templates;
    this.numPages = sheet.numPages;
    this.info = { ...sheet.info };
    this.bookmarkRoot = { name: '', children: structuredClone(sheet.outline) };
  }

  // ---- Bookkeeping ----

  missing(what: string): void {
    this.stats.missing[what] = (this.stats.missing[what] ?? 0) + 1;
  }

  logError(where: string, err: unknown): void {
    const message =
      err instanceof Error || (typeof err === 'object' && err && 'stack' in err)
        ? String((err as Error).stack ?? err)
        : String(err);
    this.stats.errors.push({ where, message: message.slice(0, ERROR_TEXT_LIMIT) });
  }

  addField(name: string, def: FieldDef): FieldState {
    const state = newFieldState(name, def);
    if (!this.states.has(name)) this.order.push(name);
    this.states.set(name, state);
    this.fieldObjects.delete(name);
    this.parents = null;
    if (def.actions.C && !this.calcOrder?.includes(name)) this.calcList = null;
    return state;
  }

  removeField(name: string): void {
    if (!this.states.delete(name)) return;
    this.order = this.order.filter((n) => n !== name);
    this.calcOrder = this.calcOrder.filter((n) => n !== name);
    this.fieldObjects.delete(name);
    this.parents = null;
    this.calcList = null;
  }

  get numFields(): number {
    return this.order.length;
  }

  getNthFieldName(n: number): string | null {
    return this.order[n] ?? null;
  }

  // ---- Field objects ----

  getField(name: string): Field | ParentField | null {
    const key = String(name);
    const known = this.fieldObjects.get(key);
    if (known) return known;
    const state = this.states.get(key);
    if (state) return this.fieldObject(key, state, null);
    // "Name.1": widget 1 of a field with several widgets (Acrobat's naming).
    const m = WIDGET_NAME.exec(key);
    const base = m?.[1] === undefined ? undefined : this.states.get(m[1]);
    const index = Number(m?.[2]);
    if (base && base.def.widgets.length > 1 && index < base.def.widgets.length)
      return this.fieldObject(key, base, index);
    return this.isParent(key) ? new ParentField(this, key, () => this.kidsOf(key)) : null;
  }

  private fieldObject(key: string, state: FieldState, widget: number | null): Field {
    const f = new Field(this, state, widget);
    this.fieldObjects.set(key, f);
    return f;
  }

  private isParent(name: string): boolean {
    if (!this.parents) {
      const parents = new Set<string>();
      this.order.forEach((n) => {
        const parts = n.split('.');
        parts.slice(1).forEach((_, i) => parents.add(parts.slice(0, i + 1).join('.')));
      });
      this.parents = parents;
    }
    return this.parents.has(name);
  }

  private kidsOf(name: string): Field[] {
    const prefix = name + '.';
    return this.order.filter((n) => n.startsWith(prefix)).map((n) => this.getField(n) as Field);
  }

  // ---- FieldOwner (what Field objects call) ----

  array<T>(items: readonly T[]): T[] {
    return this.tools.array(items);
  }

  copy<T>(value: T): T {
    return this.tools.copy(value);
  }

  readValue(state: FieldState): unknown {
    const v = state.value;
    if (Array.isArray(v)) return this.tools.array(v);
    // Text and choice fields hand out numbers for numeric text, like Acrobat.
    return state.def.type === 'Btn' ? v : acrobatValue(v);
  }

  setAction(state: FieldState, trigger: string, script: string): void {
    const key = TRIGGER_BY_NAME[trigger] ?? (trigger as Trigger);
    const code = String(script ?? '');
    const actions = { ...state.def.actions };
    if (code) actions[key] = code;
    else delete actions[key];
    state.def.actions = actions;
    // A calculation added at run time joins the end of the calculation order (Acrobat does the same).
    if (key === 'C' && code && !this.calcOrder.includes(state.name)) this.calcOrder.push(state.name);
    if (key === 'C') this.calcList = null;
  }

  calcOrderIndex(state: FieldState): number {
    return this.calcOrder.indexOf(state.name);
  }

  setCalcOrderIndex(state: FieldState, index: number): void {
    const rest = this.calcOrder.filter((n) => n !== state.name);
    const at = Math.max(0, Math.min(index, rest.length));
    this.calcOrder = [...rest.slice(0, at), state.name, ...rest.slice(at)];
    this.calcList = null;
  }

  get calculationOrder(): readonly string[] {
    return this.calcOrder;
  }

  // ---- Events ----

  private compile(code: string): () => void {
    let fn = this.compiled.get(code);
    if (!fn) {
      // Each field script becomes a function in the scripts' realm, called with `this` = the document.
      fn = this.tools.realm.evaluate(`(function(){${code}\n})`, 'field script') as () => void;
      this.compiled.set(code, fn);
    }
    return fn;
  }

  /**
   * Runs one of the field's scripts with a fresh `event`. Acrobat has one global `event`; a script that
   * sets another field starts a nested event, and the outer one is back afterwards.
   */
  runEvent(state: FieldState, trigger: Trigger, init: Partial<AcroEvent> = {}): AcroEvent | null {
    const code = state.def.actions[trigger];
    if (!code) return null;
    const g = this.tools.realm.global;
    const outer = g.event;
    const target = this.getField(state.name);
    const ev = this.tools.object<AcroEvent>({
      name: EVENT_NAMES[trigger],
      type: 'Field',
      target,
      targetName: state.name,
      source: null,
      value: state.value,
      rc: true,
      change: '',
      changeEx: '',
      willCommit: false,
      selStart: 0,
      selEnd: 0,
      shift: false,
      modifier: false,
      commitKey: 0,
      fieldFull: false,
      keyDown: false,
      ...init,
    });
    g.event = ev;
    this.stats.events++;
    try {
      this.compile(code).call(g);
    } catch (err) {
      this.logError(`${state.name} ${EVENT_NAMES[trigger]}`, err);
    } finally {
      g.event = outer;
    }
    return ev;
  }

  /** What a field stores: text with line breaks as \r (Acrobat's), a check box state, or items. */
  normalize(state: FieldState, v: unknown): string | string[] {
    if (Array.isArray(v) && state.def.type === 'Ch') return Array.from(v, String);
    if (state.def.type === 'Btn' && !(state.def.flags & FF.pushButton)) {
      if (v === true) return state.def.widgets[0]?.on ?? 'Yes';
      if (v === false || v === null || v === undefined || v === '') return 'Off';
      return String(v);
    }
    if (v === null || v === undefined) return '';
    return String(v).replace(LINE_BREAK, '\r');
  }

  private commit(state: FieldState, value: string | string[]): void {
    const changed = JSON.stringify(state.value) !== JSON.stringify(value);
    state.value = value;
    // Rich text set as plain text loses its spans.
    if (state.spans && spansText(state.spans) !== value) delete state.spans;
    if (changed) {
      this.changes++;
      this.dirty = true;
      this.onChange?.(state);
    }
  }

  /** Format turns the value into the text to show; MPMB's Format scripts also update other fields. */
  runFormat(state: FieldState): void {
    if (!state.def.actions.F) {
      delete state.formatted;
      return;
    }
    const isRich = (state.def.flags & FF.richText) !== 0;
    const richValue = isRich ? this.tools.copy(state.spans ?? [{ text: this.textOf(state) }]) : undefined;
    const ev = this.runEvent(state, 'F', { value: this.textOf(state), willCommit: true, richValue });
    if (!ev) return;
    state.formatted = ev.value === null || ev.value === undefined ? '' : String(ev.value);
    if (isRich && Array.isArray(ev.richValue))
      state.formattedSpans = JSON.parse(JSON.stringify(ev.richValue)) as Span[];
    this.onChange?.(state);
  }

  /**
   * Runs every field's Format script once, so that each field has the text it shows (Acrobat shows
   * the text saved in the PDF instead). Some of MPMB's Format scripts set other fields
   * (SetCarriedLocations fills the gear location subtotals), so the calculations wait and run once at
   * the end if anything changed, like MPMB's own calcStop and calcCont.
   */
  formatAll(): void {
    const before = this.changes;
    const calculate = this.calculate;
    this.calculate = false;
    try {
      this.states.forEach((state) => {
        if (state.def.actions.F) this.runFormat(state);
      });
    } finally {
      this.calculate = calculate;
    }
    if (this.changes !== before && this.calcOn) this.runCalculations(null);
  }

  private textOf(state: FieldState): string {
    return Array.isArray(state.value) ? state.value.join(',') : state.value;
  }

  get calculating(): boolean {
    return this.inCalc;
  }

  /** Whether a value change runs the calculation order now. */
  private get calcOn(): boolean {
    return this.calculate !== false && this.appCalculate !== false && !this.inCalc;
  }

  /** `field.value = v` from a script. */
  setValue(state: FieldState, raw: unknown): void {
    const value = this.normalize(state, raw);
    const current = this.tools.realm.global.event as AcroEvent | undefined;
    // A Calculate script that sets its own field's value: the value it sets must win over the
    // stale event.value that Acrobat would store when the script ends (MPMB's ProfBonus does this).
    if (current?.name === 'Calculate' && stateOf(current.target) === state) {
      current.value = value;
      this.commit(state, value);
      return;
    }
    this.store(state, value, null);
  }

  /** Validate, store, calculate, Format: the part after Keystroke that typing and scripts share. */
  private store(state: FieldState, value: string | string[], source: unknown): boolean {
    let next = value;
    if (state.def.actions.V) {
      const ev = this.runEvent(state, 'V', {
        value: Array.isArray(value) ? this.tools.array(value) : value,
        willCommit: true,
        source,
      });
      if (ev && ev.rc === false) {
        // A rejected value leaves the field as it was; Format restores the shown text.
        this.runFormat(state);
        return false;
      }
      next = this.normalize(state, ev ? ev.value : value);
    }
    this.commit(state, next);
    if (this.calcOn) this.runCalculations(this.getField(state.name));
    this.runFormat(state);
    return true;
  }

  /** Runs every field in the calculation order, like Acrobat after any value change. */
  runCalculations(source: unknown = null): void {
    if (this.inCalc) return;
    this.inCalc = true;
    this.stats.calcRuns++;
    try {
      this.calcList ??= this.calcOrder
        .map((n) => this.states.get(n))
        .filter((s): s is FieldState => s !== undefined && s.def.actions.C !== undefined);
      this.calcList.forEach((state) => {
        // A field removed by an earlier calculation in this run is skipped.
        if (this.states.get(state.name) !== state) return;
        const ev = this.runEvent(state, 'C', { value: this.readValue(state), source });
        if (!ev || ev.rc === false) return;
        const value = this.normalize(state, ev.value);
        if (JSON.stringify(value) === JSON.stringify(state.value)) return;
        this.commit(state, value);
        this.runFormat(state);
      });
    } finally {
      this.inCalc = false;
    }
  }

  /** `calculateNow()`: the calculation order runs even while calculations are switched off. */
  calculateNow(): void {
    this.runCalculations(null);
  }

  // ---- What a user does (the UI and the tests call these) ----

  private stateFor(name: string): FieldState {
    const state = this.states.get(name);
    if (!state) throw new Error(`No field "${name}"`);
    return state;
  }

  focus(name: string): void {
    this.runEvent(this.stateFor(name), 'Fo');
  }

  blur(name: string): void {
    this.runEvent(this.stateFor(name), 'Bl');
  }

  /**
   * Typing: a Keystroke event with willCommit false. Returns whether the change is accepted and the
   * change as the script left it (scripts can rewrite it).
   */
  keystroke(name: string, change: string, selStart = 0, selEnd = selStart): { rc: boolean; change: string } {
    const state = this.stateFor(name);
    const ev = this.runEvent(state, 'K', {
      value: this.textOf(state),
      change,
      changeEx: change,
      selStart,
      selEnd,
      willCommit: false,
    });
    return { rc: ev?.rc !== false, change: ev ? String(ev.change ?? '') : change };
  }

  /** The user commits a typed or picked value: Keystroke (willCommit), then Validate and the rest. */
  commitInput(name: string, text: string | string[]): boolean {
    const state = this.stateFor(name);
    const ev = this.runEvent(state, 'K', {
      value: Array.isArray(text) ? this.tools.array(text) : text,
      willCommit: true,
      commitKey: COMMIT_KEY_ENTER,
    });
    if (ev && ev.rc === false) {
      this.runFormat(state);
      return false;
    }
    return this.store(state, this.normalize(state, ev ? ev.value : text), null);
  }

  /** A whole edit as a user makes it: into the field, type the text, commit, out of the field. */
  edit(name: string, text: string): boolean {
    const state = this.stateFor(name);
    this.focus(name);
    const old = this.textOf(state);
    const typed = this.keystroke(name, text, 0, old.length);
    const accepted = typed.rc && this.commitInput(name, typed.change);
    this.blur(name);
    return accepted;
  }

  /**
   * A click on a button: MouseDown, a check box or radio button changes state, then MouseUp. MPMB's
   * MouseUp scripts read the new state (`isBoxChecked`), so the change comes first.
   */
  click(name: string, widget = 0): void {
    const state = this.stateFor(name);
    this.runEvent(state, 'D');
    if (state.def.type === 'Btn' && !(state.def.flags & FF.pushButton)) {
      const on = state.def.widgets[widget]?.on ?? 'Yes';
      const isRadio = (state.def.flags & FF.radio) !== 0;
      const next = state.value === on && !isRadio ? 'Off' : on;
      this.store(state, next, null);
    }
    this.runEvent(state, 'A');
  }

  // ---- resetForm ----

  resetForm(names?: unknown): void {
    const list =
      names === undefined || names === null ? null : Array.from(Array.isArray(names) ? names : [names], String);
    const targets = list === null ? [...this.states.values()] : list.flatMap((n) => this.statesUnder(n));
    targets.forEach((state) => {
      delete state.spans;
      this.commit(state, resetValue(state));
    });
    // A reset is one change for Acrobat: calculations once, then Format of each reset field.
    if (this.calcOn) this.runCalculations(null);
    targets.forEach((state) => this.runFormat(state));
  }

  /** The field itself, or all fields below a parent name. */
  private statesUnder(name: string): FieldState[] {
    const own = this.states.get(name);
    if (own) return [own];
    const prefix = name + '.';
    return this.order.filter((n) => n.startsWith(prefix)).map((n) => this.stateFor(n));
  }

  // ---- Templates and pages ----

  /**
   * `template.spawn(nPage, bRename, bOverlay)`: a new page at nPage made from the template. With
   * renaming its fields are copies named "P<nPage>.<template>.<name>"; without, the template's own
   * fields get a widget on the new page. Pages from nPage on move one down.
   */
  spawn(template: string, nPage: number, rename: boolean, overlay: boolean): void {
    const names = this.templates[template];
    if (!names) throw new Error(`No template "${template}"`);
    const page = Math.max(0, Math.min(Number(nPage) || 0, this.numPages));
    if (!overlay) {
      this.shiftPages(page, 1);
      this.numPages++;
    }
    const prefix = `P${page}.${template}.`;
    names.forEach((original) => {
      const src = this.states.get(original);
      if (!src) return;
      // The template's own widget: the one that isn't on a real page.
      const tplWidget = src.def.widgets.filter((w) => w.page === -1)[0] ?? src.def.widgets[0];
      if (!tplWidget) return;
      const widget = { ...tplWidget, page };
      if (rename) {
        if (this.states.has(prefix + original)) return;
        const def: FieldDef = { ...structuredClone(src.def), widgets: [widget] };
        // Unverified against Acrobat: a renamed copy starts with the template field's current value.
        const copy = this.addField(prefix + original, def);
        copy.value = structuredClone(src.value);
        if (def.actions.C && !this.calcOrder.includes(copy.name)) this.calcOrder.push(copy.name);
      } else {
        src.def.widgets = [...src.def.widgets, widget];
      }
    });
    this.calcList = null;
    this.parents = null;
    this.fieldObjects.clear();
  }

  /**
   * `deletePages(nStart, nEnd)`: widgets on those pages go, fields without widgets left go with them,
   * later pages move up.
   */
  deletePages(start: number, end: number = start): void {
    const from = Math.max(0, Number(start) || 0);
    const to = Math.min(this.numPages - 1, Number(end ?? start));
    if (to < from) return;
    const count = to - from + 1;
    [...this.states.values()].forEach((state) => {
      const widgets = state.def.widgets.filter((w) => w.page < from || w.page > to);
      if (widgets.length === state.def.widgets.length) return;
      if (widgets.length) state.def.widgets = widgets;
      else this.removeField(state.name);
    });
    this.shiftPages(to + 1, -count);
    this.numPages -= count;
    this.fieldObjects.clear();
  }

  private shiftPages(from: number, by: number): void {
    this.states.forEach((state) => {
      if (!state.def.widgets.some((w) => w.page >= from)) return;
      state.def.widgets = state.def.widgets.map((w) => (w.page >= from ? { ...w, page: w.page + by } : w));
    });
  }

  /** The template a renamed spawned field came from, from its name ("P6.SSfront.x" -> SSfront). */
  static templateOf(name: string): string | undefined {
    return SPAWNED_PREFIX.exec(name)?.[2];
  }

  // ---- Snapshot (for saving and for comparing with Acrobat) ----

  snapshot(): SheetSnapshot {
    const fields: Record<string, FieldDef> = {};
    this.order.forEach((name) => {
      const state = this.stateFor(name);
      const def: FieldDef = structuredClone(state.def);
      const empty = resetValue({ ...state, def: { ...state.def, defaultValue: undefined } });
      if (JSON.stringify(state.value) === JSON.stringify(empty) && def.value === undefined) delete def.value;
      else def.value = structuredClone(state.value);
      fields[name] = def;
    });
    return {
      fields,
      calcOrder: [...this.calcOrder],
      numPages: this.numPages,
      templates: this.templates,
      outline: structuredClone(this.bookmarkRoot.children),
      info: { ...this.info },
    };
  }
}
