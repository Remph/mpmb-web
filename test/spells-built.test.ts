// M7's done check: each reference character built in the app from a blank sheet, the way the Build
// screen's steps write MPMB's fields, then its spells chosen on the Spells step and its prepared spells
// ticked in the Spells tab. Its spell sheet pages must then hold what Acrobat saved, field by field.
import { describe, expect, test } from 'vitest';
import { classFieldText, rowsOf } from '../src/build/classes.ts';
import { draftOf, picksOf, sheetDraftOf, sheetPicksOf } from '../src/build/spells.ts';
import type { SpellDraft } from '../src/build/spells.ts';
import { BUILDER_INFO_SCRIPT, answerUnits, readBuilderInfo } from '../src/engine/builder.ts';
import type { Engine } from '../src/engine/engine.ts';
import type { DialogElement, DialogReply, DialogView, Host } from '../src/engine/host.ts';
import { answerScores } from '../src/engine/scores.ts';
import { SPELLS_READ_SCRIPT, applySpellPicks, readSpellsInfo } from '../src/engine/spells.ts';
import { valueOf } from '../src/play/read.ts';
import { checkboxField, readSpells, spellPages } from '../src/play/spells.ts';
import { viewsOf } from '../src/worker/views.ts';
import { REFERENCE_CHARACTERS, openSheet, referenceSheet } from './characters.ts';
import type { ReferenceCharacter } from './characters.ts';
import { ScriptedHost } from './hosts.ts';

type Answer = (view: DialogView) => DialogReply | null;

/** Every element of a dialog, depth first. */
const elementsOf = (elements: DialogElement[] = []): DialogElement[] =>
  elements.flatMap((e) => [e, ...elementsOf(e.elements)]);

const ABILITY_NAMES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];

/**
 * What the player picked in MPMB's own "Select Spellcasting Ability for …" pop-up (Magic Initiate lets
 * the player choose Int, Wis or Cha), read from the reference: the ability its spell source has. The app
 * shows that pop-up to the player as it is; other pop-ups are closed with OK, as the test hosts do.
 */
function playerAnswer(acrobat: Engine): Answer {
  const abilities = JSON.parse(
    String(
      acrobat.evaluate(
        '(function () { var o = {}; for (var k in CurrentSpells) { o[k] = CurrentSpells[k].ability; o[CurrentSpells[k].name] = CurrentSpells[k].ability; } return JSON.stringify(o); })()',
      ),
    ),
  ) as Record<string, unknown>;
  return (view) => {
    if (view.description.name !== 'ASK USER DIALOG') return null;
    const elements = elementsOf(view.description.elements);
    const head = String(elements.find((e) => e.item_id === 'head')?.name ?? '');
    // "Select Spellcasting Ability for Magic Initiate (Cleric)". Try it:
    // https://regex101.com/?regex=%5ESelect%20Spellcasting%20Ability%20for%20(.%2B)%24&testString=Select%20Spellcasting%20Ability%20for%20Magic%20Initiate
    const caster = /^Select Spellcasting Ability for (.+)$/.exec(head)?.[1] ?? '';
    const ability = abilities[caster];
    if (typeof ability !== 'number') return null;
    const state = { ...view.state };
    elements
      .filter((e) => e.type === 'radio' && e.item_id)
      .forEach((e) => (state[e.item_id ?? ''] = e.name === ABILITY_NAMES[ability - 1]));
    return { type: 'close', result: 'ok', state };
  };
}

/** A blank sheet whose host answers the dialogs the app answers itself, as the worker's `answered` does. */
function blank(player: Answer) {
  const scripted = new ScriptedHost();
  let answer: Answer | null = null;
  const host: Host = {
    alert: scripted.alert.bind(scripted),
    popUpMenu: scripted.popUpMenu.bind(scripted),
    dialog: (view, first) => answer?.(view) ?? player(view) ?? scripted.dialog(view, first),
  };
  const engine = openSheet(undefined, host);
  const answered = (a: Answer, job: () => void): void => {
    answer = a;
    try {
      job();
    } finally {
      answer = null;
    }
  };
  return { engine, answered };
}

const spellsOf = (engine: Engine) => readSpellsInfo(engine.evaluate(SPELLS_READ_SCRIPT));

