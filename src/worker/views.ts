// What the page needs to draw each field, and which of those changed since the page last heard. The
// worker sends only the changes after every action: a whole sheet is 4,345 fields, most of which
// one edit leaves alone. A field changes in many ways (value, Format text, hidden, read-only,
// tooltip, colours, size), so the views are compared as a whole instead of tracking each setter.
import type { SheetDocument } from '../engine/document.ts';
import type { FieldState } from '../engine/field.ts';
import type { PdfFieldType, Widget } from '../engine/types.ts';

export interface FieldView {
  type: PdfFieldType;
  value: string | string[];
  /** The text to show where a Format script made one ("+3" for a modifier stored as 3). */
  text?: string;
  /** Field flags (/Ff): read-only, multiline, combo and so on. */
  flags: number;
  widgets: Widget[];
  /** The tooltip. */
  userName?: string;
  options?: (string | [string, string])[];
  maxLen?: number;
  /** Colours and fonts the scripts set (Acrobat colour arrays). */
  style: Record<string, unknown>;
}

export type FieldViews = Record<string, FieldView>;

function viewOf(state: FieldState): FieldView {
  const { def } = state;
  const view: FieldView = {
    type: def.type,
    value: state.value,
    flags: def.flags,
    widgets: def.widgets,
    style: state.style,
  };
  if (state.formatted !== undefined) view.text = state.formatted;
  if (def.userName !== undefined) view.userName = def.userName;
  if (def.options !== undefined) view.options = def.options;
  if (def.maxLen !== undefined) view.maxLen = def.maxLen;
  // A deep copy: the engine keeps changing its state objects, the view must not change with them.
  return structuredClone(view);
}

export function viewsOf(doc: SheetDocument): FieldViews {
  const views: FieldViews = {};
  doc.states.forEach((state, name) => {
    views[name] = viewOf(state);
  });
  return views;
}

/** The fields that are new or look different, and the names of fields that are gone. */
export function changedViews(before: FieldViews, after: FieldViews): { changed: FieldViews; removed: string[] } {
  const changed: FieldViews = {};
  Object.entries(after).forEach(([name, view]) => {
    const old = before[name];
    if (!old || JSON.stringify(old) !== JSON.stringify(view)) changed[name] = view;
  });
  const removed = Object.keys(before).filter((name) => !(name in after));
  return { changed, removed };
}
