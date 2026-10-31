import { describe, expect, it } from 'vitest';
import { acrobatLabel } from './labels.ts';

describe('dialog labels', () => {
  it('shows "&&" as one "&" and drops the mnemonic "&"', () => {
    expect(acrobatLabel('Change Available Classes && Archetypes')).toBe('Change Available Classes & Archetypes');
    expect(acrobatLabel('&Apply')).toBe('Apply');
    expect(acrobatLabel('Plain text')).toBe('Plain text');
  });
});
