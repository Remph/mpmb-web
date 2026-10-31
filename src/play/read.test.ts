/* eslint-disable ts-patterns/no-magic-numbers -- hit points, counts and slots are the test data */
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { viewsOf } from '../worker/views.ts';
import type { FieldViews } from '../worker/views.ts';
import {
  choicesOf,
  featureLine,
  goldTotal,
  readAbilities,
  readDefenses,
  readActions,
  readAttacks,
  readConditions,
  readHitPoints,
  readLimitedFeatures,
  readNumbers,
  readSkills,
  readSpellSlots,
  readTool,
  readFeatures,
  readInventory,
  readSpellSlotUse,
  recoveryKind,
  slotBoxes,
  textRuns,
} from './read.ts';

// The values below are what Acrobat shows on page 1 of the reference characters.
const paladin = viewsOf(openSheet(referenceSheet('paladin8-warlock2')).doc);
const wizard = viewsOf(openSheet(referenceSheet('wizard10-evoker')).doc);

/** A copy with some fields' values changed, as after the player's edits. */
function withValues(fields: FieldViews, values: Record<string, string>): FieldViews {
  const copy = { ...fields };
  Object.entries(values).forEach(([name, value]) => {
    const view = copy[name];
    if (!view) throw new Error(`no field ${name}`);
    copy[name] = { ...view, value, text: undefined };
  });
  return copy;
}

describe('play view values', () => {
  it('reads hit points and hit dice', () => {
    expect(readHitPoints(paladin)).toEqual({
      current: null,
      max: 92,
      temp: null,
      hitDice: [
        { row: 1, die: 'd10', total: 8, used: 0 },
        { row: 2, die: 'd8', total: 2, used: 0 },
      ],
      deathSaves: { successes: 0, failures: 0 },
    });
    const hurt = withValues(paladin, {
      'HP Current': '71',
      'HP Temp': '5',
      'HD1 Used': '1',
      'Death Save Fail1': 'Yes',
    });
    expect(readHitPoints(hurt)).toMatchObject({
      current: 71,
      temp: 5,
      hitDice: [{ used: 1 }, { used: 0 }],
      deathSaves: { successes: 0, failures: 1 },
    });
  });

  it('reads the numbers next to the hit points as the sheet shows them', () => {
    expect(readNumbers(paladin)).toEqual({
      armorClass: '18',
      initiative: '0',
      speed: '9 m',
      proficiency: '+4',
      spellSaveDcs: ['16'],
      passivePerception: '11',
    });
    expect(readNumbers(wizard)).toMatchObject({ armorClass: '12', initiative: '+2' });
  });

  it('reads abilities and saves, without the hidden Honor/Sanity score', () => {
    const abilities = readAbilities(paladin);
    expect(abilities.map((a) => a.key)).toEqual(['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha']);
    expect(abilities[5]).toEqual({
      key: 'Cha',
      score: '18',
      modifier: '+4',
      save: '+13',
      saveProficient: true,
      advantage: false,
      disadvantage: false,
    });
  });

  it('reads skills with proficiency and disadvantage', () => {
    const skills = readSkills(paladin);
    expect(skills).toHaveLength(18);
    expect(skills.filter((s) => s.proficient).map((s) => s.key)).toEqual(['Ins', 'Rel']);
    expect(skills.find((s) => s.key === 'Ste')).toMatchObject({ bonus: '0', disadvantage: true });
    expect(skills.find((s) => s.key === 'Rel')).toMatchObject({ bonus: '+9', ability: 'Int' });
    expect(readTool(paladin)).toEqual({ name: "Calligrapher's Supplies (DEX)", bonus: '+4' });
  });

  it('reads the filled attack rows', () => {
    expect(readAttacks(paladin)).toEqual([
      {
        row: 1,
        name: '+2 Halberd',
        toHit: '+8',
        damage: '1d10+4',
        damageType: 'Slashing',
        range: 'Melee',
        description: 'Heavy, Reach, Two-Handed',
      },
      { row: 2, name: 'Breath Weapon', toHit: '+0', damage: '', damageType: '', range: '', description: '' },
    ]);
  });

  it('reads actions, bonus actions and reactions', () => {
    expect(readActions(paladin)).toEqual({
      action: [
        'Attack / Magic / Utilize',
        'Dash / Disengage / Dodge / Hide',
        'Search / Study / Influence',
        'Ready / Help / Escape Grapple',
      ],
      bonusAction: ['Lay on Hands', 'Divine Sense (Channel Divinity)', 'Draconic Flight'],
      reaction: ['Opportunity Attack'],
    });
  });

  it('reads limited features as dots or as a pool', () => {
    const features = readLimitedFeatures(paladin);
    expect(features.map((f) => [f.name, f.max, f.pool, f.recovery])).toEqual([
      ['Lay on Hands', 40, true, 'long rest'],
      ['Channel Divinity (regain 1/SR)', 2, false, 'long rest'],
      ['Magical Cunning (1 spell slot)', 1, false, 'long rest'],
      ['Breath Weapon (2d10)', 4, false, 'long rest'],
      ['Draconic Flight', 1, false, 'long rest'],
    ]);
    // Staff of the Magi's 50 charges are too many for dots.
    expect(readLimitedFeatures(wizard)[1]).toMatchObject({ max: 50, pool: true, recovery: 'dawn' });
  });

  it('reads spell slots per level', () => {
    expect(readSpellSlots(paladin)).toEqual([
      { level: 1, total: 6 },
      { level: 2, total: 3 },
    ]);
    expect(readSpellSlots(wizard).map((s) => s.total)).toEqual([4, 3, 3, 3, 2]);
  });

  it('reads conditions and exhaustion', () => {
    expect(readConditions(paladin)).toEqual({ active: [], exhaustion: 0 });
    const poisoned = withValues(paladin, { 'Condition.Poisoned': 'Yes', 'Condition.Exhaustion': '2' });
    expect(readConditions(poisoned)).toEqual({ active: ['Poisoned'], exhaustion: 2 });
  });
});

