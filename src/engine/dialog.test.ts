import { describe, expect, test } from 'vitest';
import { vmRealm } from '../../test/vm-realm.ts';
import { runDialog } from './dialog.ts';
import type { DialogApi, DialogSpec } from './dialog.ts';
import type { DialogReply, DialogView, Host } from './host.ts';
import { realmTools } from './realm.ts';

/** A host that answers with the given replies in turn and keeps every view it was shown. */
const hostOf = (replies: (DialogReply | null)[]): Host & { views: DialogView[] } => {
  const views: DialogView[] = [];
  return {
    views,
    alert: () => null,
    popUpMenu: () => null,
    dialog: (view) => {
      views.push(view);
      return replies[views.length - 1] ?? null;
    },
  };
};

const description = {
  name: 'TEST',
  elements: [
    {
      type: 'view',
      elements: [
        { type: 'edit_text', item_id: 'name' },
        { type: 'check_box', item_id: 'tick' },
        { type: 'popup', item_id: 'pick' },
      ],
    },
    { type: 'ok_cancel' },
  ],
};

const tools = realmTools(vmRealm());

describe('runDialog', () => {
  test('store() has every element, also those the handlers never loaded', () => {
    const stored: Record<string, unknown>[] = [];
    const spec: DialogSpec = { description, commit: (d: DialogApi) => stored.push({ ...d.store() }) };
    expect(runDialog(spec, hostOf([{ type: 'close', result: 'ok', state: {} }]), tools)).toBe('ok');
    expect(stored).toEqual([{ name: '', tick: false, pick: {} }]);
  });

  test('element handlers run on events, and the page sees what they loaded', () => {
    const spec: DialogSpec = {
      description,
      initialize: (d: DialogApi) => d.load({ name: 'Anna' }),
      tick: (d: DialogApi) => d.enable({ name: !d.store().tick }),
    };
    const host = hostOf([
      { type: 'event', id: 'tick', state: { tick: true } },
      { type: 'close', result: 'cancel', state: {} },
    ]);
    expect(runDialog(spec, host, tools)).toBe('cancel');
    expect(host.views[0]?.state.name).toBe('Anna');
    expect(host.views[1]?.enabled).toEqual({ name: false });
  });

  test('validate returning false keeps the dialog open; commit runs only on OK', () => {
    const calls: string[] = [];
    const spec: DialogSpec = {
      description,
      validate: (d: DialogApi) => {
        calls.push('validate');
        return d.store().name !== '';
      },
      commit: () => calls.push('commit'),
      destroy: () => calls.push('destroy'),
    };
    const host = hostOf([
      { type: 'close', result: 'ok', state: {} },
      { type: 'close', result: 'ok', state: { name: 'Bea' } },
    ]);
    expect(runDialog(spec, host, tools)).toBe('ok');
    expect(calls).toEqual(['validate', 'validate', 'commit', 'destroy']);
  });

  test('a handler can end the dialog with its own result (MPMB uses that to reopen it)', () => {
    const spec: DialogSpec = { description, tick: (d: DialogApi) => d.end('cadd') };
    expect(runDialog(spec, hostOf([{ type: 'event', id: 'tick', state: {} }]), tools)).toBe('cadd');
  });

  test('a host that cannot wait for the user gets "cancel"', () => {
    expect(runDialog({ description }, hostOf([null]), tools)).toBe('cancel');
  });
});
