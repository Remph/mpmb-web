// The widgets of pages spawned from templates, and the repair of spell sheet pages the engine made before
// 2026-11, which Acrobat showed with class headers over spell rows. Two bugs made those:
//
// - A field can have widgets on several template pages, at other places: MPMB's spell sheet rows sit on
//   both SSfront and SSmore, and SSmore's start about 120 points higher, as that page has no header block.
//   Spawning a template copies the widgets of that template only; the engine copied a field's first
//   template widget, whichever template it was on, so every SSmore page had its rows at SSfront's places.
// - Acrobat's `field.rect` lists the upper y before the lower one; the engine handed out the PDF's order
//   (lower y first). MPMB moves a header or divider so that its upper y meets its row's (SetSpellSheetElement
//   in FunctionsSpells.js), so in the engine each one met its row at the bottom and stood up to 31 points
//   too high, over the rows above it.
//
// `repairSpawnedWidgets` puts the widgets of such pages, in characters saved before, where Acrobat has them.
import type { FieldDef, SheetSnapshot, Widget } from './types.ts';

/**
 * The widgets of a field on the page of `template`. Sheet data read before the reader noted templates has
 * no `template` on its widgets; there it is the first widget off the pages, as before.
 */
export function templateWidgets(widgets: readonly Widget[], template: string): Widget[] {
  const offPage = widgets.filter((w) => w.page === -1);
  if (offPage.some((w) => w.template !== undefined)) return offPage.filter((w) => w.template === template);
  const first = offPage[0] ?? widgets[0];
  return first ? [first] : [];
}

/** "P7.SSmore.spells.name.3": spawned from template SSmore with renaming, original "spells.name.3". */
// Try it: https://regex101.com/?regex=%5E(P%5Cd%2B%5C.(%5B%5E.%5D%2B)%5C.)(.%2B)%24&testString=P7.SSmore.spells.name.3
const SPAWNED = /^(P\d+\.([^.]+)\.)(.+)$/;

/** Rects as read-sheet.ts rounds them: to hundredths of a point. */
const RECT_DECIMALS = 100;
const round = (n: number): number => Math.round(n * RECT_DECIMALS) / RECT_DECIMALS;
const sameRect = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((n, i) => round(n) === round(b[i] ?? NaN));
/** A widget's rect is [x1, y1, x2, y2] with y2 the top. */
const TOP = 3;
const Y_ENTRIES = new Set([1, TOP]);

/**
 * The sheet with the widgets of renamed spawned pages where Acrobat has them (see the top of this file):
 * each field on its own template's place, and each spell sheet header, divider and glossary at the top of
 * its row. `repaired` names the fields that changed; a sheet Acrobat made has none.
 */
export function repairSpawnedWidgets(
  blank: SheetSnapshot,
  sheet: SheetSnapshot,
): { sheet: SheetSnapshot; repaired: string[] } {
  const repaired = new Set<string>();
  const fields: Record<string, FieldDef> = { ...sheet.fields };
  const copiedWrong = oldPages(blank, sheet);
  // Spell sheet headers and dividers MPMB placed: it showed or hid each of their fields itself.
  const inUse = new Set(spellSheetElements(sheet.fields).flatMap((e) => e.members));
  Object.entries(sheet.fields).forEach(([name, def]) => {
    const widgets = ownTemplateWidgets(blank, name, def, copiedWrong, inUse);
    if (!widgets) return;
    fields[name] = { ...def, widgets };
    repaired.add(name);
  });
  spellSheetElements(fields).forEach(({ members, anchor, row }) => {
    const dy = (fields[row]?.widgets[0]?.rect[TOP] ?? 0) - (fields[anchor]?.widgets[0]?.rect[TOP] ?? 0);
    if (round(dy) === 0) return;
    members.forEach((name) => {
      const def = fields[name];
      if (!def) return;
      const widgets = def.widgets.map((w) => ({
        ...w,
        rect: w.rect.map((n, i) => round(Y_ENTRIES.has(i) ? n + dy : n)),
      }));
      fields[name] = { ...def, widgets };
      repaired.add(name);
    });
  });
  return { sheet: repaired.size ? { ...sheet, fields } : sheet, repaired: [...repaired] };
}

/** A renamed spawned field with one widget, and the template widgets it compares with. */
interface Spawned {
  prefix: string;
  widget: Widget;
  /** Its own template's widgets for the field. */
  own: Widget[];
  /** What the engine copied before: the field's first widget off the pages, on whichever template. */
  copied: Widget;
}

function spawned(blank: SheetSnapshot, name: string, def: FieldDef): Spawned | undefined {
  const [, prefix = '', template = '', original = ''] = SPAWNED.exec(name) ?? [];
  const base = blank.fields[original];
  if (!base || !blank.templates[template]?.includes(original)) return undefined;
  const own = templateWidgets(base.widgets, template);
  const copied = base.widgets.filter((w) => w.page === -1)[0];
  const widget = def.widgets[0];
  if (!own.length || !copied?.template || !widget || def.widgets.length !== 1 || widget.page < 0) return undefined;
  return { prefix, widget, own, copied };
}

/**
 * The pages ("P7.SSmore.") the engine spawned with another template's widgets: a field there sits where
 * another template has it, not its own. On such a page, a field MPMB moved moved from that other place too.
 */
