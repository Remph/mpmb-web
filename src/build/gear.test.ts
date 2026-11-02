/* eslint-disable ts-patterns/no-magic-numbers -- AC, weights and rows are the test data */
// The "Armour & weapons" step on the reference characters: MPMB's lists as the step reads them, and what
// writing into MPMB's own armour, shield and attack fields does there.
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { BUILDER_INFO_SCRIPT, readBuilderInfo } from '../engine/builder.ts';
import { viewsOf } from '../worker/views.ts';
import {
  ARMOUR_FIELD,
  SHIELD_FIELD,
  armourNamed,
  damageText,
  readShield,
  shieldText,
  trainedWith,
  weaponField,
  weaponNamed,
  weaponRows,
  weightText,
  withMagic,
} from './gear.ts';
import { readProficiencies } from './proficiencies.ts';

const paladin = () => openSheet(referenceSheet('paladin8-warlock2'));
const gearOf = (engine = paladin()) => readBuilderInfo(engine.evaluate(BUILDER_INFO_SCRIPT)).gear;

describe("MPMB's armour and weapon lists", () => {
  it("reads the armour drop-down with ArmourList's numbers, in the sheet's unit", () => {
    const gear = gearOf();
    expect(gear.massUnit).toBe('kg');
    // The paladin's magic item adds its armour at the top of MPMB's list.
    expect(gear.armour[0]).toMatchObject({ name: 'Adamantine Plate', group: 'own', ac: 18, type: 'heavy' });
    expect(armourNamed(gear, 'Chain Mail')).toEqual({
      name: 'Chain Mail',
      group: 'heavy',
      type: 'heavy',
      ac: 16,
      dex: 'none',
      stealth: true,
      strength: 13,
      weight: 27.5,
    });
    expect(armourNamed(gear, 'Breastplate')).toMatchObject({ group: 'medium', dex: 'max2', stealth: false });
    expect(armourNamed(gear, 'Unarmored')).toMatchObject({ group: 'none', ac: 10, dex: 'all' });
  });

  it('reads the weapons with damage, range in metres, properties and mastery', () => {
    const gear = gearOf();
    expect(gear.weapons[0]).toMatchObject({ name: '+2 Halberd', group: 'own' });
    expect(weaponNamed(gear, 'Dagger')).toEqual({
      name: 'Dagger',
      group: 'simple-melee',
      type: 'Simple',
      damage: [1, 4, 'piercing'],
      range: 'Melee, 6/18 m',
      properties: 'Finesse, Light, Thrown',
      mastery: 'Nick',
      weight: 0.5,
    });
    expect(weaponNamed(gear, 'Longbow')).toMatchObject({ group: 'martial-ranged', range: '45/180 m' });
    expect(weaponNamed(gear, 'Fire Bolt')).toMatchObject({ group: 'spell', damage: ['C', 10, 'fire'] });
    expect(weaponNamed(gear, 'Net')?.group).toBe('gear');
    // MPMB's alternative spellings are the same weapons, so the step leaves them out.
    expect(gear.weapons.map((w) => w.name)).not.toContain('Sword, Long');
  });

  it('a blank sheet in pounds has no entries of its own', () => {
    const gear = gearOf(openSheet());
    expect(gear.massUnit).toBe('lb');
    expect(gear.armour.some((a) => a.group === 'own')).toBe(false);
    expect(armourNamed(gear, 'Plate')?.weight).toBe(65);
    expect(weaponNamed(gear, 'Longbow')?.range).toBe('150/600 ft');
  });

  it('finds a weapon behind its magic bonus', () => {
    expect(weaponNamed(gearOf(), '+1 Longsword')?.name).toBe('Longsword');
  });
});

