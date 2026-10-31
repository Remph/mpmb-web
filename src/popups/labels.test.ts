import { describe, expect, it } from 'vitest';
import { acrobatLabel, dialogTitle } from './labels.ts';

describe('dialog labels', () => {
  it('shows "&&" as one "&" and drops the mnemonic "&"', () => {
    expect(acrobatLabel('Change Available Classes && Archetypes')).toBe('Change Available Classes & Archetypes');
    expect(acrobatLabel('&Apply')).toBe('Apply');
    expect(acrobatLabel('Plain text')).toBe('Plain text');
  });
});

describe('dialog titles', () => {
  it('drops MPMB\'s "DIALOG" and its capitals', () => {
    expect(dialogTitle('IMPORT CUSTOM SCRIPT DIALOG')).toBe('Import custom script');
    expect(dialogTitle('CHANGES ALERT DIALOG')).toBe('Changes alert');
  });

  it('keeps a name in mixed case, and has a title for an empty name', () => {
    expect(dialogTitle('Set Unit System')).toBe('Set Unit System');
    expect(dialogTitle('')).toBe('MPMB');
  });
});
