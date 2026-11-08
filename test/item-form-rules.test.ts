// A magic item that comes in forms, through MPMB's own scripts: MPMB names the row after the picked form
// ("Test Ring (Red)"), but the limited feature and the actions it adds say they came from "Test Ring" and
// "Test Ring [Red] (magic item)". The Combat tab finds the item's text by those names (ruleIndex). The
// item is made up for the test (no game content), in MPMB's add-on syntax.
import { expect, test } from 'vitest';
import { featureRule, readActionList, ruleFor, ruleIndex } from '../src/play/actions.ts';
import { readLimitedFeatures } from '../src/play/read.ts';
import { viewsOf } from '../src/worker/views.ts';
import { blankSheet } from '../src/engine/sheet.ts';
import { openSheet } from './characters.ts';
import { ScriptedHost } from './hosts.ts';

const RING = `MagicItemsList["test ring"] = {
	name : "Test Ring",
	source : ["HB", 0],
	type : "ring",
	rarity : "uncommon",
	description : "Select one of the choices.",
	usages : 3,
	recovery : "dawn",
	additional : "regains 1d3",
	choices : ["Blue", "Red"],
	"blue" : {
		description : "A ring with a blue stone. It hums when a test passes.",
	},
	"red" : {
		description : "A ring with a red stone. As a Bonus Action, I can make it glow.",
		action : [["bonus action", "Red Glow"]],
	},
};`;

test("a magic item's form: its limited feature and its form's action open the item's text", () => {
  const host = new ScriptedHost();
  const engine = openSheet(blankSheet(), host);
  engine.evaluate(RING);
  // Opening asks its own questions (welcome, sources): only what the edit asks counts.
  host.asked.length = 0;
  // Typed with its form, MPMB picks the form without asking.
  expect(engine.edit('Extra.Magic Item 1', 'Test Ring (Red)', { cancelable: true })).toBe(true);
  expect(host.asked).toEqual([]);
  expect(engine.stats.errors).toEqual([]);

  const fields = viewsOf(engine.doc);
  expect(fields['Extra.Magic Item 1']?.value).toBe('Test Ring (Red)');
  const index = ruleIndex(fields);

  const feature = readLimitedFeatures(fields).find((f) => f.name.startsWith('Test Ring'));
  expect(feature?.from).toEqual(['Test Ring']);
  expect(feature && featureRule(index, feature)?.title).toBe('Test Ring (Red)');

  const glow = readActionList(fields).bonusAction.find((a) => a.name === 'Red Glow');
  expect(glow?.from).toEqual(['Test Ring [Red] (magic item)']);
  expect(glow && ruleFor(index, glow)?.lines.join(' ')).toContain('make it glow');
});
