import { describe, expect, it } from 'vitest';
import type { DialogElement } from '../engine/host.ts';
import { findCloser, isUnseen } from './closer.ts';
import { withoutAcrobatHints } from './labels.ts';

// The bottom of MPMB's "Changes" reminder (Functions3.js): a visible Close and a hidden ok/cancel pair.
const visible: DialogElement = { type: 'ok', item_id: 'CLOS', alignment: 'align_center', ok_name: 'Close' };
const hidden: DialogElement = { type: 'ok_cancel', item_id: 'CNCL', alignment: 'align_offscreen' };

describe('dialog closers', () => {
  it('skips the hidden ok/cancel pair and finds the visible Close', () => {
    const elements: DialogElement[] = [{ type: 'view', elements: [{ type: 'view', elements: [hidden, visible] }] }];
    expect(findCloser(elements)).toBe(visible);
  });

  it('finds no closer when the only one is hidden', () => {
    expect(findCloser([{ type: 'view', elements: [hidden] }])).toBeUndefined();
  });

  it('tells hidden elements from visible ones', () => {
    expect(isUnseen(hidden)).toBe(true);
    expect(isUnseen(visible)).toBe(false);
  });

  it("leaves out MPMB's 1 × 1 focus catcher, not other read-only fields", () => {
    // SIMPLE TEXT DIALOG and COMPARE DIALOG (Functions2.js, Functions3.js).
    expect(isUnseen({ type: 'edit_text', item_id: 'ding', readonly: true, width: 1, height: 1 })).toBe(true);
    expect(isUnseen({ type: 'edit_text', item_id: 'Eval', readonly: true, width: 550, height: 500 })).toBe(false);
    expect(isUnseen({ type: 'edit_text', item_id: 'name' })).toBe(false);
  });

  it("leaves out MPMB's advice for Acrobat's fixed-size windows", () => {
    const hint = "[Can't see the bottom of this dialog? Use ENTER to confirm or ESC to cancel]";
    expect(isUnseen({ type: 'static_text', item_id: 'txt0', name: hint })).toBe(true);
    expect(isUnseen({ type: 'static_text', item_id: 'txt0', name: 'Select the sources to use.' })).toBe(false);
    expect(
      withoutAcrobatHints(`[Can't see the 'OK' button at the bottom? Use ENTER to close this dialog]\n\nWelcome`),
    ).toBe('Welcome');
  });
});
