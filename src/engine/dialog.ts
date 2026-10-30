// `app.execDialog` the way Acrobat runs it. The handlers (initialize, commit, validate, destroy and one
// per element id) live on the dialog object that MPMB's scripts pass in, and the scripts read the
// results from that same object after execDialog returns. So the handlers run here, next to the
// scripts, and the host (the page) only draws the description and sends back what the user did.
import type { DialogElement, DialogReply, DialogState, DialogView, Host } from './host.ts';
import type { RealmTools } from './realm.ts';

type Handler = (dialog: DialogApi) => unknown;

/** The dialog object MPMB passes to execDialog: a description plus handler functions. */
export interface DialogSpec {
  description?: DialogView['description'];
  initialize?: Handler;
  commit?: Handler;
  validate?: Handler;
  destroy?: Handler;
  [itemId: string]: unknown;
}

/** Acrobat's `dialog` object, handed to every handler. */
export interface DialogApi {
  load(values: DialogState): void;
  store(): DialogState;
  end(result?: string): void;
  enable(flags: Record<string, boolean>): void;
  visible(flags: Record<string, boolean>): void;
  setForeColorRed(id: string): void;
  setForeColorBlack(id: string): void;
  focus(id: string): void;
  insertEntryInList(values: DialogState): void;
  removeAllEntriesFromList(id: string): void;
  selectEntryInList?(id: string, entry: string): void;
}

/** A safety net: a dialog that never closes (a page that keeps sending events) gives up. */
const MAX_ROUNDS = 1000;

/** Copies plain data out of the scripts' realm, so that it can go to the page. */
const plain = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

/**
 * What `dialog.store()` gives for an element the handlers never loaded. Acrobat always returns every
 * element, and MPMB relies on it: the ability scores dialog only loads the non-zero columns and reads
 * the others as `Number("")`, which is 0 (a missing value would be NaN).
 */
const EMPTY_VALUES: Record<string, () => unknown> = {
  edit_text: () => '',
  static_text: () => '',
  check_box: () => false,
  radio: () => false,
  list_box: () => ({}),
  hier_list_box: () => ({}),
  popup: () => ({}),
};

const emptyState = (elements: DialogElement[] = []): DialogState =>
  Object.assign(
    {},
    ...elements.map((element) => {
      const empty = EMPTY_VALUES[element.type ?? ''];
      const own = element.item_id && empty ? { [element.item_id]: empty() } : {};
      return { ...emptyState(element.elements), ...own };
    }),
  );

/** The ids of combo boxes: an edit_text with `PopupEdit` is a text field with a drop-down list. */
const comboIds = (elements: DialogElement[] = []): string[] =>
  elements.flatMap((e) => [
    ...(e.type === 'edit_text' && e.PopupEdit && e.item_id ? [e.item_id] : []),
    ...comboIds(e.elements),
  ]);

export function runDialog(spec: DialogSpec, host: Host, tools: RealmTools): string {
  const description = plain(spec.description ?? {});
  const view: DialogView = {
    description,
    state: emptyState(description.elements),
    enabled: {},
    visible: {},
    red: {},
    choices: {},
  };
  const combos = new Set(comboIds(description.elements));
  let ended: string | undefined;
  const merge = (target: Record<string, unknown>, values: Record<string, unknown>): void => {
    Object.assign(target, plain(values));
  };
  /**
   * A combo box loads like a list (an object of entry -> number, positive = selected) but stores like a
   * text field: MPMB's spell dialogs load every spell this way and read back the typed or picked name.
   */
  const load = (values: DialogState): void => {
    const copy = plain(values);
    Object.entries(copy).forEach(([id, value]) => {
      if (!combos.has(id) || typeof value !== 'object' || value === null) return;
      const entries = Object.entries(value as Record<string, unknown>);
      view.choices[id] = entries.map(([label]) => label);
      copy[id] = entries.filter(([, n]) => Number(n) > 0)[0]?.[0] ?? '';
    });
    Object.assign(view.state, copy);
  };
  const api: DialogApi = {
    load,
    store: () => tools.copy(view.state),
    end: (result = 'ok') => {
      ended = result;
    },
    enable: (flags) => merge(view.enabled, flags),
    visible: (flags) => merge(view.visible, flags),
    setForeColorRed: (id) => merge(view.red, { [id]: true }),
    setForeColorBlack: (id) => merge(view.red, { [id]: false }),
    focus: () => undefined,
    // List entries are values too: an object of label -> selection number, kept in the state.
    insertEntryInList: (values) => {
      Object.entries(plain(values)).forEach(([id, entries]) => {
        const current = view.state[id];
        const old = current && typeof current === 'object' ? current : {};
        view.state[id] = { ...old, ...(entries as object) };
      });
    },
    removeAllEntriesFromList: (id) => {
      view.state[id] = {};
    },
  };
  const call = (name: string): unknown => {
    const handler = spec[name];
    return typeof handler === 'function' ? (handler as Handler).call(spec, api) : undefined;
  };
  const finish = (result: string): string => {
    call('destroy');
    return result;
  };

  // One user action: an element's handler runs, or a button closes the dialog. Returns the result,
  // or undefined while the dialog stays open.
  const handle = (reply: DialogReply | null): string | undefined => {
    // A host that can't wait for the user (no cross-origin isolation) gets "cancel".
    if (!reply) return 'cancel';
    merge(view.state, reply.state);
    if (reply.type === 'event') {
      call(reply.id);
      return ended;
    }
    if (reply.result !== 'ok') return reply.result;
    // OK runs validate (false keeps the dialog open), then commit.
    if (call('validate') === false) return undefined;
    call('commit');
    return ended ?? 'ok';
  };
  const show = (first: boolean, round: number): string => {
    if (round >= MAX_ROUNDS) return 'cancel';
    return handle(host.dialog(plain(view), first)) ?? show(false, round + 1);
  };
  const shown = (): string => {
    const result = show(true, 0);
    host.dialogClosed?.();
    return result;
  };

  call('initialize');
  return finish(ended ?? shown());
}
