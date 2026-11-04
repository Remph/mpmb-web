/* eslint-disable ts-patterns/no-magic-numbers -- ammunition counts and experience points are the test data */
// The parity leftovers (2026-11-04): ammunition, experience points and the advantage marks on
// initiative and attacks, each run through MPMB's own scripts on the reference paladin.
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { ScriptedHost } from '../../test/hosts.ts';
import type { Engine } from '../engine/engine.ts';
import type { Step } from '../session.svelte.ts';
import { viewsOf } from '../worker/views.ts';
import { ammoChoices, collectSteps, countSteps, freeAmmoSide, half, pickSteps, readAmmo } from './ammo.ts';
import type { Ammo } from './ammo.ts';
import { edgeOf, isAttackRoll, markSteps } from './edge.ts';
import { addExperienceSteps, readExperience } from './experience.ts';
import { readAttacks, readRollMarks, valueOf } from './read.ts';

/** Plays the steps as the worker does: typing into a field, or a click. */
function play(engine: Engine, steps: Step[]): void {
  steps.forEach((step) => ('edit' in step ? engine.edit(step.edit, step.text) : engine.click(step.click)));
}

const ammoOf = (engine: Engine): Ammo[] => readAmmo(viewsOf(engine.doc));
const first = (engine: Engine): Ammo => {
  const ammo = ammoOf(engine)[0];
  if (!ammo) throw new Error('no ammunition');
  return ammo;
};

describe('ammunition', () => {
  it("offers MPMB's own list and starts with both counters free", () => {
    const fields = viewsOf(openSheet(referenceSheet('paladin8-warlock2')).doc);
    expect(readAmmo(fields)).toEqual([]);
    expect(freeAmmoSide(fields)).toBe('Left');
    expect(ammoChoices(fields)).toEqual(expect.arrayContaining(['Arrows', 'Javelins', 'Bolts', 'Daggers']));
  });

  it('picks arrows, counts them and fills the second counter next', () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    play(engine, pickSteps('Left', 'Arrows'));
    // MPMB's ApplyAmmo sets up the quiver: 20 boxes for arrows.
    expect(valueOf(viewsOf(engine.doc), 'AmmoLeftDisplay.MaxAmount')).toBe('20');
    play(engine, countSteps(first(engine), 20, true));
    expect(first(engine)).toMatchObject({ side: 'Left', name: 'Arrows', amount: 20, start: 20, used: 0 });
    expect(freeAmmoSide(viewsOf(engine.doc))).toBe('Right');
  });

  it('counts shots as used and keeps the start, like ticking boxes in Acrobat', () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    play(engine, [...pickSteps('Left', 'Arrows'), { edit: 'AmmoLeftDisplay.Amount', text: '20' }]);
    for (let i = 0; i < 5; i++) play(engine, countSteps(first(engine), first(engine).amount - 1));
    expect(first(engine)).toMatchObject({ amount: 15, start: 20, used: 5 });
    // The PDF's quiver follows: 15 boxes free, 5 ticked.
    const fields = viewsOf(engine.doc);
    expect(valueOf(fields, 'AmmoLeftDisplay.CurrentAmount')).toBe('15');
    expect(valueOf(fields, 'AmmoLeft.Top.1')).toBe('Off');
    expect(valueOf(fields, 'AmmoLeft.Base.20')).not.toBe('Off');
    // One back with +: still counted from 20.
    play(engine, countSteps(first(engine), first(engine).amount + 1));
    expect(first(engine)).toMatchObject({ amount: 16, start: 20, used: 4 });
  });

  it('raises the start when + goes above it, and never counts below 0', () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    play(engine, [...pickSteps('Left', 'Javelins'), { edit: 'AmmoLeftDisplay.Amount', text: '1' }]);
    play(engine, countSteps(first(engine), 2));
    expect(first(engine)).toMatchObject({ amount: 2, start: 2, used: 0 });
    play(engine, countSteps(first(engine), -3));
    expect(first(engine)).toMatchObject({ amount: 0, start: 2, used: 2 });
  });

  it('picks up half, all or none after a fight, and the next fight counts from there', () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    play(engine, [...pickSteps('Left', 'Arrows'), { edit: 'AmmoLeftDisplay.Amount', text: '20' }]);
    play(engine, countSteps(first(engine), 15));
    expect(half(5)).toBe(2);
    play(engine, collectSteps(first(engine), half(first(engine).used)));
    expect(first(engine)).toMatchObject({ amount: 17, start: 17, used: 0 });
    play(engine, countSteps(first(engine), 14));
    play(engine, collectSteps(first(engine), 99));
    expect(first(engine)).toMatchObject({ amount: 17, start: 17, used: 0 });
    play(engine, countSteps(first(engine), 16));
    play(engine, collectSteps(first(engine), 0));
    expect(first(engine)).toMatchObject({ amount: 16, start: 16, used: 0 });
  });

  it('a typed amount is the new start', () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    play(engine, [...pickSteps('Left', 'Arrows'), { edit: 'AmmoLeftDisplay.Amount', text: '20' }]);
    play(engine, countSteps(first(engine), 12));
    play(engine, countSteps(first(engine), 40, true));
    expect(first(engine)).toMatchObject({ amount: 40, start: 40, used: 0 });
  });

  it('clears a counter with an empty name, as MPMB does', () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    play(engine, [...pickSteps('Right', 'Bolts'), { edit: 'AmmoRightDisplay.Amount', text: '10' }]);
    expect(ammoOf(engine)).toMatchObject([{ side: 'Right', name: 'Bolts', amount: 10 }]);
    play(engine, pickSteps('Right', ''));
    expect(ammoOf(engine)).toEqual([]);
    expect(valueOf(viewsOf(engine.doc), 'AmmoRightDisplay.Amount')).toBe('');
  });
});

