import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { withValues } from '../../test/fields.ts';
import { viewsOf } from '../worker/views.ts';
import { actionItem, featureNames, featureRule, readActionList, ruleFor, ruleIndex } from './actions.ts';

const paladin = viewsOf(openSheet(referenceSheet('paladin8-warlock2')).doc);

// The reference warlock with the invocation Pact of the Blade, chosen as MPMB's "Choose Feature" menu does: its
// bonus action is named "Conjure/Bond Pact Weapon", and MPMB writes its text to the third page's Notes.
const bladeLock = (() => {
  const engine = openSheet(referenceSheet('paladin8-warlock2'));
  engine.evaluate('ClassFeatureOptions(["warlock", "eldritch invocations", "pact of the blade", "extra"])');
  return viewsOf(engine.doc);
})();

describe('actions card', () => {
  it("folds MPMB's basic actions away and keeps the character's own", () => {
    expect(readActionList(paladin)).toEqual({
      action: [],
      bonusAction: [
        { name: 'Lay on Hands', note: '', from: ['Paladin: Lay on Hands'] },
        { name: 'Divine Sense', note: 'Channel Divinity', from: ['Paladin: Divine Sense'] },
        { name: 'Draconic Flight', note: '', from: ['Silver Dragonborn: Draconic Flight'] },
      ],
      reaction: [],
      basic: [
        'Attack',
        'Magic',
        'Utilize',
        'Dash',
        'Disengage',
        'Dodge',
        'Hide',
        'Search',
        'Study',
        'Influence',
        'Ready',
        'Help',
        'Escape Grapple',
        'Opportunity Attack',
      ],
    });
  });

  it('splits off the note and drops one that only repeats the name', () => {
    expect(actionItem('Gem of Brightness (blinding flash)')).toEqual({
      name: 'Gem of Brightness',
      note: 'blinding flash',
      from: [],
    });
    expect(actionItem('Rallying Cry (Rallying Cry)')).toEqual({ name: 'Rallying Cry', note: '', from: [] });
    expect(actionItem('Quiet Step')).toEqual({ name: 'Quiet Step', note: '', from: [] });
  });

  it('keeps where an action came from when the same action is typed in again', () => {
    const typed = readActionList(withValues(paladin, { 'Bonus Action 5': 'Lay on Hands' }));
    expect(typed.bonusAction.filter((a) => a.name === 'Lay on Hands')).toEqual([
      { name: 'Lay on Hands', note: '', from: ['Paladin: Lay on Hands'] },
    ]);
  });

  it('shows an action only once per kind', () => {
    const doubled = withValues(paladin, {
      'Bonus Action 4': 'Rallying Cry',
      'Bonus Action 5': 'Rallying Cry (Rallying Cry)',
      'Reaction 2': 'Gem of Brightness (light)',
      'Action 5': 'Gem of Brightness (beam) / Wand of Web (web)',
    });
    const list = readActionList(doubled);
    expect(list.bonusAction.filter((a) => a.name === 'Rallying Cry')).toHaveLength(1);
    expect(list.reaction).toEqual([{ name: 'Gem of Brightness', note: 'light', from: [] }]);
    expect(list.action).toEqual([
      { name: 'Gem of Brightness', note: 'beam', from: [] },
      { name: 'Wand of Web', note: 'web', from: [] },
    ]);
  });
});

