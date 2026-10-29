// Acrobat's Field object. MPMB's scripts get one from `getField(name)` and read and write its
// properties; the state behind it lives in the document (FieldState), so that every Field object for
// a name shows the same value. Acrobat keeps handing out the same object per name, and MPMB relies on
// that: it stores its own properties on fields (`remVal`, `setValPrepared`) and reads them later.
import type { FieldDef, Widget } from './types.ts';
import { DISPLAY, FF, displayFromFlags, flagsForDisplay } from './types.ts';

/** A rich text run, as Acrobat's `richValue` hands them out (text plus styling keys). */
export type Span = Record<string, unknown> & { text?: string };

/** The live state of one field. */
export interface FieldState {
  name: string;
  /** A private copy of the field's definition; widgets, flags, scripts and items change at run time. */
  def: FieldDef;
  /** The value as stored: text, a check box state ("Off" or its export value), or several items. */
  value: string | string[];
  /** The text to show, made by the Format script; undefined without one. */
  formatted?: string;
  /** Rich text set by a script, and the result of a Format script on rich text. */
  spans?: Span[];
  formattedSpans?: Span[];
  /** Colours, fonts and other looks MPMB sets. Kept and handed back; drawing them is the UI's job. */
  style: Record<string, unknown>;
}

/** What a Field needs from the document it belongs to. */
export interface FieldOwner {
  /** Sets a value the way a script's `field.value = x` does (Validate, calculations, Format). */
  setValue(state: FieldState, value: unknown): void;
  /** Field value as scripts see it: numbers for numeric text. */
  readValue(state: FieldState): unknown;
  getField(name: string): unknown;
  setAction(state: FieldState, trigger: string, script: string): void;
  calcOrderIndex(state: FieldState): number;
  setCalcOrderIndex(state: FieldState, index: number): void;
  /** Arrays and objects for the scripts, made in their realm. */
  array<T>(items: readonly T[]): T[];
  copy<T>(value: T): T;
}

/** Defaults for the looks MPMB reads before it has set them (Acrobat colour arrays). */
const STYLE_DEFAULTS: Record<string, unknown> = {
  fillColor: ['T'],
  bgColor: ['T'],
  borderColor: ['T'],
  strokeColor: ['T'],
  textColor: ['G', 0],
  fgColor: ['G', 0],
  textFont: 'Helvetica',
  textSize: 0,
  lineWidth: 1,
  borderStyle: 'solid',
  alignment: 'left',
  buttonPosition: 0,
  highlight: 'none',
};

const FLAG_PROPERTIES: Record<string, number> = {
  readonly: FF.readonly,
  required: FF.required,
  multiline: FF.multiline,
  password: FF.password,
  doNotScroll: FF.doNotScroll,
  doNotSpellCheck: FF.doNotSpellCheck,
  comb: FF.comb,
  richText: FF.richText,
  editable: FF.edit,
};

/** Text of a rich text value: the spans' text joined. */
export const spansText = (spans: readonly Span[]): string => spans.map((s) => String(s.text ?? '')).join('');

const OFF = 'Off';

/** The private link from a Field object to its state; scripts can't see it. */
const STATE = Symbol('state');
const OWNER = Symbol('owner');
const WIDGET = Symbol('widget');

export function stateOf(field: unknown): FieldState | undefined {
  return field instanceof Field ? field[STATE] : undefined;
}

export class Field {
  [STATE]: FieldState;
  [OWNER]: FieldOwner;
  /** Which widget this object stands for ("Name.1" is widget 1), or null for the whole field. */
  [WIDGET]: number | null;

  constructor(owner: FieldOwner, state: FieldState, widget: number | null) {
    this[OWNER] = owner;
    this[STATE] = state;
    this[WIDGET] = widget;
  }

  get name(): string {
    return this[WIDGET] === null ? this[STATE].name : `${this[STATE].name}.${this[WIDGET]}`;
  }

