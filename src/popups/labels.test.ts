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

  it('keeps names and abbreviations as they are written', () => {
    expect(dialogTitle('IMPORT FROM PDF DIALOG')).toBe('Import from PDF');
    expect(dialogTitle('XFDF FILE CREATION DIALOG')).toBe('XFDF file creation');
    expect(dialogTitle('SUPPORT ON PATREON DIALOG')).toBe('Support on Patreon');
    expect(dialogTitle('ADD FILE TO ACROBAT INSTALLATION DIALOG')).toBe('Add file to Acrobat installation');
  });

  it('keeps a name in mixed case, and has a title for an empty name', () => {
    expect(dialogTitle('Set Unit System')).toBe('Set Unit System');
    expect(dialogTitle('')).toBe('MPMB');
  });
});
