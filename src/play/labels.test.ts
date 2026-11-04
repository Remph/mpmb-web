import { describe, expect, it } from 'vitest';
import { ui } from '../i18n.ts';
import { recoveryText, spellLevelName } from './labels.ts';

describe('labels', () => {
  it("names MPMB's usual recovery texts in the page's language and keeps any other", () => {
    expect(recoveryText('long rest', ui.en)).toBe(ui.en.recoveryLong);
    expect(recoveryText('SR', ui.de)).toBe(ui.de.recoveryShort);
    expect(recoveryText('Dawn', ui.en)).toBe(ui.en.recoveryDawn);
    expect(recoveryText('7 days', ui.de)).toBe('7 days');
  });

  it('names spell levels, with cantrips for level 0', () => {
    expect(spellLevelName(0, ui.en)).toBe('Cantrips');
    expect(spellLevelName(3, ui.en)).toBe('Level 3');
    expect(spellLevelName(3, ui.de)).toBe('3. Grad');
  });
});