describe('experience points', () => {
  it('reads the total and the next level', () => {
    const fields = viewsOf(openSheet(referenceSheet('paladin8-warlock2')).doc);
    expect(readExperience(fields)).toEqual({ total: 64000, next: 85000 });
  });

  it("adds points through MPMB's box and button, and empties the box again", () => {
    const player = new ScriptedHost();
    const engine = openSheet(referenceSheet('paladin8-warlock2'), player);
    play(engine, addExperienceSteps(1500));
    expect(readExperience(viewsOf(engine.doc))).toEqual({ total: 65500, next: 85000 });
    expect(valueOf(viewsOf(engine.doc), 'Add Experience')).toBe('');
    expect(player.asked).toEqual([]);
  });

  it('lets MPMB ask about a new level when the points reach it', () => {
    const player = new ScriptedHost({ dialogs: { 'EXPERIENCE POINTS DIALOG': { close: 'cancel' } } });
    const engine = openSheet(referenceSheet('paladin8-warlock2'), player);
    play(engine, addExperienceSteps(21000));
    expect(player.asked).toEqual([{ kind: 'dialog', what: 'EXPERIENCE POINTS DIALOG' }]);
    expect(readExperience(viewsOf(engine.doc)).total).toBe(85000);
    expect(valueOf(viewsOf(engine.doc), 'Character Level')).toBe('10');
  });
});

describe('advantage on initiative and attacks', () => {
  it("marks initiative and the attack rolls in the PDF's own boxes", () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    const marks = () => readRollMarks(viewsOf(engine.doc));
    expect(edgeOf(marks().initiative)).toBe('');
    play(engine, markSteps(marks().initiative, 'Init', 'adv'));
    expect(edgeOf(marks().initiative)).toBe('adv');
    play(engine, markSteps(marks().attacks, 'Att', 'dis'));
    expect(edgeOf(marks().attacks)).toBe('dis');
    // Switching takes one click: MPMB unticks the other box (SetDisAdv).
    expect(markSteps(marks().attacks, 'Att', 'adv')).toEqual([{ click: 'Att Adv' }]);
    play(engine, markSteps(marks().attacks, 'Att', 'adv'));
    expect(marks().attacks).toEqual({ advantage: true, disadvantage: false });
    play(engine, markSteps(marks().initiative, 'Init', ''));
    expect(marks().initiative).toEqual({ advantage: false, disadvantage: false });
  });

  it('treats both boxes ticked as no mark, and Normal unticks both', () => {
    const both = { advantage: true, disadvantage: true };
    expect(edgeOf(both)).toBe('');
    expect(markSteps(both, 'Init', '')).toEqual([{ click: 'Init Adv' }, { click: 'Init Dis' }]);
    expect(markSteps({ advantage: false, disadvantage: false }, 'Att', '')).toEqual([]);
  });

  it('leaves attacks with a saving throw DC out of the attack roll mark', () => {
    expect(isAttackRoll('+8')).toBe(true);
    expect(isAttackRoll('-1')).toBe(true);
    expect(isAttackRoll('DC 14')).toBe(false);
    expect(isAttackRoll('')).toBe(false);
    // MPMB's own format: Sacred Flame is a Dexterity save, so its "To Hit" is the DC.
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    engine.edit('Attack.3.Weapon Selection', 'Sacred Flame');
    const flame = readAttacks(viewsOf(engine.doc)).filter((a) => a.name === 'Sacred Flame')[0];
    expect(flame?.toHit).toMatch(/^DC \d+$/);
    expect(isAttackRoll(flame?.toHit ?? '')).toBe(false);
  });
});
