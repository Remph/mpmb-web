// Magic items through MPMB's own field, on the reference paladin and a blank sheet.
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { BUILDER_INFO_SCRIPT, readBuilderInfo } from '../engine/builder.ts';
import { readInventory } from '../play/read.ts';
import { viewsOf } from '../worker/views.ts';
import { freeMagicRow, groupMagicItems, itemLine, magicItemField, typeGroup } from './magic-items.ts';

const gearOf = (engine = openSheet()) => readBuilderInfo(engine.evaluate(BUILDER_INFO_SCRIPT)).gear;

describe('magic items', () => {
  it("reads MPMB's magic item list with type, rarity and attunement", () => {
    const items = gearOf().magicItems;
    expect(items.length).toBeGreaterThan(100);
    expect(items.find((i) => i.name === 'Bag of Holding')).toMatchObject({
      type: 'Wondrous Item',
      rarity: 'Uncommon',
      attunement: false,
      choices: false,
    });
    expect(items.find((i) => i.name === 'Ring of Protection')?.attunement).toBe(true);
    expect(items.some((i) => i.choices)).toBe(true);
  });

  it('groups the list by type, other types last', () => {
    expect(typeGroup({ type: 'weapon (any sword)' })).toBe('weapon');
    expect(typeGroup({ type: 'Wondrous Item' })).toBe('wondrous item');
    expect(typeGroup({ type: 'tattoo' })).toBe('other');
    const groups = groupMagicItems(gearOf().magicItems);
    expect(groups.map((g) => g.type)).toContain('ring');
    expect(groups.at(-1)?.type).toBe('wondrous item');
  });

  it("an item typed into a free row gets MPMB's description; an empty name takes it off again", () => {
    const engine = openSheet();
    const row = freeMagicRow(viewsOf(engine.doc));
    expect(row).toBe(1);
    engine.edit(magicItemField(1), 'Ring of Protection');
    const item = readInventory(viewsOf(engine.doc)).magicItems[0];
    expect(item).toMatchObject({ row: 1, name: 'Ring of Protection', attuned: true });
    expect(item?.description).not.toBe('');
    expect(freeMagicRow(viewsOf(engine.doc))).toBe(2);
    engine.edit(magicItemField(1), '');
    expect(readInventory(viewsOf(engine.doc)).magicItems).toEqual([]);
  });

  it("the paladin's items are on the sheet", () => {
    const fields = viewsOf(openSheet(referenceSheet('paladin8-warlock2')).doc);
    expect(readInventory(fields).magicItems.length).toBeGreaterThan(0);
  });
});

describe("the picker's line", () => {
  const words = { attunement: 'attunement', versions: 'several versions' };
  const wand = {
    name: 'Wand of Fear',
    type: 'Wand',
    rarity: 'rare',
    attunement: true,
    choices: false,
    description:
      'This wand has 7 charges and regains 1d6+1 expended charges daily at dawn. While holding the wand, I can expend charges to cast *Command*.',
  };

  it('capitalises the rarity, takes off the marks and cuts a long description at a word', () => {
    const line = itemLine(wand, words);
    expect(line).toMatch(/^Rare · attunement · This wand has 7 charges/);
    expect(line).not.toContain('*');
    expect(line.endsWith(' …')).toBe(true);
    expect(line.length).toBeLessThan(130);
  });

  it('says "several versions" instead of the description for an item with choices', () => {
    expect(itemLine({ ...wand, choices: true, description: 'Select one of the choices.' }, words)).toBe(
      'Rare · attunement · several versions',
    );
  });
});
