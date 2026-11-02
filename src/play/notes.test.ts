/* eslint-disable ts-patterns/no-magic-numbers -- page counts are the test data */
// The extra notes pages on the engine: MPMB's own template pages, added and removed through the page's
// menu button as in Acrobat.
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { ScriptedHost } from '../../test/hosts.ts';
import { viewsOf } from '../worker/views.ts';
import { DEFAULT_NOTES_TITLE, addPageButton, notesFields, readNotesPages } from './notes.ts';

describe('extra notes pages', () => {
  it("reads the paladin's page, where MPMB put the oath's tenets", () => {
    const pages = readNotesPages(viewsOf(openSheet(referenceSheet('paladin8-warlock2')).doc));
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ prefix: 'P5.ASnotes.', title: DEFAULT_NOTES_TITLE, right: '' });
    expect(pages[0]?.left).toContain('Tenets of the Oath of Devotion');
  });

  it("adds a page through MPMB's menu, and removes it after MPMB's question", () => {
    const host = new ScriptedHost({
      menus: [["Add extra 'Notes' page"], ["Remove this 'Notes' page"]],
      alerts: { 'You are about to remove': 4 },
    });
    const engine = openSheet(undefined, host);
    let pages = readNotesPages(viewsOf(engine.doc));
    expect(pages).toHaveLength(1);
    engine.click(addPageButton(pages));
    pages = readNotesPages(viewsOf(engine.doc));
    expect(pages).toHaveLength(2);
    const added = pages[1]!;
    expect(added.title).toBe(DEFAULT_NOTES_TITLE);

    // The title and the columns are the page's own fields.
    engine.edit(notesFields(added.prefix).title, 'Session log');
    engine.edit(notesFields(added.prefix).left, 'Met the #Harbourmaster#.');
    pages = readNotesPages(viewsOf(engine.doc));
    expect(pages[1]).toMatchObject({ title: 'Session log', left: 'Met the #Harbourmaster#.' });
    expect(pages[0]?.title).toBe(DEFAULT_NOTES_TITLE);

    engine.click(notesFields(added.prefix).menu);
    expect(host.asked.some((a) => a.kind === 'alert' && a.what.includes('You are about to remove'))).toBe(true);
    expect(readNotesPages(viewsOf(engine.doc))).toHaveLength(1);
  });

  it('with every page removed, the template button adds the first one again', () => {
    const host = new ScriptedHost({
      menus: [["Remove this 'Notes' page"], ["Add extra 'Notes' page"]],
      alerts: { 'You are about to remove': 4 },
    });
    const engine = openSheet(undefined, host);
    engine.click(notesFields('P5.ASnotes.').menu);
    expect(readNotesPages(viewsOf(engine.doc))).toEqual([]);
    expect(addPageButton([])).toBe('Notes.Options');
    engine.click(addPageButton([]));
    expect(readNotesPages(viewsOf(engine.doc))).toHaveLength(1);
  });
});
