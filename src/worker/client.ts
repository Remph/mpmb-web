// The page's side of the engine worker: sends commands, keeps the latest view of every field, and
// shows the pop-ups the scripts wait for (through the functions the UI passes in).
import type { AlertReply, AlertRequest, DialogReply, DialogView, MenuItem } from '../engine/host.ts';
import type { AddOns, ScriptChanges, ScriptFiles } from '../engine/add-ons.ts';
import type { CharacterData } from '../engine/sheet-data.ts';
import type { FieldValues } from '../engine/sheet-changes.ts';
import type { SheetPack } from '../engine/sheet-pack.ts';
import type { ImageSlot, SheetImage, SheetImages } from '../engine/types.ts';
import type { BuilderInfo, UnitSystem } from '../engine/builder.ts';
import type { ScoreChange } from '../engine/scores.ts';
import type { SpellPicks, SpellSheetPicks, SpellsInfo } from '../engine/spells.ts';
import type { CompanionTemplate } from '../engine/companion-options.ts';
import { canWait, createChannel, sendAnswer } from './channel.ts';
import type { Channel } from './channel.ts';
import type {
  Answer,
  Ask,
  Command,
  FailureCode,
  FoundSheet,
  FromWorker,
  MenuNode,
  Migrated,
  Opened,
  Summary,
  ToWorker,
} from './protocol.ts';
import type { FieldViews } from './views.ts';

/** How the UI shows Acrobat's pop-ups. Each resolves with the user's answer. */
export interface PopUps {
  alert(request: AlertRequest): Promise<AlertReply>;
  /**
   * `first`: a new dialog, on top of any open one (dialogs open from dialogs). Otherwise the top dialog
   * again, with its new state after an element event or a failed validation.
   */
  dialog(view: DialogView, first: boolean): Promise<DialogReply>;
  /** The top dialog has closed. */
  dialogClosed?(): void;
  /** Resolves with the chosen item's cReturn, or null. */
  menu(items: MenuItem[]): Promise<string | null>;
  /** Lets the player pick a file; resolves with its text, or null when they cancel. */
  openFile(): Promise<string | null>;
  /** Without shared memory alerts can only be shown, not answered. */
  notice?(request: AlertRequest): void;
  launchURL?(url: string): void;
}

export interface Done<T = unknown> {
  result: T;
  summary: Summary;
}

/** A failed command; `code` says why when the page should explain it (see FailureCode). */
export class EngineError extends Error {
  constructor(
    message: string,
    readonly code?: FailureCode,
    readonly detail?: string,
    /** For 'wrong-sheet': the sheet type and version the PDF says it is. */
    readonly found?: FoundSheet,
  ) {
    super(message);
  }
}

/** The worker as the client needs it; a real Worker in the app, a stand-in in tests. */
export interface WorkerLike {
  postMessage(message: ToWorker, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null;
  /** A worker that fails to load (or throws outside a command) ends up here. */
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
}

export class EngineClient {
  /** Every field as the page should draw it. */
  readonly fields: FieldViews = {};
  /** Called after every change to `fields`. */
  onFields: ((changed: FieldViews, removed: string[]) => void) | null = null;
  /** MPMB's bookmarks (its menu) of the open sheet. */
  menu: MenuNode[] = [];
  onMenu: ((menu: MenuNode[]) => void) | null = null;
  /** Whether pop-ups can be answered (the page is cross-origin isolated). */
  readonly answersPopUps = canWait();

  private worker: WorkerLike | null = null;
  private readonly pending = new Map<number, { resolve: (done: Done) => void; reject: (err: Error) => void }>();
  private nextId = 1;

  constructor(
    private readonly popUps: PopUps,
    /** newEngineWorker (start.ts) in the browser. */
    private readonly makeWorker: () => WorkerLike,
  ) {}

  /**
   * Opens the blank sheet or a saved character, in a fresh worker; on an older sheet version the app keeps
   * when a pack is given.
   */
  open(character: CharacterData | null = null, pack?: SheetPack): Promise<Done<Opened>> {
    return this.restart({ type: 'open', character, ...(pack ? { pack } : {}) }) as Promise<Done<Opened>>;
  }

