import { describe, expect, it } from 'vitest';
import { expected } from '../session.svelte.ts';
import type { FieldView } from '../worker/views.ts';

const view = (value: string, on?: string): FieldView => ({
  type: on ? 'Btn' : 'Tx',
  value,
  flags: 0,
  widgets: [{ page: 0, rect: [0, 0, 1, 1], flags: 4, ...(on ? { on } : {}) }],
  style: {},
});

describe('expected fields', () => {
  it('shows edits and clicks before the worker has made them', () => {
    const fields = {
      'HP Current': { ...view('71'), text: '71' },
      Inspiration: view('Off', 'Yes'),
      Box: view('True', 'True'),
    };
    const next = expected(fields, [{ edit: 'HP Current', text: '60' }, { click: 'Inspiration' }, { click: 'Box' }]);
    expect(next['HP Current']).toMatchObject({ value: '60', text: undefined });
    expect(next.Inspiration?.value).toBe('Yes');
    expect(next.Box?.value).toBe('Off');
    // The fields the page had are left as they were.
    expect(fields['HP Current'].value).toBe('71');
  });

  it('counts quick taps one after another', () => {
    let fields: Record<string, FieldView> = { Used: view('') };
    [1, 2, 3].forEach((n) => (fields = expected(fields, [{ edit: 'Used', text: String(n) }])));
    expect(fields.Used?.value).toBe('3');
  });
});