  get type(): string {
    const { def } = this[STATE];
    if (def.type === 'Btn') {
      if (def.flags & FF.pushButton) return 'button';
      return def.flags & FF.radio ? 'radiobutton' : 'checkbox';
    }
    if (def.type === 'Ch') return def.flags & FF.combo ? 'combobox' : 'listbox';
    return def.type === 'Sig' ? 'signature' : 'text';
  }

  get value(): unknown {
    return this[OWNER].readValue(this[STATE]);
  }
  set value(v: unknown) {
    this[OWNER].setValue(this[STATE], v);
  }
  get valueAsString(): string {
    const v = this[STATE].value;
    return Array.isArray(v) ? v.join(',') : v;
  }

  get defaultValue(): unknown {
    const dv = this[STATE].def.defaultValue;
    return dv ?? (this.type === 'checkbox' || this.type === 'radiobutton' ? OFF : '');
  }
  set defaultValue(v: unknown) {
    this[STATE].def.defaultValue = String(v);
  }

  /** Widgets this object stands for: one ("Name.1") or all of them. */
  private widgets(): FieldDef['widgets'] {
    const all = this[STATE].def.widgets;
    const i = this[WIDGET];
    if (i === null) return all;
    const w = all[i];
    return w ? [w] : [];
  }
  /** Replaces the widgets this object stands for with changed copies. */
  private updateWidgets(change: (w: Widget) => Partial<Widget>): void {
    const def = this[STATE].def;
    const only = this[WIDGET];
    def.widgets = def.widgets.map((w, i) => (only === null || only === i ? { ...w, ...change(w) } : w));
  }

  get display(): number {
    const first = this.widgets()[0];
    return first ? displayFromFlags(first.flags) : DISPLAY.visible;
  }
  set display(d: number) {
    this.updateWidgets((w) => ({ flags: flagsForDisplay(w.flags, Number(d)) }));
  }
  /** Old Acrobat property, still used: true when hidden. */
  get hidden(): boolean {
    return this.display === DISPLAY.hidden;
  }
  set hidden(h: boolean) {
    this.display = h ? DISPLAY.hidden : DISPLAY.visible;
  }

  get userName(): string {
    return this[STATE].def.userName ?? '';
  }
  set userName(s: string) {
    this[STATE].def.userName = String(s);
  }
  get submitName(): string {
    return this[STATE].def.submitName ?? '';
  }
  set submitName(s: string) {
    this[STATE].def.submitName = String(s);
  }

  /** A page index, or an array of them for a field with several widgets (-1: on a hidden template). */
  get page(): number | number[] {
    const pages = this.widgets().map((w) => w.page);
    return pages.length === 1 ? (pages[0] ?? -1) : this[OWNER].array(pages);
  }
  get rect(): number[] {
    return this[OWNER].array(this.widgets()[0]?.rect ?? []);
  }
  set rect(r: number[]) {
    const rect = Array.from(r, Number);
    this.updateWidgets(() => ({ rect: [...rect] }));
  }

  get charLimit(): number {
    return this[STATE].def.maxLen ?? 0;
  }
  set charLimit(n: number) {
    this[STATE].def.maxLen = Number(n);
  }

  // ---- Choice items ----
  // The PDF stores items as [export value, display text] or a plain string; the JS API speaks of
  // [display text, export value].