function oldPages(blank: SheetSnapshot, sheet: SheetSnapshot): Set<string> {
  const pages = new Set<string>();
  Object.entries(sheet.fields).forEach(([name, def]) => {
    const s = spawned(blank, name, def);
    const ownFirst = s?.own[0];
    if (!s || !ownFirst || pages.has(s.prefix) || sameRect(s.copied.rect, ownFirst.rect)) return;
    if (sameRect(s.widget.rect, s.copied.rect)) pages.add(s.prefix);
  });
  return pages;
}

/**
 * The widgets a renamed spawned field gets from its own template, when the engine copied another template's
 * widget for it or only one of its template's several: undefined when it has them, or isn't such a field.
 * A field moved since keeps how far it moved.
 */
function ownTemplateWidgets(
  blank: SheetSnapshot,
  name: string,
  def: FieldDef,
  copiedWrong: Set<string>,
  inUse: Set<string>,
): Widget[] | undefined {
  const s = spawned(blank, name, def);
  const ownFirst = s?.own[0];
  if (!s || !ownFirst) return undefined;
  const { widget, own, copied } = s;
  const otherTemplate = copied.template !== SPAWNED.exec(name)?.[2];
  if (otherTemplate ? !copiedWrong.has(s.prefix) : own.length === 1) return undefined;
  // A field the engine copied right that has moved since: where its other widgets go is unknown.
  if (!otherTemplate && !sameRect(widget.rect, copied.rect)) return undefined;
  const rect = widget.rect.map((n, i) => round(n + (ownFirst.rect[i] ?? 0) - (copied.rect[i] ?? 0)));
  // Shown or hidden as the other template has it (SSfront shows its first header, SSmore hides it), unless
  // MPMB changed that since or uses the field.
  const flags = otherTemplate && widget.flags === copied.flags && !inUse.has(name) ? ownFirst.flags : widget.flags;
  // The template's other widgets for this field, shown or hidden as the field is.
  const shown = widget.flags !== copied.flags;
  const rest = own
    .slice(1)
    .map(({ template: _, ...w }) => ({ ...w, page: widget.page, flags: shown ? widget.flags : w.flags }));
  const widgets = [{ ...widget, rect, flags }, ...rest];
  // Places that are the same on both templates (the page's footer) need nothing.
  return JSON.stringify(widgets) === JSON.stringify(def.widgets) ? undefined : widgets;
}

/**
 * The class headers, level dividers and glossaries on spawned spell sheet pages, each with its fields, the
 * field MPMB lines up with the row (the first it moves) and that row. MPMB notes the row in the submitName
 * of one field of each ("P7.SSmore.spells.remember.31") and leaves the first header and divider of SSfront
 * where the template has them, above row 0 (SetSpellSheetElement).
 */
function spellSheetElements(fields: Record<string, FieldDef>): { members: string[]; anchor: string; row: string }[] {
  // Matches "P7.SSmore.spellshead.Text.header.2" (header 2), "P7.SSmore.spellsdiv.Text.1" (divider 1) and
  // "P7.SSmore.spellsgloss.Image": the fields that note the row.
  // Try it: https://regex101.com/?regex=%5E(P%5Cd%2B%5C.(%5B%5E.%5D%2B)%5C.)(%3F%3Aspellshead%5C.Text%5C.header%5C.(%5Cd%2B)%7Cspellsdiv%5C.Text%5C.(%5Cd%2B)%7Cspellsgloss%5C.Image)%24&testString=P7.SSmore.spellshead.Text.header.2
  const NOTED = /^(P\d+\.([^.]+)\.)(?:spellshead\.Text\.header\.(\d+)|spellsdiv\.Text\.(\d+)|spellsgloss\.Image)$/;
  const names = Object.keys(fields);
  return Object.entries(fields).flatMap(([name, def]) => {
    const [, prefix = '', template = '', header, divider] = NOTED.exec(name) ?? [];
    if (!prefix) return [];
    const row = def.submitName ?? '';
    // The row's field, on the same page: "P7.SSmore.spells.remember.31".
    if (!row.startsWith(`${prefix}spells.remember.`) || !fields[row]) return [];
    const suffix = header ?? divider;
    if (template === 'SSfront' && suffix === '0') return [];
    if (suffix === undefined) return [{ members: [name], anchor: name, row }];
    // A header's fields: "spellshead.<part>.2" and "BlueText.spellshead.<part>.2"; a divider's: "spellsdiv.<part>.1".
    const ofIt = header
      ? (n: string): boolean =>
          (n.startsWith(`${prefix}spellshead.`) || n.startsWith(`${prefix}BlueText.spellshead.`)) &&
          n.endsWith(`.${header}`)
      : (n: string): boolean => n.startsWith(`${prefix}spellsdiv.`) && n.endsWith(`.${divider}`);
    // The Printer Friendly sheet's divider lines up its picture ("spellsdiv.Image.1") first.
    const pfDivider = `${prefix}spellsdiv.Image.${divider}`;
    const anchor = header ? `${prefix}spellshead.Image.Header.Left.${header}` : fields[pfDivider] ? pfDivider : name;
    return fields[anchor] ? [{ members: names.filter(ofIt), anchor, row }] : [];
  });
}
