/* eslint-disable ts-patterns/no-magic-numbers -- counts and levels are the test data */
// The "Spells" Build step's engine part on the reference characters: what MPMB's spell dialogs offer, read
// without changing the sheet, and picks that go through those dialogs onto the spell sheet pages.
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { ScriptedHost } from '../../test/hosts.ts';
import { checkboxField, freeRow, readSpells } from '../play/spells.ts';
import { viewsOf } from '../worker/views.ts';
import type { Engine } from './engine.ts';
import { SPELLS_READ_SCRIPT, answerSpellDialogs, applySpellPicks, readSpellsInfo } from './spells.ts';
import type { SpellPicks } from './spells.ts';
import type { DialogView } from './host.ts';

const read = (engine: Engine) => readSpellsInfo(engine.evaluate(SPELLS_READ_SCRIPT));
/** The test hosts press OK in every dialog themselves, as answerSpellDialogs does in the app. */
const apply = (engine: Engine, picks: SpellPicks[]) => applySpellPicks(engine, picks, (_answer, job) => job());
const sheetSpells = (engine: Engine, title: string) =>
  readSpells(viewsOf(engine.doc))
    .filter((s) => s.title === title)
    .flatMap((s) => s.levels.flatMap((l) => l.spells.map((spell) => spell.name)));

describe("reading MPMB's spell dialogs", () => {
  it('gives every source in the order of the dialogs, and leaves the sheet as it was', () => {
    const host = new ScriptedHost();
    const wizard = openSheet(referenceSheet('wizard10-evoker'), host);
    const before = wizard.values();
    const info = read(wizard);
    expect(info.sources.map((s) => s.key)).toEqual([
      'tiefling',
      'magic initiate_-_wizard',
      'wizard',
      'staff of the magi',
    ]);
    expect(info.included).toEqual(info.sources.map((s) => s.key));
    expect(info.options).toMatchObject({ glossary: false, dashEmptyFields: true });
    // No dialog reached the player, and no field changed.
    expect(host.asked).toEqual([]);
    expect(wizard.values()).toEqual(before);
  });

  it("reads a spellbook caster's cantrips, spellbook and the list it chooses from", () => {
    const info = read(openSheet(referenceSheet('wizard10-evoker')));
    const wizard = info.sources.find((s) => s.key === 'wizard');
    expect(wizard).toMatchObject({ type: 'book', level: 10, maxLevel: 5, show: 1, preparedCantrips: false });
    expect(wizard?.cantrips).toMatchObject({ count: 5, offset: 0 });
    expect(wizard?.cantrips?.chosen).toEqual(['chill touch', 'light', 'mage hand', 'ray of frost', 'shocking grasp']);
    expect(wizard?.cantrips?.list).toContain('fire bolt');
    expect(wizard?.spells?.chosen).toHaveLength(18);
    expect(wizard?.spells?.list).toContain('wish');
    expect(wizard?.showOptions.map((o) => o.id)).toEqual([1, 2, 3, 4]);
    expect(info.spells.fireball).toMatchObject({ name: 'Fireball', level: 3, school: 'Evocation', time: 'Act' });
    // The reference wizard's sheet is metric: MPMB's own conversion.
    expect(info.spells.fireball?.range).toBe('45 m');
    expect(info.spells.fireball?.full).toMatch(/bright streak/);
    // MPMB's "Conc, 1 h" becomes the flag and the duration alone.
    expect(info.spells.web).toMatchObject({ concentration: true, duration: '1 h' });
  });

  it('reads the bonus spells of species, feats and items, and a caster that knows its whole list', () => {
    const wizard = read(openSheet(referenceSheet('wizard10-evoker')));
    const initiate = wizard.sources.find((s) => s.key === 'magic initiate_-_wizard');
    expect(initiate?.bonus.map((b) => [b.name, b.chosen])).toEqual([
      ['Cantrip', 'acid splash'],
      ['Cantrip', 'shocking grasp'],
      ['1st-Level', 'shield'],
    ]);
    expect(wizard.sources.find((s) => s.key === 'staff of the magi')?.bonus).toHaveLength(19);
    const paladin = read(openSheet(referenceSheet('paladin8-warlock2')));
    const oath = paladin.sources.find((s) => s.key === 'paladin');
    expect(oath).toMatchObject({ type: 'list', maxLevel: 2, cantrips: null, spells: null });
    expect(oath?.extra?.spells).toContain('shield of faith');
    expect(paladin.sources.find((s) => s.key === 'warlock')).toMatchObject({ type: 'known', maxLevel: 1 });
  });

  it('reads what "Prepared spells only" offers, and the spell sheet order and options', () => {
    const wizard = read(openSheet(referenceSheet('wizard10-evoker')));
    const book = wizard.sources.find((s) => s.key === 'wizard');
    // A wizard 10 prepares 15, from the spellbook only.
    expect(book?.prepared).toMatchObject({ count: 15, chosen: [] });
    expect(book?.prepared?.list.every((k) => book.spells?.chosen.includes(k))).toBe(true);
    // The read itself chose "only prepared" to see that dialog; the real choice stays.
    expect(book?.show).toBe(1);
    const paladin = read(openSheet(referenceSheet('paladin8-warlock2')));
    expect(paladin.sources.find((s) => s.key === 'paladin')?.prepared?.count).toBe(7);
    expect(paladin.sources.find((s) => s.key === 'warlock')?.prepared).toBeNull();
    expect(wizard.included).toEqual(['tiefling', 'magic initiate_-_wizard', 'wizard', 'staff of the magi']);
    expect(wizard.options).toEqual({
      glossary: false,
      dashEmptyFields: true,
      amendSpellDescriptions: true,
      allowSpellAdd: true,
      useDependencies: true,
    });
  });
});

