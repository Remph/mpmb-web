// Own spells end to end in the engine: the app's generated script goes onto the wizard reference through
// the "Add-on scripts" path (MPMB's files dialog), the spells go to the wizard as extra bonus rows, and
// MPMB's "(Re)generate a Spell Sheet" puts them on the sheet. The spells are made up for the test.
import { describe, expect, test } from 'vitest';
import { BLANK_SPELL, ownSpellKey, ownSpellsScript, suggestLine } from '../src/build/own-spells.ts';
import type { OwnSpell } from '../src/build/own-spells.ts';
import { FILES_DIALOG_SCRIPT, answerQuietFiles, answerScriptsChanged } from '../src/engine/add-ons.ts';
import type { DialogReply, DialogView, Host } from '../src/engine/host.ts';
import { SPELLS_READ_SCRIPT, applySpellPicks, readSpellsInfo } from '../src/engine/spells.ts';
import { readSpells } from '../src/play/spells.ts';
import { viewsOf } from '../src/worker/views.ts';
import { openSheet, referenceSheet } from './characters.ts';
import { ScriptedHost } from './hosts.ts';

const withLine = (spell: OwnSpell): OwnSpell => ({ ...spell, line: suggestLine(spell) });

/** A cantrip whose damage grows, and a level 1 spell with a material component. */
const JAB = withLine({
  ...BLANK_SPELL,
  name: 'Thought Jab',
  time: 'Act',
  range: '120 ft',
  verbal: false,
  somatic: false,
  roll: 'Int',
  damage: '1d10',
  damageType: 'Psychic',
  text: 'A made-up test cantrip.\n\nIt grows at levels 5, 11 and 17.',
});
const WARD: OwnSpell = {
  ...BLANK_SPELL,
  // An accent and a "(B)": MPMB's ParseSpell would change a key holding them (ownSpellKey).
  name: 'Glimmer Ward (B) é',
  level: 1,
  school: 'Abjur',
  time: 'Bns',
  range: 'Self',
  material: 'a bit of glass',
  duration: '1 min',
  concentration: true,
  line: 'Shimmer gives +2 AC until the spell ends',
};

type Answer = (view: DialogView) => DialogReply | null;

describe('own spells on the wizard reference', () => {
  const player = new ScriptedHost();
  const files = [ownSpellsScript([JAB, WARD])];
  // Answered as the worker's quiet setScripts does: the player sees none of it.
  const fileAnswer = answerQuietFiles({ remove: [], add: [...files] });
  let answer: Answer | null = null;
  const host: Host = {
    alert: (request) => answerScriptsChanged(request) ?? player.alert(request),
    popUpMenu: player.popUpMenu.bind(player),
    dialog: (view, first) => answer?.(view) ?? fileAnswer(view) ?? player.dialog(view, first),
    openFile: () => files.shift() ?? null,
  };
  const engine = openSheet(referenceSheet('wizard10-evoker'), host);
  engine.evaluate(FILES_DIALOG_SCRIPT);
  engine.runTimers();
  const answered = (a: Answer, job: () => void): void => {
    answer = a;
    try {
      job();
    } finally {
      answer = null;
    }
  };
  applySpellPicks(engine, [{ key: 'wizard', own: [ownSpellKey(JAB.name), ownSpellKey(WARD.name)] }], answered);
  const info = readSpellsInfo(engine.evaluate(SPELLS_READ_SCRIPT));
  const wizard = info.sources.find((s) => s.key === 'wizard');
  const onSheet = readSpells(viewsOf(engine.doc)).find((s) => s.key === 'wizard');
  const spells = onSheet?.levels.flatMap((l) => l.spells) ?? [];

  test('the script runs and the sheet is made without errors or questions to the player', () => {
    expect(engine.stats.errors).toEqual([]);
    expect(player.asked).toEqual([]);
  });

  test('the step reads them back as the wizard’s extra rows, not as picks', () => {
    const extras = wizard?.bonus.filter((b) => b.extra).map((b) => b.chosen);
    expect(extras).toEqual([ownSpellKey(JAB.name), ownSpellKey(WARD.name)]);
    expect(wizard?.cantrips?.chosen).not.toContain(ownSpellKey(JAB.name));
    expect(info.spells[ownSpellKey(JAB.name)]?.name).toBe('Thought Jab');
  });

  test('the cantrip is on the sheet at will, with the dice for level 10 and its range in metres', () => {
    const jab = spells.find((s) => s.key === ownSpellKey(JAB.name));
    // The evoker's Potent Cantrip rewrites a save cantrip's line ("save half"), as for MPMB's own cantrips.
    expect(jab?.summary).toContain('2d10 Psychic');
    expect(jab?.summary).not.toContain('at CL');
    expect(jab?.mark.atWill).toBe(true);
    expect(jab?.range).toBe('36 m');
    expect(jab?.text).toContain('A made-up test cantrip.');
  });

  test('the level 1 spell is on the sheet', () => {
    const level = onSheet?.levels.find((l) => l.spells.some((s) => s.key === ownSpellKey(WARD.name)));
    expect(level?.level).toBe(1);
    const ward = level?.spells.find((s) => s.key === ownSpellKey(WARD.name));
    expect(ward?.concentration).toBe(true);
    expect(ward?.material).toBe('a bit of glass');
    expect(ward?.summary).toBe('Shimmer gives +2 AC until the spell ends');
    // A wizard prepares it like a spellbook spell.
    expect(ward?.mark.prepared).toBe(false);
  });

  test('taking one out again leaves the other', () => {
    applySpellPicks(engine, [{ key: 'wizard', own: [ownSpellKey(WARD.name)] }], answered);
    const again = readSpellsInfo(engine.evaluate(SPELLS_READ_SCRIPT)).sources.find((s) => s.key === 'wizard');
    expect(again?.bonus.filter((b) => b.extra).map((b) => b.chosen)).toEqual([ownSpellKey(WARD.name)]);
  });
});
