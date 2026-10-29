// What the engine knows about the sheet, read from a PDF form: the same shape for the blank sheet
// that ships with the app and for a filled character sheet that a player imports.

/**
 * Acrobat's field event triggers, by the key the PDF's additional-actions dictionary (/AA) uses, with
 * the names `field.setAction` takes.
 */
export const TRIGGERS = {
  K: 'Keystroke',
  V: 'Validate',
  C: 'Calculate',
  F: 'Format',
  A: 'MouseUp',
  D: 'MouseDown',
  E: 'MouseEnter',
  X: 'MouseExit',
  Fo: 'OnFocus',
  Bl: 'OnBlur',
} as const;
export type Trigger = keyof typeof TRIGGERS;

/** `event.name` for each trigger: Acrobat names the events differently from `setAction`'s triggers. */
export const EVENT_NAMES: Record<Trigger, string> = {
  K: 'Keystroke',
  V: 'Validate',
  C: 'Calculate',
  F: 'Format',
  A: 'Mouse Up',
  D: 'Mouse Down',
  E: 'Mouse Enter',
  X: 'Mouse Exit',
  Fo: 'Focus',
  Bl: 'Blur',
};
export type TriggerName = (typeof TRIGGERS)[Trigger];

/** PDF field types: text, button (push, check, radio), choice (combo, list), signature. */
export type PdfFieldType = 'Tx' | 'Btn' | 'Ch' | 'Sig';

/** One widget (the visible box) of a field. A field can have several, on different pages. */
export interface Widget {
  /** Page index, or -1 for a widget on a hidden template page. */
  page: number;
  /** [x1, y1, x2, y2] in PDF points. MPMB moves and resizes some fields through it. */
  rect: number[];
  /** Annotation flags (/F); `display` (visible, hidden, noPrint, noView) lives here. */
  flags: number;
  /** Check boxes and radio buttons: the export value this widget has when it is on. */
  on?: string;
}

export interface FieldDef {
  type: PdfFieldType;
  /** Field flags (/Ff): read-only, multiline, combo box, push button and so on. */
  flags: number;
  /** Scripts by trigger. MPMB sets some at run time, so a filled sheet can differ from the blank one. */
  actions: Partial<Record<Trigger, string>>;
  value?: string | string[];
  defaultValue?: string | string[];
  /** Rich text value (/RV), XHTML. */
  richValue?: string;
  /** Tooltip (/TU), Acrobat's `userName`. MPMB writes explanations there. */
  userName?: string;
  /** Export name (/TM), Acrobat's `submitName`. MPMB keeps data there, often `toSource()` strings. */
  submitName?: string;
  maxLen?: number;
  /** Choice items as the PDF stores them: a string, or an [export value, display text] pair. */
  options?: (string | [string, string])[];
  widgets: Widget[];
}

export interface Bookmark {
  name: string;
  children: Bookmark[];
  /** The script run when the bookmark is clicked; MPMB's bookmarks are its menu. */
  action?: string;
  open?: boolean;
  /** 0 normal, 1 italic, 2 bold, 3 both. */
  style?: number;
  color?: unknown[];
}

export interface SheetSnapshot {
  /** Every terminal field by its full name, in the PDF's order (Acrobat's `getNthFieldName`). */
  fields: Record<string, FieldDef>;
  /** The calculation order (/CO): fields with a Calculate script, in the order Acrobat runs them. */
  calcOrder: string[];
  numPages: number;
  /** Template name to the names of the fields on its (hidden) page. */
  templates: Record<string, string[]>;
  outline: Bookmark[];
  /** Document info, including MPMB's own entries (SheetVersion, SheetType, ...). */
  info: Record<string, string>;
}

/* eslint-disable ts-patterns/no-magic-numbers -- the flag tables below are bit positions from the PDF specification */

/** Field flag bits (/Ff), 1-based bit positions from the PDF specification. */
export const FF = {
  readonly: 1 << 0,
  required: 1 << 1,
  multiline: 1 << 12,
  password: 1 << 13,
  noToggleToOff: 1 << 14,
  radio: 1 << 15,
  pushButton: 1 << 16,
  combo: 1 << 17,
  edit: 1 << 18,
  doNotSpellCheck: 1 << 22,
  doNotScroll: 1 << 23,
  comb: 1 << 24,
  richText: 1 << 25,
} as const;

/** Annotation flag bits (/F). */
export const AF = {
  invisible: 1 << 0,
  hidden: 1 << 1,
  print: 1 << 2,
  noView: 1 << 5,
} as const;

/** Acrobat's `display` constants. */
export const DISPLAY = { visible: 0, hidden: 1, noPrint: 2, noView: 3 } as const;

/* eslint-enable ts-patterns/no-magic-numbers */
export type Display = (typeof DISPLAY)[keyof typeof DISPLAY];

export function displayFromFlags(flags: number): Display {
  if (flags & AF.hidden) return DISPLAY.hidden;
  if (!(flags & AF.print)) return DISPLAY.noPrint;
  if (flags & AF.noView) return DISPLAY.noView;
  return DISPLAY.visible;
}

/** The bits that `display` sets for each value; the other annotation flags stay as they are. */
const DISPLAY_BITS: Record<Display, number> = {
  [DISPLAY.visible]: AF.print,
  [DISPLAY.hidden]: AF.hidden | AF.print,
  [DISPLAY.noPrint]: 0,
  [DISPLAY.noView]: AF.print | AF.noView,
};

/** The annotation flags for a `display` value, keeping the unrelated bits. Unknown values mean visible. */
export function flagsForDisplay(flags: number, display: number): number {
  const rest = flags & ~(AF.hidden | AF.print | AF.noView);
  return rest | (DISPLAY_BITS[display as Display] ?? AF.print);
}