describe("picks through MPMB's spell dialogs", () => {
  it('puts new cantrips and spellbook spells on the spell sheet, with MPMB making the pages', () => {
    const host = new ScriptedHost();
    const wizard = openSheet(referenceSheet('wizard10-evoker'), host);
    const book = read(wizard).sources.find((s) => s.key === 'wizard');
    const cantrips = (book?.cantrips?.chosen ?? []).map((k) => (k === 'light' ? 'fire bolt' : k));
    const spells = [...(book?.spells?.chosen ?? []), 'magic missile', 'shield', 'misty step'];
    apply(wizard, [{ key: 'wizard', cantrips, spells }]);
    // The spellbook is longer than the dialog's 20 rows now, so MPMB asks for its extra spellbook too.
    expect(host.asked.map((a) => a.what)).toContain('EXTRA SPELLBOOK SPELLS DIALOG');
    const onSheet = sheetSpells(wizard, 'Evoker Spells');
    expect(onSheet).toEqual(expect.arrayContaining(['Fire Bolt', 'Magic Missile', 'Shield', 'Misty Step']));
    expect(onSheet).not.toContain('Light');
    // And the dialogs show the new picks next time.
    const again = read(wizard).sources.find((s) => s.key === 'wizard');
    expect(again?.spells?.chosen).toHaveLength(21);
    expect(again?.cantrips?.chosen).toContain('fire bolt');
  });

  it('raises the number box for more spells known than MPMB gives, as the player can in the dialog', () => {
    const host = new ScriptedHost();
    const paladin = openSheet(referenceSheet('paladin8-warlock2'), host);
    const warlock = read(paladin).sources.find((s) => s.key === 'warlock');
    const count = warlock?.spells?.count ?? 0;
    // First-level spells from the warlock list (the patron's own spells aren't on it: MPMB drops them here).
    const firstLevel = (warlock?.spells?.list ?? []).filter((k) => !warlock?.extra?.spells.includes(k));
    const spells = ['hex', 'charm person', 'protection from evil and good', 'hellish rebuke']
      .filter((k) => firstLevel.includes(k))
      .slice(0, count + 1);
    expect(spells).toHaveLength(count + 1);
    apply(paladin, [{ key: 'warlock', spells }]);
    expect([...(read(paladin).sources.find((s) => s.key === 'warlock')?.spells?.chosen ?? [])].sort()).toEqual(
      [...spells].sort(),
    );
    expect(read(paladin).sources.find((s) => s.key === 'warlock')?.spells).toMatchObject({ offset: 1 });
  });

  it('gives prepared spells that are still on the new sheet their tick back', () => {
    const wizard = openSheet(referenceSheet('wizard10-evoker'));
    const evoker = () =>
      readSpells(viewsOf(wizard.doc))
        .filter((s) => s.key === 'wizard')
        .flatMap((s) => s.levels.flatMap((l) => l.spells));
    evoker()
      .filter((s) => s.name === 'Fireball' || s.name === 'Web')
      .forEach((s) => wizard.click(checkboxField(s)));
    apply(wizard, [{ key: 'wizard', spells: ['burning hands', 'fireball', 'web', 'shield'] }]);
    const prepared = evoker()
      .filter((s) => s.mark.prepared === true)
      .map((s) => s.name);
    expect(prepared).toEqual(['Web', 'Fireball']);
    expect(evoker().map((s) => s.name)).toContain('Shield');
  });
});

