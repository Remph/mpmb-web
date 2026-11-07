// Switching a magic item's attunement in the play view clicks MPMB's own box (playtest 2026-11-07): MPMB then
// applies or removes what the item gives, here the Stone of Good Luck's +1 to ability checks and saves.
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
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
});
