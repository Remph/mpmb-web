import { describe, expect, test } from 'vitest';
import { vmRealm } from '../../test/vm-realm.ts';
import { runDialog } from './dialog.ts';
import type { DialogApi, DialogSpec } from './dialog.ts';
import type { DialogReply, DialogView, Host } from './host.ts';
import { realmTools } from './realm.ts';

/** A host that answers with the given replies in turn and keeps every view it was shown. */
const hostOf = (replies: (DialogReply | null)[]): Host & { views: DialogView[]; closed: number } => {
  const views: DialogView[] = [];
  const host = {
    views,
    closed: 0,
    alert: () => null,
    popUpMenu: () => null,
    dialog: (view: DialogView) => {
      views.push(view);
      return replies[views.length - 1] ?? null;
    },
    dialogClosed: () => {
      host.closed += 1;
    },
  };
  return host;
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

  test('a combo box (edit_text with PopupEdit) loads a list but stores the text', () => {
    // MPMB's spell lookup: `load({ AlLo: { "Bless": -1, "Cure Wounds": -2 } })`, then reads a spell name.
    const combo = {
      name: 'SPELLS',
      elements: [{ type: 'edit_text', item_id: 'AlLo', PopupEdit: true }, { type: 'ok' }],
    };
    const stored: unknown[] = [];
    const spec: DialogSpec = {
      description: combo,
      initialize: (d: DialogApi) => d.load({ AlLo: { Bless: -1, 'Cure Wounds': 2 } }),
      AlLo: (d: DialogApi) => stored.push(d.store().AlLo),
    };
    const host = hostOf([
      { type: 'event', id: 'AlLo', state: { AlLo: 'Bless' } },
      { type: 'close', result: 'ok', state: {} },
    ]);
    runDialog(spec, host, tools);
    expect(host.views[0]?.choices).toEqual({ AlLo: ['Bless', 'Cure Wounds'] });
    expect(host.views[0]?.state.AlLo).toBe('Cure Wounds');
    expect(stored).toEqual(['Bless']);
  });

  test('a handler can end the dialog with its own result (MPMB uses that to reopen it)', () => {
    const spec: DialogSpec = { description, tick: (d: DialogApi) => d.end('cadd') };
    expect(runDialog(spec, hostOf([{ type: 'event', id: 'tick', state: {} }]), tools)).toBe('cadd');
  });

  test('the page hears when a shown dialog closes, also when a handler ended it', () => {
    const ending: DialogSpec = { description, tick: (d: DialogApi) => d.end('cadd') };
    const host = hostOf([{ type: 'event', id: 'tick', state: {} }]);
    runDialog(ending, host, tools);
    expect(host.closed).toBe(1);
    // A dialog that initialize ends was never shown, so there is nothing to close.
    const never: DialogSpec = { description, initialize: (d: DialogApi) => d.end('cancel') };
    const quiet = hostOf([]);
    expect(runDialog(never, quiet, tools)).toBe('cancel');
    expect(quiet.views).toEqual([]);
    expect(quiet.closed).toBe(0);
  });

  test('a host that cannot wait for the user gets "cancel"', () => {
    expect(runDialog({ description }, hostOf([null]), tools)).toBe('cancel');
  });
});
