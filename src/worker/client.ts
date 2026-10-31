// The page's side of the engine worker: sends commands, keeps the latest view of every field, and
// shows the pop-ups the scripts wait for (through the functions the UI passes in).
import type { AlertReply, AlertRequest, DialogReply, DialogView, MenuItem } from '../engine/host.ts';
import type { CharacterData } from '../engine/sheet-data.ts';
import type { BuilderInfo, UnitSystem } from '../engine/builder.ts';
import { canWait, createChannel, sendAnswer } from './channel.ts';
import type { Channel } from './channel.ts';
import type { Answer, Ask, Command, FailureCode, FromWorker, MenuNode, Opened, Summary, ToWorker } from './protocol.ts';
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

  /** Opens the blank sheet or a saved character, in a fresh worker. */
  open(character: CharacterData | null = null): Promise<Done<Opened>> {
    return this.restart({ type: 'open', character }) as Promise<Done<Opened>>;
  }

  /** Opens a filled MPMB PDF, in a fresh worker. The bytes move to the worker (the buffer empties). */
  importPdf(bytes: ArrayBuffer): Promise<Done<Opened>> {
    return this.restart({ type: 'importPdf', bytes }) as Promise<Done<Opened>>;
  }

  edit(field: string, text: string): Promise<Done> {
    return this.send({ type: 'edit', field, text });
  }

  click(field: string, widget = 0): Promise<Done> {
    return this.send({ type: 'click', field, widget });
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

  async save(): Promise<CharacterData> {
    return (await this.send({ type: 'save' })).result as CharacterData;
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
      // A PDF's bytes move to the worker instead of being copied (27 MB for a filled sheet).
      const transfer = command.type === 'importPdf' ? [command.bytes] : [];
      worker.postMessage({ type: 'command', id, command }, transfer);
    });
  }

  private async receive(message: FromWorker, channel: Channel | null): Promise<void> {
    const handlers: { [K in FromWorker['type']]: (m: Extract<FromWorker, { type: K }>) => void | Promise<void> } = {
      ask: async ({ ask }) => {
        const answer = await this.answer(ask);
        if (channel) sendAnswer(channel, answer);
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
      failed: ({ id, error, code, detail }) => this.settle(id, (p) => p.reject(new EngineError(error, code, detail))),
    };
    const handler = handlers[message.type] as (m: FromWorker) => void | Promise<void>;
    await handler(message);
  }

  private async answer(ask: Ask): Promise<Answer> {
    const answers: { [K in Ask['kind']]: (a: Extract<Ask, { kind: K }>) => Promise<Answer> } = {
      alert: ({ request }) => this.popUps.alert(request),
      dialog: ({ view, first }) => this.popUps.dialog(view, first),
      menu: ({ items }) => this.popUps.menu(items),
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
