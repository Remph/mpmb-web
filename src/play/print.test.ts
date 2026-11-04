// The print layout's parts and pencil marks, on the reference characters and a blank sheet.
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import type { ReferenceCharacter } from '../../test/characters.ts';
import { viewsOf } from '../worker/views.ts';
import { PRINT_PARTS, marks, poolLeft, printableParts, spellMarks } from './print.ts';
import { readSpells } from './spells.ts';

describe('print parts', () => {
  it('offers every part for the paladin, who has spells and a notes page with the oath', () => {
    expect(printableParts(viewsOf(openSheet(referenceSheet('paladin8-warlock2')).doc))).toEqual([...PRINT_PARTS]);
  });

  it('leaves spells and notes out of a blank sheet', () => {
    expect(printableParts(viewsOf(openSheet().doc))).toEqual(['main', 'features', 'inventory', 'profile']);
  });
});

describe('pencil marks', () => {
  it('fills the used ones, or none when printed blank', () => {
    expect(marks(3, 2, false)).toEqual([true, true, false]);
    expect(marks(3, 2, true)).toEqual([false, false, false]);
  });

  it('draws nothing for a broken count', () => {
    expect(marks(-1, 0, false)).toEqual([]);
    expect(marks(Number.NaN, 0, false)).toEqual([]);
  });

  it('shows what is left of a pool unless blank', () => {
    expect(poolLeft(40, 15, false)).toBe('25');
    expect(poolLeft(40, 15, true)).toBe('');
    expect(poolLeft(null, 0, false)).toBe('');
    expect(poolLeft(5, 9, false)).toBe('0');
  });
});

describe('spell marks on paper', () => {
  const spellsOf = (name: ReferenceCharacter) =>
    readSpells(viewsOf(openSheet(referenceSheet(name)).doc)).flatMap((source) =>
      source.levels.flatMap((level) => level.spells),
    );
  const find = (name: ReferenceCharacter, spell: string) => {
    const found = spellsOf(name).find((s) => s.name === spell);
    if (!found) throw new Error(`${spell} is not on the sheet`);
    return found;
  };

  it('gives an always prepared spell its star, not a ticked box', () => {
    const always = spellsOf('paladin8-warlock2').find((s) => s.mark.always && s.mark.free === null);
    expect(always).toBeDefined();
    expect(spellMarks(always!.mark, true)).toEqual([{ kind: 'star', on: false }]);
  });

  it("gives a species' once-a-day spell its star and a circle, left empty for a pencil", () => {
    const spell = find('wizard10-evoker', 'False Life');
    expect(spellMarks(spell.mark, true)).toEqual([
      { kind: 'star', on: false },
      { kind: 'circle', on: false },
    ]);
    expect(spellMarks({ ...spell.mark, freeUsed: true }, false)[1]).toEqual({ kind: 'circle', on: true });
  });

  it('keeps the box the player ticks, blank or not', () => {
    const chosen = spellsOf('wizard10-evoker').find((s) => s.mark.prepared !== null && !s.mark.always);
    expect(chosen).toBeDefined();
    expect(spellMarks(chosen!.mark, true)).toEqual([{ kind: 'box', on: chosen!.mark.prepared }]);
  });
});
