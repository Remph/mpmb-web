// M9's done check: add-on scripts added through the "Add-on scripts" window's path (MPMB's files dialog,
// answered as the worker does) show in the Build screen's lists: a class with its subclass in the Class
// step, a species in the Species step, a cantrip in the Spells step, and their source in the line under
// the lists. The scripts are made up for the test (no game content), in MPMB's add-on syntax, like a
// script from MPMB's community list.
import { describe, expect, test } from 'vitest';
import { FILES_DIALOG_SCRIPT, answerFilesDialog } from '../src/engine/add-ons.ts';
import type { ScriptChanges } from '../src/engine/add-ons.ts';
import { BUILDER_INFO_SCRIPT, readBuilderInfo } from '../src/engine/builder.ts';
import type { Host } from '../src/engine/host.ts';
import { SPELLS_READ_SCRIPT, readSpellsInfo } from '../src/engine/spells.ts';
import { openSheet, referenceSheet } from './characters.ts';
import { ScriptedHost } from './hosts.ts';

/** A source, a species and a cantrip for wizards. */
const SPECIES_AND_SPELL = `var iFileName = "MPMB Web test script.js";
RequiredSheetVersion("24.0.0");
SourceList["MWT"] = { name : "MPMB Web test script", abbreviation : "MWT", abbreviationSpellsheet : "T", group : "Homebrew", date : "2026/11/03" };
RaceList["testling"] = {
	regExpSearch : /testling/i,
	name : "Testling",
	source : [["MWT", 1]],
	plural : "Testlings",
	size : 3,
	speed : { walk : { spd : 30, enc : 20 } },
	trait : "Testling: I check everything twice.",
};
SpellsList["test spark"] = {
	name : "Test Spark",
	classes : ["wizard", "tester"],
	source : [["MWT", 2]],
	level : 0,
	school : "Evoc",
	time : "1 a",
	range : "60 ft",
	components : "V,S",
	duration : "Instantaneous",
	description : "A spark that lights when a test passes",
	descriptionFull : "A small spark lights up when a test passes.",
};`;

/** A class with one subclass, in a second script that uses the first one's source. */
const CLASS = `var iFileName = "MPMB Web test class.js";
RequiredSheetVersion("24.0.0");
ClassList["tester"] = {
	regExpSearch : /tester/i,
	name : "Tester",
	source : [["MWT", 10]],
	primaryAbility : "Wisdom",
	prereqs : "Wisdom 13",
	die : 8,
	improvements : [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5],
	saves : ["Wis", "Int"],
	skillstxt : { primary : "Choose 2: Insight, Investigation, Perception." },
	armorProfs : { primary : [true, false, false, false], secondary : [true, false, false, false] },
	weaponProfs : { primary : [true, false], secondary : [true, false] },
	subclasses : ["Tester Path", []],
	attacks : [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
	features : {
		"double check" : {
			name : "Double Check",
			source : [["MWT", 10]],
			minlevel : 1,
			description : "\\n   I check everything twice.",
		},
	},
};
AddSubClass("tester", "path of checks", {
	regExpSearch : /checks/i,
	subname : "Path of Checks",
	source : [["MWT", 11]],
	features : {},
});`;

/**
 * The player's host, with MPMB's files dialog answered as the worker does for the window's Apply and the
 * new files' code handed to its "Add file" presses; everything else goes to the player.
 */
function withScripts(player: ScriptedHost, changes: ScriptChanges): Host {
  const answer = answerFilesDialog(changes);
  const files = [...changes.add];
  return {
    alert: player.alert.bind(player),
    popUpMenu: player.popUpMenu.bind(player),
    dialog: (view, first) => answer(view) ?? player.dialog(view, first),
    openFile: () => files.shift() ?? null,
  };
}

/** The made-up class's hit die. */
const TESTER_DIE = 8;

describe('a community script in the Build screen’s lists', () => {
  // The wizard reference: its Spells step has a wizard source whose cantrips the new spell joins.
  const player = new ScriptedHost();
  const engine = openSheet(
    referenceSheet('wizard10-evoker'),
    withScripts(player, { remove: [], add: [SPECIES_AND_SPELL, CLASS] }),
  );
  const before = readBuilderInfo(engine.evaluate(BUILDER_INFO_SCRIPT));
  // The window's Apply.
  engine.evaluate(FILES_DIALOG_SCRIPT);
  engine.runTimers();
  const info = readBuilderInfo(engine.evaluate(BUILDER_INFO_SCRIPT));

  test('both run without errors, and MPMB’s Source Selection opens for the player', () => {
    expect(engine.stats.errors).toEqual([]);
    expect(player.asked.map((a) => (a.kind === 'dialog' ? a.what : a.kind))).toEqual([
      'alert',
      'SOURCE SELECTION DIALOG',
    ]);
  });

  test('the Class step offers the class and its subclass', () => {
    expect(before.classes.map((c) => c.key)).not.toContain('tester');
    const tester = info.classes.find((c) => c.key === 'tester');
    expect(tester?.name).toBe('Tester');
    expect(tester?.die).toBe(TESTER_DIE);
    expect(tester?.subclasses.map((s) => s.name)).toEqual(['Path of Checks']);
    expect(tester?.firstFeatures).toEqual(['Double Check']);
  });

  test('the Species step offers the species', () => {
    expect(info.origins.species.find((s) => s.key === 'testling')?.name).toBe('Testling');
  });

  test('the Spells step offers the cantrip to the wizard', () => {
    const spells = readSpellsInfo(engine.evaluate(SPELLS_READ_SCRIPT));
    const wizard = spells.sources.find((source) => source.key === 'wizard');
    expect(wizard?.cantrips?.list).toContain('test spark');
  });

  test('the line under the lists names the script’s source', () => {
    expect(before.sources).not.toContain('MPMB Web test script');
    expect(info.sources).toContain('MPMB Web test script');
    expect(info.sources).toContain('System Reference Document v5.2.1');
  });

  test('a source switched off in Source Selection leaves the lists and the line', () => {
    engine.evaluate('CurrentSources.globalExcl.push("MWT")');
    const off = readBuilderInfo(engine.evaluate(BUILDER_INFO_SCRIPT));
    expect(off.sources).not.toContain('MPMB Web test script');
    expect(off.classes.map((c) => c.key)).not.toContain('tester');
    engine.evaluate('CurrentSources.globalExcl.pop()');
  });
});