  /**
   * Opens a filled MPMB PDF (of the version of `pack`, when given), in a fresh worker. The bytes move to
   * the worker (the buffer empties).
   */
  importPdf(bytes: ArrayBuffer, pack?: SheetPack): Promise<Done<Opened>> {
    return this.restart({ type: 'importPdf', bytes, ...(pack ? { pack } : {}) }) as Promise<Done<Opened>>;
  }

  /** The values a player sees on the open sheet. */
  async values(): Promise<FieldValues> {
    return (await this.send({ type: 'values' })).result as FieldValues;
  }

  /** The open sheet answers another worker's `migrate` from this port (see the worker's `serve`). */
  serve(port: MessagePort, buffer: SharedArrayBuffer): Promise<Done> {
    return this.send({ type: 'serve', port, buffer });
  }

  /**
   * Updates the character that another client serves onto the current sheet, in a fresh worker, and keeps
   * it open there (see the worker's `migrate`).
   */
  migrate(port: MessagePort, buffer: SharedArrayBuffer, images?: SheetImages): Promise<Done<Migrated>> {
    return this.restart({ type: 'migrate', port, buffer, ...(images ? { images } : {}) }) as Promise<Done<Migrated>>;
  }

  /** The open character in the player's copy of the sheet: the filled PDF. The bytes move to the worker. */
  exportPdf(bytes: ArrayBuffer): Promise<Done<Uint8Array>> {
    return this.send({ type: 'exportPdf', bytes }) as Promise<Done<Uint8Array>>;
  }

  /** `cancelable`: a dialog the player cancels cancels the edit (see Engine.edit). */
  edit(field: string, text: string, cancelable = false): Promise<Done> {
    return this.send({ type: 'edit', field, text, ...(cancelable ? { cancelable } : {}) });
  }

  click(field: string, widget = 0, shift = false, newRow = false): Promise<Done> {
    return this.send({ type: 'click', field, widget, shift, ...(newRow ? { newRow } : {}) });
  }

  bookmark(path: string[]): Promise<Done> {
    return this.send({ type: 'bookmark', path });
  }

  async builder(): Promise<BuilderInfo> {
    return (await this.send({ type: 'builder' })).result as BuilderInfo;
  }

  units(system: UnitSystem): Promise<Done> {
    return this.send({ type: 'units', system });
  }

  scores(changes: ScoreChange[]): Promise<Done> {
    return this.send({ type: 'scores', changes });
  }

  /** Picks an item of the menu that the button shows (see the `pick` command); false when not offered. */
  async pick(field: string, answer: string): Promise<boolean> {
    return (await this.send({ type: 'pick', field, answer })).result === true;
  }

  /** The same for one of MPMB's bookmarks (see the `pickBookmark` command). */
  async pickBookmark(path: string[], answer: string): Promise<boolean> {
    return (await this.send({ type: 'pickBookmark', path, answer })).result === true;
  }

  async companionOptions(): Promise<CompanionTemplate[]> {
    return (await this.send({ type: 'companionOptions' })).result as CompanionTemplate[];
  }

  async spells(): Promise<SpellsInfo> {
    return (await this.send({ type: 'spells' })).result as SpellsInfo;
  }

  setSpells(picks: SpellPicks[], sheet: SpellSheetPicks | null): Promise<Done> {
    return this.send({ type: 'setSpells', picks, sheet });
  }

  setImage(slot: ImageSlot, image: SheetImage | null): Promise<Done> {
    return this.send({ type: 'setImage', slot, image });
  }

  async save(): Promise<CharacterData> {
    return (await this.send({ type: 'save' })).result as CharacterData;
  }

  async scriptFiles(): Promise<ScriptFiles> {
    return (await this.send({ type: 'scriptFiles' })).result as ScriptFiles;
  }

  setScripts(changes: ScriptChanges): Promise<Done> {
    return this.send({ type: 'setScripts', changes });
  }

  pasteScript(): Promise<Done> {
    return this.send({ type: 'pasteScript' });
  }