describe('rule text for an action', () => {
  const index = ruleIndex(paladin);

  it('finds class features with their source and text', () => {
    const rule = ruleFor(index, actionItem('Lay on Hands'));
    expect(rule?.title).toBe('Lay on Hands');
    expect(rule?.source).toBe("Paladin 1, SRD'24 53");
    expect(rule?.lines[0]).toMatch(/^As a Bonus Action, I can draw from my pool/);
    expect(rule?.lines).toHaveLength(2);
  });

  it('finds species traits written on one line', () => {
    const rule = ruleFor(index, actionItem('Draconic Flight'));
    expect(rule?.source).toBe('level 5');
    expect(rule?.lines).toEqual([expect.stringMatching(/^As a Bonus Action once per Long Rest/)]);
  });

  it("finds an add-on script's bullet trait and a feature named before a dash", () => {
    const custom = ruleIndex(
      withValues(paladin, {
        'Racial Traits':
          '**Test Folk**\r• Stone Hide: My base AC is 13 + Dex mod. As an action, I can blend in with rocks.',
      }),
    );
    expect(ruleFor(custom, actionItem('Stone Hide'))?.lines).toEqual([
      'My base AC is 13 + Dex mod. As an action, I can blend in with rocks.',
    ]);
    expect(ruleFor(index, actionItem('Lay on Hands - Poison'))?.title).toBe('Lay on Hands');
  });

  it('finds a feature MPMB wrote to the Notes through where the action came from', () => {
    const item = readActionList(bladeLock).bonusAction.find((a) => a.name === 'Conjure/Bond Pact Weapon');
    expect(item?.from).toEqual(['Warlock: Pact of the Blade']);
    const rule = item && ruleFor(ruleIndex(bladeLock), item);
    expect(rule?.title).toBe('Pact of the Blade');
    expect(rule?.source).toBe("Eldritch Invocation, SRD'24 74");
    expect(rule?.lines[0]).toMatch(/^As a Bonus Action, I can bond with a magical weapon/);
    expect(rule?.lines).toHaveLength(3);
  });

  it("forgets where an action came from once the player types over MPMB's row", () => {
    const row = Object.keys(bladeLock).find(
      (name) => /^Bonus Action \d+$/.test(name) && bladeLock[name]?.value === 'Conjure/Bond Pact Weapon',
    );
    expect(row).toBeDefined();
    const typed = withValues(bladeLock, { [row ?? '']: 'Quiet Step' });
    const item = readActionList(typed).bonusAction.find((a) => a.name === 'Quiet Step');
    expect(item?.from).toEqual([]);
    expect(item && ruleFor(ruleIndex(typed), item)).toBeNull();
  });

  it('finds a feature on an extra notes page', () => {
    const noted = ruleIndex(
      withValues(paladin, {
        'P5.ASnotes.Notes.Right':
          "#◆ Gaze of Two Minds# (Eldritch Invocation, SRD'24 73)\rAs a Bonus Action, I can touch a willing creature.",
      }),
    );
    expect(ruleFor(noted, actionItem('Gaze of Two Minds'))?.lines).toEqual([
      'As a Bonus Action, I can touch a willing creature.',
    ]);
  });

  it('keeps the first text when a feature is in the notes again', () => {
    const twice = ruleIndex(
      withValues(paladin, { 'Extra.Notes': "#◆ Lay on Hands# (Paladin 1, SRD'24 53)\rA shorter copy." }),
    );
    expect(ruleFor(twice, actionItem('Lay on Hands'))?.lines).toHaveLength(2);
  });

  it("keeps MPMB's bold and italic marks for the view to draw", () => {
    const marked = ruleIndex(
      withValues(paladin, {
        'Extra.Notes': '#◆ Test Strike# (Test 1). Deals (4)/**8**/12 damage.\rOnly *once per turn*.',
      }),
    );
    expect(ruleFor(marked, actionItem('Test Strike'))?.lines).toEqual([
      'Deals (4)/**8**/12 damage.',
      'Only *once per turn*.',
    ]);
  });

  it('takes the text from the third page when the feature there only says "(see third page)"', () => {
    const features = paladin['Class Features']?.value;
    const pointed = ruleIndex(
      withValues(paladin, {
        'Class Features': `${typeof features === 'string' ? features : ''}\r#◆ Mind Edge# (Rogue 3, Test 1) (see third page)`,
        'Extra.Notes': '#◆ Mind Edge# (Rogue 3)\rWhenever I take the Attack action, I can strike with a mind edge.',
      }),
    );
    const rule = ruleFor(pointed, actionItem('Mind Edge'));
    expect(rule?.lines).toEqual(['Whenever I take the Attack action, I can strike with a mind edge.']);
    expect(rule?.source).toBe('Rogue 3');
  });

  it('keeps "(see third page)" when no text is found anywhere', () => {
    const features = paladin['Class Features']?.value;
    const pointed = ruleIndex(
      withValues(paladin, {
        'Class Features': `${typeof features === 'string' ? features : ''}\r#◆ Mind Edge# (Rogue 3, Test 1) (see third page)`,
      }),
    );
    expect(ruleFor(pointed, actionItem('Mind Edge'))?.lines).toEqual(['(see third page)']);
  });

  it("reads the feature's name from MPMB's source", () => {
    expect(featureNames('Warlock: Pact of the Blade')).toEqual(['Pact of the Blade']);
    expect(featureNames('Paladin (Oath of Devotion): Sacred Weapon')).toEqual(['Sacred Weapon']);
    expect(featureNames('Wand of Web (magic item)')).toEqual(['Wand of Web (magic item)', 'Wand of Web']);
    expect(featureNames('Default action')).toEqual(['Default action']);
  });

  it('has nothing for an action without rule text', () => {
    expect(ruleFor(index, actionItem('Quiet Step'))).toBeNull();
  });
});

describe('rule text for a limited feature', () => {
  const index = ruleIndex(paladin);

  it('finds it by name, without the note MPMB adds', () => {
    expect(featureRule(index, { name: 'Lay on Hands', from: [] })?.title).toBe('Lay on Hands');
    expect(featureRule(index, { name: 'Channel Divinity (regain 1/SR)', from: [] })?.title).toBe('Channel Divinity');
  });

  it('finds it by where it came from when the name differs', () => {
    expect(featureRule(index, { name: 'Holy Glow', from: ['Paladin: Lay on Hands'] })?.title).toBe('Lay on Hands');
    expect(featureRule(index, { name: 'Holy Glow', from: [] })).toBeNull();
  });
});

describe('rule text for a named part of a feature', () => {
  // MPMB writes the parts of a feature as "***Name***. Text" inside the feature's text.
  const notes = [
    '#◆ Garden Gnome# (Test 1)',
    'A painted clay gnome.',
    '***Tend the Beds***. During a Long Rest, the gnome waters the plants around me.',
    'They grow a little faster.',
    '   ***Shout (1/LR or charge)***. As a Bonus Action, the gnome shouts a warning.',
    '#◆ Other Thing# (Test 2)',
    'Something else.',
  ].join('\r');
  const index = ruleIndex(withValues(paladin, { 'Extra.Notes': notes }));

  it("finds the part with its own text and the feature's source", () => {
    expect(featureRule(index, { name: 'Tend the Beds', from: [] })).toEqual({
      title: 'Tend the Beds',
      source: 'Test 1',
      lines: ['During a Long Rest, the gnome waters the plants around me.', 'They grow a little faster.'],
    });
  });

  it('finds a part by its name without the note on its uses', () => {
    expect(featureRule(index, { name: 'Shout', from: [] })?.lines).toEqual([
      'As a Bonus Action, the gnome shouts a warning.',
    ]);
  });

  it("keeps the parts in the whole feature's text", () => {
    expect(featureRule(index, { name: 'Garden Gnome', from: [] })?.lines).toHaveLength(4);
  });
});
