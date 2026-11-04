import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { withValues } from '../../test/fields.ts';
import { viewsOf } from '../worker/views.ts';
import { actionItem, readActionList, ruleFor, ruleIndex } from './actions.ts';

const paladin = viewsOf(openSheet(referenceSheet('paladin8-warlock2')).doc);

describe('actions card', () => {
  it("folds MPMB's basic actions away and keeps the character's own", () => {
    expect(readActionList(paladin)).toEqual({
      action: [],
      bonusAction: [
        { name: 'Lay on Hands', note: '' },
        { name: 'Divine Sense', note: 'Channel Divinity' },
        { name: 'Draconic Flight', note: '' },
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
    });
    expect(actionItem('Rallying Cry (Rallying Cry)')).toEqual({ name: 'Rallying Cry', note: '' });
    expect(actionItem('Quiet Step')).toEqual({ name: 'Quiet Step', note: '' });
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
    expect(list.reaction).toEqual([{ name: 'Gem of Brightness', note: 'light' }]);
    expect(list.action).toEqual([
      { name: 'Gem of Brightness', note: 'beam' },
      { name: 'Wand of Web', note: 'web' },
    ]);
  });
});

describe('rule text for an action', () => {
  const index = ruleIndex(paladin);

  it('finds class features with their source and text', () => {
    const rule = ruleFor(index, { name: 'Lay on Hands', note: '' });
    expect(rule?.title).toBe('Lay on Hands');
    expect(rule?.source).toBe("Paladin 1, SRD'24 53");
    expect(rule?.lines[0]).toMatch(/^As a Bonus Action, I can draw from my pool/);
    expect(rule?.lines).toHaveLength(2);
  });

  it('finds species traits written on one line', () => {
    const rule = ruleFor(index, { name: 'Draconic Flight', note: '' });
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
    expect(ruleFor(custom, { name: 'Stone Hide', note: '' })?.lines).toEqual([
      'My base AC is 13 + Dex mod. As an action, I can blend in with rocks.',
    ]);
    expect(ruleFor(index, { name: 'Lay on Hands - Poison', note: '' })?.title).toBe('Lay on Hands');
  });

  it('has nothing for an action without rule text', () => {
    expect(ruleFor(index, { name: 'Quiet Step', note: '' })).toBeNull();
  });
});