describe('bonus spells, prepared spells and the spell sheet, through the same dialogs', () => {
  const sourceTitles = (engine: Engine) => readSpells(viewsOf(engine.doc)).map((s) => s.key);

  it("changes a feat's bonus spell where MPMB's dialog keeps it", () => {
    const wizard = openSheet(referenceSheet('wizard10-evoker'));
    apply(wizard, [{ key: 'magic initiate_-_wizard', bonus: ['fire bolt'] }]);
    const initiate = read(wizard).sources.find((s) => s.key === 'magic initiate_-_wizard');
    expect(initiate?.bonus.map((b) => b.chosen)).toEqual(['fire bolt', 'shocking grasp', 'shield']);
    const onSheet = readSpells(viewsOf(wizard.doc)).find((s) => s.key === 'magic initiate_-_wizard');
    expect(onSheet?.levels.flatMap((l) => l.spells.map((sp) => sp.key))).toContain('fire bolt');
  });

  it('puts only the prepared spells on the sheet when the player picks "Prepared spells only"', () => {
    const paladin = openSheet(referenceSheet('paladin8-warlock2'));
    const prepared = ['bless', 'cure wounds', 'lesser restoration'];
    apply(paladin, [{ key: 'paladin', show: 3, prepared }]);
    const oath = read(paladin).sources.find((s) => s.key === 'paladin');
    expect(oath).toMatchObject({ show: 3 });
    expect([...(oath?.prepared?.chosen ?? [])].sort()).toEqual([...prepared].sort());
    const levelled = readSpells(viewsOf(paladin.doc))
      .find((s) => s.key === 'paladin')
      ?.levels.filter((l) => l.level > 0)
      .flatMap((l) => l.spells.map((sp) => sp.key));
    // The prepared ones are there; the rest of the class list isn't (always prepared oath spells stay).
    expect(levelled).toEqual(expect.arrayContaining(prepared));
    expect(levelled).not.toContain('command');
  });

  it('leaves a source off the sheet and sets the options of the order dialog', () => {
    const wizard = openSheet(referenceSheet('wizard10-evoker'));
    const options = {
      glossary: true,
      dashEmptyFields: true,
      amendSpellDescriptions: true,
      allowSpellAdd: true,
      useDependencies: true,
    };
    applySpellPicks(wizard, [], (_answer, job) => job(), {
      included: ['wizard', 'magic initiate_-_wizard', 'tiefling'],
      excluded: ['staff of the magi'],
      options,
    });
    const info = read(wizard);
    expect(info.included).toEqual(['wizard', 'magic initiate_-_wizard', 'tiefling']);
    expect(info.excluded).toEqual(['staff of the magi']);
    expect(info.options).toEqual(options);
    expect(sourceTitles(wizard)).toEqual(['wizard', 'magic initiate_-_wizard', 'tiefling']);
  });
});

describe("MPMB's own spell row menu (Shift and a click on a row's first column)", () => {
  const wizardRows = (engine: Engine) =>
    readSpells(viewsOf(engine.doc))
      .filter((s) => s.key === 'wizard')
      .flatMap((s) => s.levels.flatMap((l) => l.spells));

  it('moves a spell down a row, as the menu does in Acrobat', () => {
    const host = new ScriptedHost({ menus: [['Move row down']] });
    const wizard = openSheet(referenceSheet('wizard10-evoker'), host);
    const [first, second] = wizardRows(wizard).filter((sp) => sp.mark.prepared !== null);
    if (!first || !second) throw new Error('The wizard has spells to move');
    wizard.click(checkboxField(first), 0, true);
    expect(host.asked.at(-1)).toMatchObject({ kind: 'menu' });
    const after = wizardRows(wizard).map((sp) => sp.key);
    expect(after.indexOf(second.key)).toBeLessThan(after.indexOf(first.key));
  });

  it('clears a row, and a plain click still ticks the spell as prepared', () => {
    const host = new ScriptedHost({ menus: [['Clear row']] });
    const wizard = openSheet(referenceSheet('wizard10-evoker'), host);
    const spell = wizardRows(wizard).find((sp) => sp.mark.prepared === false);
    if (!spell) throw new Error('The wizard has a spell to prepare');
    wizard.click(checkboxField(spell));
    expect(wizardRows(wizard).find((sp) => sp.key === spell.key)?.mark.prepared).toBe(true);
    expect(host.asked.filter((a) => a.kind === 'menu')).toHaveLength(0);
    wizard.click(checkboxField(spell), 0, true);
    expect(wizardRows(wizard).map((sp) => sp.key)).not.toContain(spell.key);
  });

  it("adds a spell in the first free row through MPMB's Spell menu", () => {
    const host = new ScriptedHost({ menus: [['Spell', 'with a Checkbox', 'Wizard spells', 'All spells', 'Sleep']] });
    const wizard = openSheet(referenceSheet('wizard10-evoker'), host);
    const all = () => readSpells(viewsOf(wizard.doc)).flatMap((s) => s.levels.flatMap((l) => l.spells));
    expect(all().map((sp) => sp.key)).not.toContain('sleep');
    const box = freeRow(viewsOf(wizard.doc));
    if (!box) throw new Error('The wizard has a free row');
    wizard.click(box, 0, true);
    const sleep = all().find((sp) => sp.key === 'sleep');
    expect(sleep).toMatchObject({ fullName: 'Sleep', mark: { prepared: false } });
    expect(checkboxField(sleep!)).toBe(box);
  });
});

describe('answerSpellDialogs', () => {
  it("closes MPMB's spell dialogs with OK as they are and leaves other pop-ups to the player", () => {
    const view = (name: string): DialogView =>
      ({ description: { name }, state: { Ca01: { Light: 1 } } }) as unknown as DialogView;
    expect(answerSpellDialogs(view('SPELL SELECTION DIALOG'))).toEqual({
      type: 'close',
      result: 'ok',
      state: { Ca01: { Light: 1 } },
    });
    expect(answerSpellDialogs(view('SET UNIT SYSTEM AND DECIMAL SEPARATOR'))).toBeNull();
  });
});
