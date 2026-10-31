import { describe, expect, it } from 'vitest';
import type { Choice } from '../engine/choices.ts';
import { choiceNamed, choicesHref, pointsToChooseFeature } from './choose-link.ts';

const choice = (name: string, kind: Choice['kind'] = 'class'): Choice => ({
  id: name,
  kind,
  field: 'Class Features Menu',
  owner: 'Paladin',
  name,
  many: false,
  selected: 0,
  allowed: 1,
  chosen: [],
  open: true,
  sections: [],
});

const choices = [
  choice('Weapon Mastery'),
  choice('Fighting Style'),
  choice('Eldritch Invocation'),
  choice('Fighting Style', 'feat'),
];

describe('links from feature texts to the Choices step', () => {
  it("finds MPMB's note about the PDF's button", () => {
    expect(pointsToChooseFeature('Select option with "Choose Feature"')).toBe(true);
    expect(pointsToChooseFeature('regain 1/SR, 2× per Long Rest')).toBe(false);
  });

  it('finds the class choice by the feature name, with the mark and in the plural', () => {
    expect(choiceNamed(choices, '◆ Fighting Style')).toBe(choices[1]);
    expect(choiceNamed(choices, 'Eldritch Invocations')).toBe(choices[2]);
  });

  it('gives null for a name no choice has', () => {
    expect(choiceNamed(choices, 'Lay on Hands')).toBeNull();
    expect(choiceNamed(choices, '◆')).toBeNull();
  });

  it("makes the Choices step's address without the feature mark", () => {
    expect(choicesHref('a b', '◆ Fighting Style')).toBe('#/character/a%20b/build/choices/Fighting%20Style');
  });
});
