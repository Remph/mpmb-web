// The page's side of the engine worker: sends commands, keeps the latest view of every field, and
// shows the pop-ups the scripts wait for (through the functions the UI passes in).
import type { AlertReply, AlertRequest, DialogReply, DialogView, MenuItem } from '../engine/host.ts';
import type { CharacterData } from '../engine/sheet-data.ts';
import { canWait, createChannel, sendAnswer } from './channel.ts';
import type { Channel } from './channel.ts';
import type { Answer, Ask, Command, FromWorker, Summary, ToWorker } from './protocol.ts';
import type { FieldViews } from './views.ts';

/** How the UI shows Acrobat's pop-ups. Each resolves with the user's answer. */
export interface PopUps {
  alert(request: AlertRequest): Promise<AlertReply>;
  /** Called again with the new state after each element event, while the dialog stays open. */
  dialog(view: DialogView, first: boolean): Promise<DialogReply>;
  /** Resolves with the chosen item's cReturn, or null. */
  menu(items: MenuItem[]): Promise<string | null>;
  /** Without shared memory alerts can only be shown, not answered. */
  notice?(request: AlertRequest): void;
  launchURL?(url: string): void;
}

export interface Done {
  result: unknown;
  summary: Summary;
}

/** The worker as the client needs it; a real Worker in the app, a stand-in in tests. */
export interface WorkerLike {
  postMessage(message: ToWorker): void;
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null;
  terminate(): void;
}

export const newEngineWorker = (): WorkerLike =>
  new Worker(new URL('./engine.worker.ts', import.meta.url), {
    type: 'module',
    name: 'mpmb-engine',
  }) as unknown as WorkerLike;

export class EngineClient {
  /** Every field as the page should draw it. */
  readonly fields: FieldViews = {};
  /** Called after every change to `fields`. */
  onFields: ((changed: FieldViews, removed: string[]) => void) | null = null;
  /** Whether pop-ups can be answered (the page is cross-origin isolated). */
  readonly answersPopUps: boolean;

  private worker: WorkerLike | null = null;
  private readonly channel: Channel | null;
  private readonly pending = new Map<number, { resolve: (done: Done) => void; reject: (err: Error) => void }>();
  private nextId = 1;

  constructor(
    private readonly popUps: PopUps,
    private readonly makeWorker: () => WorkerLike = newEngineWorker,
  ) {
    this.channel = canWait() ? createChannel() : null;
    this.answersPopUps = this.channel !== null;
  }

  /** Opens the blank sheet or a saved character, in a fresh worker. */
  open(character: CharacterData | null = null): Promise<Done> {
    return this.restart({ type: 'open', character });
  }

  /** Opens a filled MPMB PDF, in a fresh worker. */
  importPdf(bytes: ArrayBuffer): Promise<Done> {
    return this.restart({ type: 'importPdf', bytes });
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

  async save(): Promise<CharacterData> {
    return (await this.send({ type: 'save' })).result as CharacterData;
  }

  close(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.forEach(({ reject }) => reject(new Error('The sheet was closed')));
    this.pending.clear();
    Object.keys(this.fields).forEach((name) => delete this.fields[name]);
  }

  private restart(command: Command): Promise<Done> {
    this.close();
    const worker = this.makeWorker();
    worker.onmessage = ({ data }) => void this.receive(data);
    worker.postMessage({ type: 'setup', buffer: this.channel?.buffer ?? null });
    this.worker = worker;
    return this.send(command);
  }

  private send(command: Command): Promise<Done> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error('No sheet open'));
    const id = this.nextId++;
    return new Promise<Done>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ type: 'command', id, command });
    });
  }

  private async receive(message: FromWorker): Promise<void> {
    const handlers: { [K in FromWorker['type']]: (m: Extract<FromWorker, { type: K }>) => void | Promise<void> } = {
      ask: async ({ ask }) => {
        const answer = await this.answer(ask);
        if (this.channel) sendAnswer(this.channel, answer);
      },
      notice: ({ ask }) => {
        if (ask.kind === 'alert') this.popUps.notice?.(ask.request);
      },
      launchURL: ({ url }) => this.popUps.launchURL?.(url),
      fields: ({ changed, removed }) => {
        Object.assign(this.fields, changed);
        removed.forEach((name) => delete this.fields[name]);
        this.onFields?.(changed, removed);
      },
      done: ({ id, result, summary }) => this.settle(id, (p) => p.resolve({ result, summary })),
      failed: ({ id, error }) => this.settle(id, (p) => p.reject(new Error(error))),
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