describe('play view extras', () => {
  it("lists the Alignment field's nine alignments, and nothing for a text field", () => {
    const alignments = choicesOf(paladin, 'Alignment');
    expect(alignments).toHaveLength(9);
    expect(alignments[0]).toEqual(['Lawful Good', 'Lawful Good']);
    expect(alignments.map(([value]) => value)).toContain('Chaotic Evil');
    expect(choicesOf(paladin, 'Age')).toEqual([]);
  });

  it('knows the rest and dawn recovery texts, however MPMB writes them', () => {
    expect(['long rest', 'Long Rest', 'LR', 'short rest', 'SR', 'dawn', 'Dawn', '7 days'].map(recoveryKind)).toEqual([
      'long',
      'long',
      'long',
      'short',
      'short',
      'dawn',
      'dawn',
      null,
    ]);
  });

  it('ticks the slot boxes the sheet shows first', () => {
    expect(slotBoxes(2, 3).slice(0, 3)).toEqual([
      'SpellSlots.Checkboxes.lvl2.top2.1',
      'SpellSlots.Checkboxes.lvl2.top2.2',
      'SpellSlots.Checkboxes.lvl2.bottom1',
    ]);
    const used = withValues(paladin, { 'SpellSlots.Checkboxes.lvl1.top2.1': 'Yes' });
    expect(readSpellSlotUse(used).map((s) => [s.level, s.total, s.used])).toEqual([
      [1, 6, 1],
      [2, 3, 0],
    ]);
  });

  it('reads magic items, gear and coins', () => {
    const inventory = readInventory(paladin);
    expect(inventory.magicItems.map((i) => [i.name, i.attuned])).toEqual([
      ['Adamantine Plate Armor', false],
      ['+2 Halberd', false],
      ['Headband of Intellect', true],
      ['Stone of Good Luck', true],
    ]);
    expect(inventory.gear.map((g) => [g.name, g.amount])).toEqual([
      ['Potion of Healing', 5],
      ['Greater Potion of Healing', 4],
      ['Sending Stones', 1],
    ]);
    expect(inventory.coins.map((c) => c.amount)).toEqual(['1', '25', '66', '11', '123']);
    expect(inventory.carried).toBe('5.45 kg');
    expect(inventory.lifestyle).toBe('comfortable');
    expect(inventory.lifestyleCost).toBe('2 gp');
  });

  it('knows the fields of each gear row and where a new item goes', () => {
    const inventory = readInventory(paladin);
    const stones = inventory.gear.filter((g) => g.name === 'Sending Stones')[0];
    expect(stones).toMatchObject({
      list: 'gear',
      row: 24,
      nameField: 'Adventuring Gear Row 24',
      amountField: 'Adventuring Gear Amount 24',
      button: 'Adventuring Gear Button 24',
      weight: '1 kg',
      location: '',
    });
    // Row 3 is the first empty one on page 2; page 3's list is empty.
    expect(inventory.freeRow).toEqual({ gear: 3, extra: 1 });
  });

  it('adds up the coins in gold pieces', () => {
    const coins = readInventory(paladin).coins;
    // 1 pp + 25 gp + 66 ep + 11 sp + 123 cp = 10 + 25 + 33 + 1.1 + 1.23
    expect(goldTotal(coins)).toBe(70.33);
    expect(goldTotal(coins.map((c) => ({ ...c, amount: '' })))).toBeNull();
    expect(goldTotal(coins.map((c) => ({ ...c, amount: c.key === 'sp' ? '2,5' : 'lots' })))).toBe(0.25);
  });

  it('reads senses, resistances and immunities as lists', () => {
    expect(readDefenses(paladin)).toEqual({
      senses: ['Darkvision 18 m'],
      resistances: ['Cold'],
      labelled: [{ title: 'Immunities', items: ['Charmed'] }],
      other: [],
    });
  });

  it("splits MPMB's saves field into its entries, and only its two lists into items", () => {
    const saves = withValues(paladin, {
      'Saving Throw advantages / disadvantages':
        '**Immunities**. Charmed, Frightened, and Poisoned; **Adv vs** Exhaustion and Poison; ' +
        '**Dex Save for Half**. *Failure:* half dmg, *Success:* no dmg',
    });
    expect(readDefenses(saves)).toMatchObject({
      labelled: [
        { title: 'Immunities', items: ['Charmed', 'Frightened', 'Poisoned'] },
        { title: 'Adv vs', items: ['Exhaustion', 'Poison'] },
      ],
      other: ['**Dex Save for Half**. *Failure:* half dmg, *Success:* no dmg'],
    });
  });

  it("splits MPMB's feature text into runs", () => {
    expect(textRuns('#◆ Lay on Hands# (Paladin 1) *Divine Smite*')).toEqual([
      { text: '◆ Lay on Hands', bold: true, italic: false },
      { text: ' (Paladin 1) ', bold: false, italic: false },
      { text: 'Divine Smite', bold: false, italic: true },
    ]);
    expect(readFeatures(paladin).map((f) => f.title)).toEqual(['', '', 'Magic Initiate [Cleric]', 'Acolyte']);
  });

  it('marks the parts of a feature line: name, source, uses, headings', () => {
    expect(featureLine('**Paladin (Oath of Devotion), level 8:**')).toEqual({
      heading: 'Paladin (Oath of Devotion), level 8',
    });
    const line = featureLine("#◆ Lay on Hands# (Paladin 1, SRD'24 53) #[40 HP pool]#");
    expect('runs' in line && line.runs.map((r) => [r.role, r.text])).toEqual([
      ['name', '◆ Lay on Hands'],
      ['source', "(Paladin 1, SRD'24 53)"],
      ['usage', '40 HP pool'],
    ]);
    // A species trait: the name runs straight into its text.
    const trait = featureLine('##◆ Breath Weapon##. Instead of one attack');
    expect('runs' in trait && trait.runs.map((r) => r.role)).toEqual(['name', null]);
    const flight = featureLine('##◆ Draconic Flight## (level 5). As a Bonus Action');
    expect('runs' in flight && flight.runs.map((r) => r.text)).toEqual([
      '◆ Draconic Flight',
      '(level 5)',
      '. As a Bonus Action',
    ]);
  });
});
