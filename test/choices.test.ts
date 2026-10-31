// The Build screen's Choices step on the engine (src/engine/choices.ts): the choices MPMB's own menus
// offer the reference paladin/warlock, and that answering a menu as the worker's `pick` does applies them.
import { describe, expect, test } from 'vitest';
import { BUILDER_INFO_SCRIPT, readBuilderInfo } from '../src/engine/builder.ts';
import type { BuilderInfo } from '../src/engine/builder.ts';
import { offers } from '../src/engine/choices.ts';
import type { Choice } from '../src/engine/choices.ts';
import type { Engine } from '../src/engine/engine.ts';
import type { MenuItem } from '../src/engine/host.ts';
import { openSheet, referenceSheet } from './characters.ts';
import { ScriptedHost } from './hosts.ts';

const infoOf = (engine: Engine): BuilderInfo => readBuilderInfo(engine.evaluate(BUILDER_INFO_SCRIPT));

/** Answers the next menu as the worker's `pick` does: with the answer when the menu offers it. */
class PickHost extends ScriptedHost {
  private answer: string | null = null;
  picked = false;

  /** The answer for the next menu. */
  next(answer: string): void {
    this.answer = answer;
  }

  override popUpMenu(items: MenuItem[]): string | null {
    const answer = this.answer;
    this.answer = null;
    if (answer === null) return super.popUpMenu(items);
    this.picked = offers(items, answer);
    return this.picked ? answer : null;
  }
}

function pick(engine: Engine, host: PickHost, choice: Choice | undefined, label: string): boolean {
  const option = choice?.sections.flatMap((s) => s.options).filter((o) => o.label === label)[0];
  if (!choice || !option) throw new Error(`No option ${label}`);
  host.next(option.value);
  engine.click(choice.field);
  return host.picked;
}

/** What the reference's levels allow: two weapon masteries (Paladin 8), three invocations (Warlock 2). */
const MASTERIES = 2;
const INVOCATIONS = 3;

const named = (info: BuilderInfo, name: string): Choice | undefined => info.choices.filter((c) => c.name === name)[0];

describe('the choices from MPMB menus', () => {
  test('what the reference paladin/warlock still has to choose', () => {
    const { choices } = infoOf(openSheet(referenceSheet('paladin8-warlock2')));
    expect(choices.map((c) => [c.kind, c.owner, c.name, c.selected, c.allowed, c.open])).toEqual([
      ['class', 'Paladin (Oath of Devotion)', 'Weapon Mastery', 0, MASTERIES, true],
      ['class', 'Paladin (Oath of Devotion)', 'Fighting Style', 0, null, true],
      ['class', 'Warlock (Fiend Patron)', 'Eldritch Invocation', 0, INVOCATIONS, true],
      ['species', 'Silver Dragonborn', '', 1, null, false],
      ['feat', 'Magic Initiate', '', 1, null, false],
    ]);
    const style = choices[1];
    expect(style?.sections).toHaveLength(1);
    expect(style?.sections[0]?.options[2]).toMatchObject({ label: 'Defense', source: "SRD'24 88", chosen: false });
    expect(style?.sections[0]?.options[2]?.description.startsWith("While I'm wearing")).toBe(true);

    // MPMB lists every weapon by type and again by mastery; each shows once, by type.
    const mastery = choices[0];
    const masteryOptions = mastery?.sections.flatMap((s) => s.options.map((o) => o.value)) ?? [];
    expect(new Set(masteryOptions).size).toBe(masteryOptions.length);
    expect(mastery?.sections.map((s) => s.heading)).toEqual([
      'Mastery Text Only',
      'Simple Melee Weapon',
      'Simple Ranged Weapon',
      'Martial Melee Weapon',
      'Martial Ranged Weapon',
    ]);
    // Invocations the warlock can't take yet are offered greyed out, as in MPMB's menu.
    const smite = choices[2]?.sections.flatMap((s) => s.options).filter((o) => o.label.startsWith('Eldritch Smite'))[0];
    expect(smite?.enabled).toBe(false);

    expect(choices[3]?.chosen).toEqual(['Silver Dragonborn']);
    expect(choices[4]?.chosen).toEqual(['Cleric']);
    expect(choices[4]?.field).toBe('Feat Button 1');
  });

  test('picking through the menus, as the player would', () => {
    const host = new PickHost();
    const engine = openSheet(referenceSheet('paladin8-warlock2'), host);

    expect(pick(engine, host, named(infoOf(engine), 'Fighting Style'), 'Defense')).toBe(true);
    let info = infoOf(engine);
    expect(named(info, 'Fighting Style')).toMatchObject({ chosen: ['Defense'], open: false });

    // Several picks for an extra choice, one at a time; a picked one can be taken back.
    const picks = ['Pact of the Tome', "Devil's Sight"];
    picks.forEach((label) => pick(engine, host, named(infoOf(engine), 'Eldritch Invocation'), label));
    info = infoOf(engine);
    expect(named(info, 'Eldritch Invocation')).toMatchObject({
      selected: picks.length,
      allowed: INVOCATIONS,
      open: true,
    });
    pick(engine, host, named(info, 'Eldritch Invocation'), 'Pact of the Tome');
    expect(named(infoOf(engine), 'Eldritch Invocation')).toMatchObject({ selected: 1, chosen: ["Devil's Sight"] });

    // An option MPMB greys out is not picked.
    const invocations = named(infoOf(engine), 'Eldritch Invocation');
    const smite = invocations?.sections
      .flatMap((s) => s.options)
      .filter((o) => o.label.startsWith('Eldritch Smite'))[0];
    expect(smite && pick(engine, host, invocations, smite.label)).toBe(false);

    const species = infoOf(engine).choices.filter((c) => c.kind === 'species')[0];
    pick(engine, host, species, 'Gold Dragonborn');
    expect(engine.doc.getField('Race')?.value).toBe('Gold Dragonborn');

    const feat = infoOf(engine).choices.filter((c) => c.kind === 'feat')[0];
    pick(engine, host, feat, 'Druid');
    expect(engine.doc.getField('Feat Name 1')?.value).toBe('Magic Initiate [Druid]');
    expect(infoOf(engine).choices.filter((c) => c.kind === 'feat')[0]?.chosen).toEqual(['Druid']);
    expect(engine.stats.errors).toEqual([]);
  });
});
