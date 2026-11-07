import { describe, expect, it } from 'vitest';
import { speedSources, speedSteps } from './speed.ts';

describe('speedSources', () => {
  it('reads one walking speed', () => {
    expect(speedSources('The total Speed comes from:\n • Silver Dragonborn [9 m]')).toEqual([
      { mode: 'walk', items: ['Silver Dragonborn [9 m]'] },
    ]);
  });

  it('reads several kinds of movement, each with its entries', () => {
    const tooltip = [
      'The total Speed comes from:',
      ' • Human [30 ft]',
      ' • Boots of Speed [x2]',
      '',
      'The total Fly Speed comes from:',
      ' • Draconic Flight [as Speed]',
    ].join('\n');
    expect(speedSources(tooltip)).toEqual([
      { mode: 'walk', items: ['Human [30 ft]', 'Boots of Speed [x2]'] },
      { mode: 'fly', items: ['Draconic Flight [as Speed]'] },
    ]);
  });

  it('leaves out an empty or unknown tooltip', () => {
    expect(speedSources(undefined)).toEqual([]);
    expect(speedSources('')).toEqual([]);
    expect(speedSources('Your walking speed\n • something')).toEqual([]);
  });
});

describe('speedSteps', () => {
  const before = { speed: '18 m', encumbered: '12 m' };

  it('writes only the fields that changed, trimmed', () => {
    expect(speedSteps(before, { speed: ' 9 m ', encumbered: '12 m' })).toEqual([{ edit: 'Speed', text: '9 m' }]);
    expect(speedSteps(before, { speed: '9 m', encumbered: '6 m' })).toEqual([
      { edit: 'Speed', text: '9 m' },
      { edit: 'Speed encumbered', text: '6 m' },
    ]);
  });

  it('writes nothing when nothing changed', () => {
    expect(speedSteps(before, { speed: '18 m ', encumbered: '12 m' })).toEqual([]);
  });
});
