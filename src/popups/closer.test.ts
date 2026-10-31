import { describe, expect, it } from 'vitest';
import type { DialogElement } from '../engine/host.ts';
import { findCloser, isOffscreen } from './closer.ts';

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
    expect(isOffscreen(hidden)).toBe(true);
    expect(isOffscreen(visible)).toBe(false);
  });
});
