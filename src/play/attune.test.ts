// Switching a magic item's attunement in the play view clicks MPMB's own box (playtest 2026-11-07): MPMB then
// applies or removes what the item gives, here the Stone of Good Luck's +1 to ability checks and saves.
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { blankSheet } from '../engine/sheet.ts';
import { viewsOf } from '../worker/views.ts';
import { readInventory, valueOf } from './read.ts';

describe('attuning a magic item', () => {
  it("unticking MPMB's box removes the item's bonus, ticking it again brings it back", () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    const stone = (): { attuned: boolean; skills: string } => {
      const fields = viewsOf(engine.doc);
      const item = readInventory(fields).magicItems.find((i) => i.name === 'Stone of Good Luck');
      return { attuned: item?.attuned ?? false, skills: valueOf(fields, 'All Skills Bonus') };
    };
    expect(stone()).toEqual({ attuned: true, skills: '1' });
    engine.click('Extra.Magic Item Attuned 4');
    expect(stone()).toEqual({ attuned: false, skills: '0' });
    engine.click('Extra.Magic Item Attuned 4');
    expect(stone()).toEqual({ attuned: true, skills: '1' });
  });

  // Playtest 2026-11-14: from the 7th item on (MPMB's overflow rows) the app showed "Attuned" for items that need
  // no attunement. MPMB hides the box there only while the overflow page is shown; until then the box keeps its
  // old display, but the field's submitName says "hide" either way, and that survives a save.
  it('knows which items need attunement in the overflow rows too, also after a save', () => {
    let engine = openSheet(blankSheet());
    const firstSix = ['Cloak of Protection', 'Boots of Elvenkind', 'Amulet of Health', 'Bracers of Defense'];
    [...firstSix, 'Chime of Opening', 'Bag of Beans', 'Bag of Holding', 'Ring of Free Action'].forEach((name, i) =>
      engine.edit(`Extra.Magic Item ${i + 1}`, name),
    );
    const attunable = (): Record<string, boolean> =>
      Object.fromEntries(readInventory(viewsOf(engine.doc)).magicItems.map((item) => [item.name, item.attunable]));
    const expected = {
      'Cloak of Protection': true,
      'Boots of Elvenkind': false,
      'Amulet of Health': true,
      'Bracers of Defense': true,
      'Chime of Opening': false,
      'Bag of Beans': false,
      'Bag of Holding': false,
      'Ring of Free Action': true,
    };
    expect(attunable()).toEqual(expected);

    // Swapping the 7th item for one that needs attunement shows the switch again.
    engine.edit('Extra.Magic Item 7', 'Boots of Speed');
    expect(attunable()['Boots of Speed']).toBe(true);
    // And the switch works there, though MPMB left the box hidden.
    const attuned = (): boolean | undefined =>
      readInventory(viewsOf(engine.doc)).magicItems.find((item) => item.row === 7)?.attuned;
    expect(attuned()).toBe(true);
    engine.click('Extra.Magic Item Attuned 7');
    expect(attuned()).toBe(false);
    engine.edit('Extra.Magic Item 7', 'Bag of Holding');
    expect(attunable()['Bag of Holding']).toBe(false);

    engine = openSheet(engine.snapshot());
    expect(attunable()).toEqual(expected);
    // The rarity (note 6) comes from MPMB's tooltip, which a save keeps too.
    const bag = readInventory(viewsOf(engine.doc)).magicItems.find((item) => item.row === 7);
    expect(bag?.rarity).toBe('uncommon');
  });
});