  private items(): [string, string][] {
    return (this[STATE].def.options ?? []).map((o) => (Array.isArray(o) ? [o[1], o[0]] : [o, o]));
  }
  private setItemList(items: [string, string][]): void {
    this[STATE].def.options = items.map(([shown, exported]) => (shown === exported ? shown : [exported, shown]));
  }
  get numItems(): number {
    return this.items().length;
  }
  getItemAt(index: number, exportValue = true): string | null {
    const item = this.items()[index];
    if (!item) return null;
    return exportValue ? item[1] : item[0];
  }
  setItems(list: unknown[]): void {
    this.setItemList(
      Array.from(list, (o): [string, string] => {
        if (!Array.isArray(o)) return [String(o), String(o)];
        return [String(o[0]), String(o[1] ?? o[0])];
      }),
    );
  }
  clearItems(): void {
    this[STATE].def.options = [];
  }
  insertItemAt(name: string, exported?: string, index = 0): void {
    const items = this.items();
    const item: [string, string] = [String(name), String(exported ?? name)];
    const at = index < 0 || index > items.length ? items.length : index;
    this.setItemList([...items.slice(0, at), item, ...items.slice(at)]);
  }
  deleteItemAt(index?: number): void {
    const items = this.items();
    const at = index ?? this.currentValueIndices;
    this.setItemList(items.filter((_, i) => i !== at));
  }
  get exportValues(): string[] {
    return this[OWNER].array(this[STATE].def.widgets.map((w) => w.on ?? ''));
  }
  set exportValues(values: string[]) {
    const list = Array.from(values, String);
    const def = this[STATE].def;
    def.widgets = def.widgets.map((w, i) => ({ ...w, on: list[i] ?? w.on }));
  }
  /** The selected item's index, -1 for none (or a typed-in value). */
  get currentValueIndices(): number {
    const v = this[STATE].value;
    return this.items().findIndex((it) => it[1] === v);
  }
  set currentValueIndices(index: number | number[]) {
    const i = Array.isArray(index) ? index[0] : index;
    const item = i === undefined ? undefined : this.items()[i];
    if (item) this[OWNER].setValue(this[STATE], item[1]);
  }

  // ---- Check boxes and radio buttons ----

  private onValue(widget: number): string {
    return this[STATE].def.widgets[widget]?.on ?? this[STATE].def.widgets[0]?.on ?? 'Yes';
  }
  checkThisBox(widget = 0, check = true): void {
    const on = this.onValue(Number(widget));
    if (check) this[OWNER].setValue(this[STATE], on);
    else if (this[STATE].value === on || this.type === 'checkbox') this[OWNER].setValue(this[STATE], OFF);
  }
  /** Numbers, not booleans: the sheet compares `isBoxChecked(0) === 1`. */
  isBoxChecked(widget = 0): number {
    const v = this[STATE].value;
    return v !== OFF && v !== '' && v === this.onValue(Number(widget)) ? 1 : 0;
  }
  isDefaultChecked(widget = 0): number {
    return this[STATE].def.defaultValue === this.onValue(Number(widget)) ? 1 : 0;
  }
  defaultIsChecked(widget = 0, check = true): void {
    this[STATE].def.defaultValue = check ? this.onValue(Number(widget)) : OFF;
  }

  // ---- Rich text ----

  get richValue(): Span[] {
    const s = this[STATE];
    return this[OWNER].copy(s.spans ?? [{ text: this.valueAsString }]);
  }
  set richValue(spans: Span[]) {
    const list = Array.from(spans ?? [], (span) => ({ ...span }));
    this[STATE].spans = list;
    this[OWNER].setValue(this[STATE], spansText(list));
  }

  // ---- Scripts and calculation order ----

  setAction(trigger: string, script: string): void {
    this[OWNER].setAction(this[STATE], trigger, script);
  }
  get calcOrderIndex(): number {
    return this[OWNER].calcOrderIndex(this[STATE]);
  }
  set calcOrderIndex(index: number) {
    this[OWNER].setCalcOrderIndex(this[STATE], Number(index));
  }

  getArray(): Field[] {
    return this[OWNER].array([this]);
  }

  // ---- Presentation that has no effect without Acrobat's page view ----

  setFocus(): void {}
  buttonSetIcon(): void {}
  buttonGetIcon(): null {
    return null;
  }
  buttonImportIcon(): number {
    return 0;
  }
  buttonSetCaption(caption: unknown): void {
    this[STATE].style.caption = String(caption ?? '');
  }
  buttonGetCaption(): string {
    return String(this[STATE].style.caption ?? '');
  }
  setLock(): boolean {
    return false;
  }
  getLock(): null {
    return null;
  }
  signatureInfo(): Record<string, never> {
    return {};
  }
  browseForFileToSubmit(): void {}
}

