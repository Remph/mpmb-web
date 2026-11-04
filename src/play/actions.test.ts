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
    expect(actionItem('Sensory Stone (destroy to end charmed/frightened)')).toEqual({
      name: 'Sensory Stone',
      note: 'destroy to end charmed/frightened',
    });
    expect(actionItem('Embolden Allies (Embolden Allies)')).toEqual({ name: 'Embolden Allies', note: '' });
    expect(actionItem('Shadow Shroud')).toEqual({ name: 'Shadow Shroud', note: '' });
  });

  it('shows an action only once per kind', () => {
    const doubled = withValues(paladin, {
      'Bonus Action 4': 'Embolden Allies',
      'Bonus Action 5': 'Embolden Allies (Embolden Allies)',
      'Reaction 2': 'Sensory Stone (record)',
      'Action 5': 'Sensory Stone (experience) / Sunforger (hurl/recall)',
    });
    const list = readActionList(doubled);
    expect(list.bonusAction.filter((a) => a.name === 'Embolden Allies')).toHaveLength(1);
    expect(list.reaction).toEqual([{ name: 'Sensory Stone', note: 'record' }]);
    expect(list.action).toEqual([
      { name: 'Sensory Stone', note: 'experience' },
      { name: 'Sunforger', note: 'hurl/recall' },
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
          '**Thri-kreen**\r• Chameleon Carapace: My base AC is 13 + Dex mod. As an action, I can match my surroundings.',
      }),
    );
    expect(ruleFor(custom, { name: 'Chameleon Carapace', note: '' })?.lines).toEqual([
      'My base AC is 13 + Dex mod. As an action, I can match my surroundings.',
    ]);
    expect(ruleFor(index, { name: 'Lay on Hands - Poison', note: '' })?.title).toBe('Lay on Hands');
  });

  it('has nothing for an action without rule text', () => {
    expect(ruleFor(index, { name: 'Shadow Shroud', note: '' })).toBeNull();
  });
});
