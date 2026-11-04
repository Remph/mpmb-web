// The page's side of Acrobat's pop-ups, plus the app's own questions. MPMB's scripts wait in the
// worker until the player answers (see src/worker/channel.ts); here each pop-up is an entry on a
// stack that PopUpLayer.svelte draws, the newest on top, and its promise resolves with the answer.
//
// Dialogs can open from a dialog's buttons and alerts from anywhere, so several can be open at once.
// A dialog stays on the stack across its element events: the worker runs the element's handler and
// sends the dialog again with its new state (`first` false), or says that it closed.
import type { AlertReply, AlertRequest, DialogReply, DialogView, MenuItem } from '../engine/host.ts';
import type { PopUps } from '../worker/client.ts';
import { linkKind } from './links.ts';

/** A question of the app itself (not MPMB's): a text and a few buttons. */
export interface Choice<T extends string> {
  title: string;
  message: string;
  /** Extra lines under the message, e.g. what a restore would replace. */
  lines?: string[];
  buttons: { value: T; label: string; primary?: boolean; danger?: boolean }[];
  /** What Escape answers. */
  cancel: T;
}

export type Entry =
  | { id: number; kind: 'alert'; request: AlertRequest; resolve: (reply: AlertReply) => void }
  | {
      id: number;
      kind: 'menu';
      items: MenuItem[];
      /** What the menu is about ("Longsword", "Spell sheet"); null shows a plain "Choose". */
      title: string | null;
      resolve: (picked: string | null) => void;
    }
  | {
      id: number;
      kind: 'dialog';
      view: DialogView;
      /** Null while the worker works on the last reply; the next view brings a new one. */
      resolve: ((reply: DialogReply) => void) | null;
    }
  | { id: number; kind: 'choice'; choice: Choice<string>; resolve: (value: string) => void }
  | { id: number; kind: 'file'; resolve: (text: string | null) => void };

/** The page's words for the question before a link that leaves MPMB's sites. */
export interface LinkQuestion {
  title: string;
  message: string;
  open: string;
  cancel: string;
}

/** An entry before it gets its id (Omit on each member of the union, not on the union). */
type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewEntry = Without<Entry, 'id'>;

export class PopUpStack implements PopUps {
  // Raw: entries are replaced, never changed in place, and a dialog view can be large.
  entries: Entry[] = $state.raw([]);
  private nextId = 1;

  /**
   * The title for MPMB's menus while the page's action runs. MPMB's pop-up menus have no title of their own,
   * and a plain "Choose" over "Delete all the Spell Sheet(s)" didn't say what it was about (UI review 2,
   * finding 08). The page's actions on a sheet run one after another, so one title at a time is enough.
   */
  private menuTitle: string | null = null;

  /** Runs an action whose menus of MPMB's get this title (none: they keep the plain one). */
  async titled<T>(title: string | undefined, run: () => Promise<T>): Promise<T> {
    if (title === undefined) return run();
    const outer = this.menuTitle;
    this.menuTitle = title;
    try {
      return await run();
    } finally {
      this.menuTitle = outer;
    }
  }

  /** Set by the page; without it, links that leave MPMB's sites don't open. */
  linkQuestion: (() => LinkQuestion) | null = null;

  /**
   * Opens a link the scripts ask for in a new tab: MPMB's own sites at once, any other web address
   * after the player has seen it (see links.ts).
   */
  launchURL(url: string): void {
    const kind = linkKind(url);
    if (kind === 'mpmb') {
      openTab(url);
      return;
    }
    const words = this.linkQuestion?.();
    if (kind === 'refused' || !words) return;
    void this.choose({
      title: words.title,
      message: words.message,
      lines: [url],
      buttons: [
        { value: 'cancel', label: words.cancel },
        { value: 'open', label: words.open, primary: true },
      ],
      cancel: 'cancel',
    }).then((answer) => answer === 'open' && openTab(url));
  }

  alert(request: AlertRequest): Promise<AlertReply> {
    return new Promise((resolve) => this.push({ kind: 'alert', request, resolve }));
  }

  menu(items: MenuItem[]): Promise<string | null> {
    return new Promise((resolve) => this.push({ kind: 'menu', items, title: this.menuTitle, resolve }));
  }

  dialog(view: DialogView, first: boolean): Promise<DialogReply> {
    return new Promise((resolve) => {
      const top = this.topDialog();
      if (first || !top) this.push({ kind: 'dialog', view, resolve });
      else this.replace(top.id, { ...top, view, resolve });
    });
  }

  dialogClosed(): void {
    const top = this.topDialog();
    if (top) this.remove(top.id);
  }

  /** Acrobat's file picker, for MPMB's "Add file": the chosen file's text, or null. */
  openFile(): Promise<string | null> {
    return new Promise((resolve) => this.push({ kind: 'file', resolve }));
  }

  /** Without shared memory, alerts can only be shown; the scripts went on with "OK". */
  notice(request: AlertRequest): void {
    void this.alert(request);
  }

  /** Asks the player one of the app's own questions. */
  choose<T extends string>(choice: Choice<T>): Promise<T> {
    return new Promise((resolve) => this.push({ kind: 'choice', choice, resolve: resolve as (value: string) => void }));
  }

  /** Called by the pop-up components with the player's answer. */
  answerAlert(id: number, reply: AlertReply): void {
    this.settle(id, 'alert', (e) => e.resolve(reply));
  }

  answerMenu(id: number, picked: string | null): void {
    this.settle(id, 'menu', (e) => e.resolve(picked));
  }

  answerChoice(id: number, value: string): void {
    this.settle(id, 'choice', (e) => e.resolve(value));
  }

  answerFile(id: number, text: string | null): void {
    this.settle(id, 'file', (e) => e.resolve(text));
  }

  /**
   * An element event or a closing button. The dialog stays until the worker says it closed (an OK
   * can fail validation and the dialog comes back), but it can't be answered twice meanwhile.
   */
  answerDialog(id: number, reply: DialogReply): void {
    const entry = this.entries.filter((e) => e.id === id)[0];
    if (entry?.kind !== 'dialog' || !entry.resolve) return;
    entry.resolve(reply);
    this.replace(id, { ...entry, resolve: null });
  }

  private push(entry: NewEntry): void {
    this.entries = [...this.entries, { ...entry, id: this.nextId++ } as Entry];
  }

  private replace(id: number, entry: Entry): void {
    this.entries = this.entries.map((e) => (e.id === id ? entry : e));
  }

  private remove(id: number): void {
    this.entries = this.entries.filter((e) => e.id !== id);
  }

  private topDialog(): Extract<Entry, { kind: 'dialog' }> | undefined {
    const dialogs = this.entries.filter((e): e is Extract<Entry, { kind: 'dialog' }> => e.kind === 'dialog');
    return dialogs[dialogs.length - 1];
  }

  private settle<K extends Entry['kind']>(
    id: number,
    kind: K,
    how: (entry: Extract<Entry, { kind: K }>) => void,
  ): void {
    const entry = this.entries.filter((e) => e.id === id)[0];
    if (entry?.kind !== kind) return;
    this.remove(id);
    how(entry as Extract<Entry, { kind: K }>);
  }
}

// The click on "Open" counts as the player's own: browsers let a page open a tab shortly after one.
function openTab(url: string): void {
  window.open(url, '_blank', 'noopener');
}