// Flag-backed properties (readonly, multiline, ...) and stored looks (fillColor, textSize, ...).
Object.entries(FLAG_PROPERTIES).forEach(([prop, bit]) => {
  Object.defineProperty(Field.prototype, prop, {
    get(this: Field): boolean {
      return (this[STATE].def.flags & bit) !== 0;
    },
    set(this: Field, on: unknown) {
      const def = this[STATE].def;
      def.flags = on ? def.flags | bit : def.flags & ~bit;
    },
    configurable: true,
  });
});
Object.entries(STYLE_DEFAULTS).forEach(([prop, fallback]) => {
  Object.defineProperty(Field.prototype, prop, {
    get(this: Field): unknown {
      return this[OWNER].copy(prop in this[STATE].style ? this[STATE].style[prop] : fallback);
    },
    set(this: Field, v: unknown) {
      this[STATE].style[prop] = JSON.parse(JSON.stringify(v ?? null)) as unknown;
    },
    configurable: true,
  });
});

/** Sets a property on each field, as a script assigning to the parent would. */
function setOnAll(fields: readonly Field[], prop: string, v: unknown): void {
  fields.forEach((f) => Reflect.set(f, prop, v));
}

/**
 * A name that is only the start of other names ("BlueText.Attack" for "BlueText.Attack.1.Weight")
 * is a parent in Acrobat's field tree. Setting display or readonly on it sets all its fields.
 */
export class ParentField {
  readonly name: string;
  private readonly kids: () => Field[];
  private readonly owner: FieldOwner;

  constructor(owner: FieldOwner, name: string, kids: () => Field[]) {
    this.owner = owner;
    this.name = name;
    this.kids = kids;
  }
  getArray(): Field[] {
    return this.owner.array(this.kids());
  }
  get type(): string {
    return this.kids()[0]?.type ?? 'text';
  }
  get value(): unknown {
    return this.kids()[0]?.value ?? '';
  }
  set value(v: unknown) {
    setOnAll(this.kids(), 'value', v);
  }
  get display(): number {
    return this.kids()[0]?.display ?? DISPLAY.visible;
  }
  set display(d: number) {
    setOnAll(this.kids(), 'display', d);
  }
  get page(): number | number[] {
    return this.kids()[0]?.page ?? -1;
  }
  get userName(): string {
    return this.kids()[0]?.userName ?? '';
  }
  set userName(s: string) {
    setOnAll(this.kids(), 'userName', s);
  }
  get submitName(): string {
    return this.kids()[0]?.submitName ?? '';
  }
  set submitName(s: string) {
    setOnAll(this.kids(), 'submitName', s);
  }
}
// The parent passes flags and looks on to all its fields, like Acrobat.
[...Object.keys(FLAG_PROPERTIES), ...Object.keys(STYLE_DEFAULTS)].forEach((prop) => {
  Object.defineProperty(ParentField.prototype, prop, {
    get(this: ParentField): unknown {
      return (this.getArray()[0] as unknown as Record<string, unknown> | undefined)?.[prop];
    },
    set(this: ParentField, v: unknown) {
      setOnAll(this.getArray(), prop, v);
    },
    configurable: true,
  });
});

export function newFieldState(name: string, def: FieldDef): FieldState {
  const isToggle = def.type === 'Btn' && !(def.flags & FF.pushButton);
  const fallback = isToggle ? OFF : '';
  return { name, def, value: def.value ?? def.defaultValue ?? fallback, style: {} };
}

/** The value a reset puts back: the default value, or empty (check boxes: Off). */
export function resetValue(state: FieldState): string | string[] {
  const isToggle = state.def.type === 'Btn' && !(state.def.flags & FF.pushButton);
  return state.def.defaultValue ?? (isToggle ? OFF : '');
}
