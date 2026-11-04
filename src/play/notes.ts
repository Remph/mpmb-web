// The sheet's extra notes pages (M6.5): MPMB's template "ASnotes", a page with a title and two columns,
// which the player adds and removes with the page's menu button (MakeNotesMenu_NotesOptions). Each page's
// fields carry a prefix ("P5.ASnotes."), and MPMB lists the prefixes in "Template.extras.ASnotes"
// (",P5.ASnotes.", the first entry empty). MPMB itself writes some texts there too (a paladin's oath).
import { valueOf } from './read.ts';
import type { FieldViews } from '../worker/views.ts';

const NOTES_PAGES_FIELD = 'Template.extras.ASnotes';
/** MPMB's default title of a notes page, which the app shows in the page's language. */
export const DEFAULT_NOTES_TITLE = 'Notes';

/** A notes page's fields, by its prefix ("" for the template page's own fields). */
export const notesFields = (prefix: string) => ({
  /** The page's heading. Read-only in Acrobat; the app keeps the player's name for the page here. */
  title: `${prefix}Text.Header.Notes2`,
  left: `${prefix}Notes.Left`,
  right: `${prefix}Notes.Right`,
  /** The page's menu button: "add page" and "remove page" (MPMB's own menu answers). */
  menu: `${prefix}Notes.Options`,
});

export interface NotesPage {
  prefix: string;
  /** As stored; MPMB's default is "Notes". */
  title: string;
  left: string;
  right: string;
}

export function readNotesPages(fields: FieldViews): NotesPage[] {
  return valueOf(fields, NOTES_PAGES_FIELD)
    .split(',')
    .filter((prefix) => prefix !== '' && notesFields(prefix).left in fields)
    .map((prefix) => {
      const f = notesFields(prefix);
      return {
        prefix,
        title: valueOf(fields, f.title).trim(),
        left: valueOf(fields, f.left),
        right: valueOf(fields, f.right),
      };
    });
}

/**
 * The button whose menu adds a page: the last page's, or, with no page left, the template's own one,
 * whose fields stay in the sheet (MPMB adds the first page with it too).
 */
export function addPageButton(pages: NotesPage[]): string {
  return notesFields(pages[pages.length - 1]?.prefix ?? '').menu;
}

/** MPMB's menu answers on a notes page's button. */
export const ADD_PAGE = 'add page';
export const REMOVE_PAGE = 'remove page';