/** The Build screen's steps, with what the player picked for the reference character. */
function build(name: ReferenceCharacter) {
  const acrobat = openSheet(referenceSheet(name));
  const was = readBuilderInfo(acrobat.evaluate(BUILDER_INFO_SCRIPT));
  const typed = (field: string): string => valueOf(viewsOf(acrobat.doc), field);
  const { engine, answered } = blank(playerAnswer(acrobat));

  // The sheet menu's units switch (both references are metric), then the steps in the rail's order.
  answered(answerUnits('metric'), () => engine.clickBookmark(['Functions', 'Unit System']));
  engine.edit('Class and Levels', classFieldText(rowsOf(was.known), was.classes));
  engine.edit('Race', typed('Race'));
  engine.edit('Background', typed('Background'));
  // The Ability scores step: the columns the player types (MPMB adds up the rest itself).
  const typedColumns = was.scores.columns
    .map((c, column) => ({ column, scores: c.scores, type: c.type }))
    .filter((c) => ['base', 'background', 'levels', 'feats', 'extra'].includes(c.type));
  answered(answerScores(typedColumns), () => engine.click('Ability Scores Button'));
  engine.edit('Feat Name 1', typed('Feat Name 1'));
  [1, 2, 3, 4].forEach((n) => {
    const item = typed(`Extra.Magic Item ${n}`);
    if (item) engine.edit(`Extra.Magic Item ${n}`, item);
  });
  engine.edit('PC Name', typed('PC Name'));

  // The Spells step: each source's picks as the reference has them, sent once with "Update spell sheet".
  const want = spellsOf(acrobat);
  const now = spellsOf(engine);
  const drafts: Record<string, SpellDraft> = {};
  now.sources.forEach((source) => {
    const same = want.sources.find((s) => s.key === source.key);
    if (same) drafts[source.key] = draftOf(same);
  });
  applySpellPicks(engine, picksOf(now, drafts), answered, sheetPicksOf(now, sheetDraftOf(want)));

  // The Spells tab: a tap on each spell the reference has prepared.
  const prepared = readSpells(viewsOf(acrobat.doc)).flatMap((source) =>
    source.levels.flatMap((l) => l.spells.filter((s) => s.mark.prepared === true && !s.mark.always)),
  );
  const built = readSpells(viewsOf(engine.doc)).flatMap((source) => source.levels.flatMap((l) => l.spells));
  prepared.forEach((spell) => {
    const same = built.find((s) => s.key === spell.key && s.mark.prepared === false);
    if (same) engine.click(checkboxField(same));
  });
  return { acrobat, engine };
}

/** The spell sheet pages' fields by page order ("1.spells.name.3"), as page numbers may differ. */
function spellFields(engine: Engine): Record<string, string> {
  const views = viewsOf(engine.doc);
  const out: Record<string, string> = {};
  spellPages(views).forEach(({ prefix }, page) => {
    Object.keys(views)
      .filter((name) => name.startsWith(prefix))
      .forEach((name) => {
        const value = valueOf(views, name);
        if (value !== '' && value !== 'Off') out[`${page + 1}.${name.slice(prefix.length)}`] = value;
      });
  });
  return out;
}

/** Both sides' differences, one line each: "page.field: Acrobat | app". */
function differences(want: Record<string, string>, got: Record<string, string>): string {
  const SHOWN = 80;
  return [...new Set([...Object.keys(want), ...Object.keys(got)])]
    .filter((k) => want[k] !== got[k])
    .sort()
    .map(
      (k) => `${k}: ${JSON.stringify(want[k] ?? '').slice(0, SHOWN)} | ${JSON.stringify(got[k] ?? '').slice(0, SHOWN)}`,
    )
    .join('\n');
}

describe.each(REFERENCE_CHARACTERS)('%s built in the app', (name) => {
  const { acrobat, engine } = build(name);

  test('has the spell sheet pages Acrobat saved, field by field', () => {
    expect(engine.stats.errors).toEqual([]);
    expect(differences(spellFields(acrobat), spellFields(engine))).toBe('');
  });

  test('MPMB making the spell sheet again in the app gives what Acrobat made', () => {
    const again = openSheet(referenceSheet(name));
    applySpellPicks(again, [], (_answer, job) => job(), null);
    expect(differences(spellFields(acrobat), spellFields(again))).toBe('');
  });
});
