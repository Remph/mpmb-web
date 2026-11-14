// The house rule's double marks (playtest 2026-11-14, note 8) on top of the PDF's plain boxes.
import { describe, expect, it } from 'vitest';
import { ui } from '../i18n.ts';
import { arrowOf, edgeWord, isDouble, withDouble } from './edge.ts';

describe('double advantage and disadvantage', () => {
  it('counts only while the boxes still show the same kind of mark', () => {
    const marks = withDouble({}, 'Ste', 'adv', true);
    expect(marks).toEqual({ Ste: 'adv' });
    expect(isDouble(marks, 'Ste', 'adv')).toBe(true);
    // Changed to disadvantage elsewhere (in Acrobat): plain disadvantage, not double.
    expect(isDouble(marks, 'Ste', 'dis')).toBe(false);
    expect(isDouble(marks, 'Ste', '')).toBe(false);
    expect(isDouble(marks, 'Init', 'adv')).toBe(false);
  });

  it('a plain mark or Normal takes the double away; other rolls keep theirs', () => {
    const marks = withDouble(withDouble({}, 'Ste', 'adv', true), 'Att', 'dis', true);
    expect(withDouble(marks, 'Ste', 'adv', false)).toEqual({ Att: 'dis' });
    expect(withDouble(marks, 'Ste', '', true)).toEqual({ Att: 'dis' });
    expect(withDouble(marks, 'Ste', 'dis', true)).toEqual({ Ste: 'dis', Att: 'dis' });
  });

  it('shows two arrows and says "double"', () => {
    expect(arrowOf('adv', true)).toBe('▲▲');
    expect(arrowOf('dis', false)).toBe('▼');
    expect(edgeWord(ui.en, 'dis', true)).toBe('double disadvantage');
    expect(edgeWord(ui.de, 'adv', true)).toBe('doppelter Vorteil');
    expect(edgeWord(ui.en, 'adv', false)).toBe('advantage');
  });
});