describe('writing armour, shield and weapons', () => {
  it("armour through MPMB's field sets the armour class", () => {
    const engine = openSheet();
    engine.edit(ARMOUR_FIELD, 'Chain Mail');
    expect(viewsOf(engine.doc)['AC']?.value).toBe('16');
  });

  it('a shield adds 2, a +1 shield 3, and none takes it off again', () => {
    const engine = openSheet();
    engine.edit(ARMOUR_FIELD, 'Chain Mail');
    engine.edit(SHIELD_FIELD, shieldText(true, 0));
    expect(viewsOf(engine.doc)['AC']?.value).toBe('18');
    expect(readShield(viewsOf(engine.doc))).toEqual({ on: true, bonus: 0, other: '' });
    engine.edit(SHIELD_FIELD, shieldText(true, 1));
    expect(viewsOf(engine.doc)['AC']?.value).toBe('19');
    expect(readShield(viewsOf(engine.doc))).toEqual({ on: true, bonus: 1, other: '' });
    engine.edit(SHIELD_FIELD, shieldText(false, 1));
    expect(viewsOf(engine.doc)['AC']?.value).toBe('16');
    expect(readShield(viewsOf(engine.doc)).on).toBe(false);
  });

  it("a magic item's shield is shown as it is", () => {
    const fields = viewsOf(openSheet().doc);
    fields[SHIELD_FIELD] = { ...fields[SHIELD_FIELD]!, value: 'Spellguard Shield' };
    expect(readShield(fields)).toEqual({ on: true, bonus: 0, other: 'Spellguard Shield' });
  });

  it('a weapon in a free row gets to hit and damage from MPMB', () => {
    const engine = paladin();
    expect(weaponRows(viewsOf(engine.doc))).toEqual([1, 2, 3, 4, 5, 6]);
    engine.edit(weaponField(3), withMagic('Longsword', 1));
    const fields = viewsOf(engine.doc);
    // Strength 14 (+2), proficiency +4 at level 10, and the +1.
    expect(fields['Attack.3.To Hit']?.value).toBe('+7');
    expect(fields['Attack.3.Damage']?.value).toBe('1d8+3');
    engine.edit(weaponField(3), '');
    expect(viewsOf(engine.doc)['Attack.3.To Hit']?.value).toBe('');
  });
});

describe('texts and training', () => {
  it('damage texts', () => {
    expect(damageText([1, 8, 'slashing'])).toBe('1d8 slashing');
    expect(damageText([2, 6, 'slashing'])).toBe('2d6 slashing');
    expect(damageText(['C', 10, 'fire'])).toBe('1d10 fire');
    expect(damageText(['C×1', 10, 'force'])).toBe('1d10 force');
    expect(damageText(['+B', 6, 'radiant'])).toBe('+1d6 radiant');
    expect(damageText([1, '', 'bludgeoning'])).toBe('1 bludgeoning');
    expect(damageText(['Dex save', '', 'Restrained'])).toBe('Dex save · Restrained');
    expect(damageText(['', '', ''])).toBe('');
  });

  it('weights', () => {
    expect(weightText(27.5, 'kg')).toBe('27.5 kg');
    expect(weightText(0.13, 'kg')).toBe('0.13 kg');
    expect(weightText(0, 'kg')).toBe('');
    expect(weightText(null, 'lb')).toBe('');
  });

  it('training from the first class, and single weapons by name', () => {
    const engine = openSheet();
    engine.click('Proficiency Weapon Simple');
    engine.edit('Proficiency Weapon Other Description', 'Longswords, Rapiers');
    const gear = gearOf(engine);
    const prof = readProficiencies(viewsOf(engine.doc));
    expect(trainedWith(weaponNamed(gear, 'Dagger')!, prof)).toBe(true);
    expect(trainedWith(weaponNamed(gear, 'Rapier')!, prof)).toBe(true);
    expect(trainedWith(weaponNamed(gear, 'Greataxe')!, prof)).toBe(false);
    expect(trainedWith(weaponNamed(gear, 'Fire Bolt')!, prof)).toBe(null);
    expect(trainedWith(armourNamed(gear, 'Plate')!, prof)).toBe(false);
    expect(trainedWith(armourNamed(gear, 'Unarmored')!, prof)).toBe(null);
  });
});