  /** The add-on scripts the open sheet carries now. */
  async addOns(): Promise<AddOns> {
    return (await this.send({ type: 'addOns' })).result as AddOns;
  }

  close(reason = 'The sheet was closed'): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.forEach(({ reject }) => reject(new Error(reason)));
    this.pending.clear();
    Object.keys(this.fields).forEach((name) => delete this.fields[name]);
    this.menu = [];
  }

  private restart(command: Command): Promise<Done> {
    this.close();
    const worker = this.makeWorker();
    // Each worker gets its own channel: the answer to a pop-up of a sheet closed meanwhile must not
    // wake the next sheet's worker with the wrong answer.
    const channel = this.answersPopUps ? createChannel() : null;
    // A closed worker's last messages are dropped; its pending commands were rejected on close.
    worker.onmessage = ({ data }) => {
      if (this.worker === worker) void this.receive(data, channel);
    };
    // Without this, a worker that fails to load would leave every command waiting forever.
    worker.onerror = (event) => {
      if (this.worker === worker) this.close(`The engine stopped: ${event.message || 'it could not start'}`);
    };
    worker.postMessage({ type: 'setup', buffer: channel?.buffer ?? null });
    this.worker = worker;
    return this.send(command);
  }

  private send(command: Command): Promise<Done> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error('No sheet open'));
    const id = this.nextId++;
    return new Promise<Done>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ type: 'command', id, command }, transferOf(command));
    });
  }

  private async receive(message: FromWorker, channel: Channel | null): Promise<void> {
    const handlers: { [K in FromWorker['type']]: (m: Extract<FromWorker, { type: K }>) => void | Promise<void> } = {
      ask: async ({ ask }) => {
        const answer = await this.answer(ask);
        if (!channel) return;
        try {
          sendAnswer(channel, answer);
        } catch {
          // Too large for the channel: the worker must still wake up, or the sheet sleeps forever.
          sendAnswer(channel, null);
        }
      },
      notice: ({ ask }) => {
        if (ask.kind === 'alert') this.popUps.notice?.(ask.request);
      },
      launchURL: ({ url }) => this.popUps.launchURL?.(url),
      dialogClosed: () => this.popUps.dialogClosed?.(),
      menu: ({ menu }) => {
        this.menu = menu;
        this.onMenu?.(menu);
      },
      fields: ({ changed, removed }) => {
        Object.assign(this.fields, changed);
        removed.forEach((name) => delete this.fields[name]);
        this.onFields?.(changed, removed);
      },
      done: ({ id, result, summary }) => this.settle(id, (p) => p.resolve({ result, summary })),
      failed: ({ id, error, code, detail, found }) =>
        this.settle(id, (p) => p.reject(new EngineError(error, code, detail, found))),
    };
    const handler = handlers[message.type] as (m: FromWorker) => void | Promise<void>;
    await handler(message);
  }

  private async answer(ask: Ask): Promise<Answer> {
    const answers: { [K in Ask['kind']]: (a: Extract<Ask, { kind: K }>) => Promise<Answer> } = {
      alert: ({ request }) => this.popUps.alert(request),
      dialog: ({ view, first }) => this.popUps.dialog(view, first),
      menu: ({ items }) => this.popUps.menu(items),
      file: () => this.popUps.openFile(),
    };
    try {
      return await (answers[ask.kind] as (a: Ask) => Promise<Answer>)(ask);
    } catch {
      // A pop-up that fails must still wake the worker, or it sleeps forever: answer "closed".
      return null;
    }
  }

  private settle(id: number, how: (p: { resolve: (done: Done) => void; reject: (err: Error) => void }) => void): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    how(pending);
  }
}

/**
 * What moves to the worker instead of being copied: a PDF's bytes (27 MB for a filled sheet), and the
 * port of an update's link, which can't be copied at all.
 */
function transferOf(command: Command): Transferable[] {
  if (command.type === 'importPdf' || command.type === 'exportPdf') return [command.bytes];
  if (command.type === 'serve' || command.type === 'migrate') return [command.port];
  return [];
}
