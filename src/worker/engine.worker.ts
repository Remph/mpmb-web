// The engine's home in the browser: a Web Worker, so MPMB's scripts (a second or more on big changes)
// never freeze the page, and so the worker can wait for the user's answer to a pop-up the way
// Acrobat's scripts expect (see channel.ts).
//
// One worker holds one open sheet. MPMB's scripts keep their state in globals, so a second sheet gets
// a fresh worker (EngineClient does that) instead of reusing this global scope.
import { Engine } from '../engine/engine.ts';
import type { AlertReply, DialogReply, Host } from '../engine/host.ts';
import { currentRealm } from '../engine/realm.ts';
import { mpmbScripts } from '../engine/scripts.ts';
import { diffCharacter } from '../engine/sheet-data.ts';
import { blankSheet, characterSheet } from '../engine/sheet.ts';
import type { SheetSnapshot } from '../engine/types.ts';
import { readSheetPdf } from '../pdf/read-sheet.ts';
import { waitForAnswer } from './channel.ts';
import type { Channel } from './channel.ts';
import type { Answer, Ask, Command, FromWorker, ToWorker } from './protocol.ts';
import { changedViews, viewsOf } from './views.ts';
import type { FieldViews } from './views.ts';

// The worker's global scope, typed by hand: the app's TypeScript setup has the DOM types, not the
// worker ones, and this is all the worker needs of it.
const scope = globalThis as unknown as {
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};
const post = (message: FromWorker): void => scope.postMessage(message);

let channel: Channel | null = null;
let engine: Engine | null = null;
let shown: FieldViews = {};

/**
 * A pop-up: with shared memory the worker sleeps until the page answers. Without, the page only gets
 * to see alerts, and the scripts carry on with Acrobat's answer for a closed pop-up.
 */
const ask = (question: Ask): Answer => {
  if (!channel) {
    if (question.kind === 'alert') post({ type: 'notice', ask: question });
    return null;
  }
  post({ type: 'ask', ask: question });
  return waitForAnswer<Answer>(channel);
};

const host: Host = {
  alert: (request) => ask({ kind: 'alert', request }) as AlertReply | null,
  dialog: (view, first) => ask({ kind: 'dialog', view, first }) as DialogReply | null,
  popUpMenu: (items) => ask({ kind: 'menu', items }) as string | null,
  launchURL: (url) => post({ type: 'launchURL', url }),
};

/** Sends the page every field that looks different since the last time. */
function sendFields(): void {
  if (!engine) return;
  const now = viewsOf(engine.doc);
  const { changed, removed } = changedViews(shown, now);
  shown = now;
  if (Object.keys(changed).length || removed.length) post({ type: 'fields', changed, removed });
}

function open(sheet: SheetSnapshot): void {
  if (engine) throw new Error('This worker already has a sheet open; open the next one in a new worker.');
  engine = Engine.load({ sheet, scripts: mpmbScripts, host, realm: currentRealm() });
  // Opening the sheet in Acrobat runs the timers MPMB set while loading.
  engine.runTimers();
}

const opened = (): Engine => {
  if (!engine) throw new Error('No sheet open');
  return engine;
};

/** The sheet the app ships with; a PDF of another type or version doesn't fit its data. */
function checkSheetType(sheet: SheetSnapshot): void {
  const blank = blankSheet().info;
  const { SheetType: type, SheetVersion: version } = sheet.info;
  if (type !== blank.SheetType || version !== blank.SheetVersion) {
    throw new Error(
      `This PDF is "${type ?? '?'} v${version ?? '?'}"; the app reads "${blank.SheetType} v${blank.SheetVersion}" sheets.`,
    );
  }
}

const COMMANDS: { [K in Command['type']]: (command: Extract<Command, { type: K }>) => unknown } = {
  open: ({ character }) => open(character ? characterSheet(character) : blankSheet()),
  importPdf: async ({ bytes }) => {
    const sheet = await readSheetPdf(bytes);
    checkSheetType(sheet);
    open(sheet);
  },
  edit: ({ field, text }) => opened().edit(field, text),
  click: ({ field, widget }) => opened().click(field, widget),
  bookmark: ({ path }) => opened().clickBookmark(path),
  save: () => diffCharacter(blankSheet(), opened().snapshot()),
};

async function run(id: number, command: Command): Promise<void> {
  try {
    const handler = COMMANDS[command.type] as (c: Command) => unknown;
    const result = await handler(command);
    sendFields();
    const stats = engine?.stats;
    post({
      type: 'done',
      id,
      result: result ?? null,
      summary: { errors: stats?.errors.length ?? 0, missing: { ...stats?.missing } },
    });
  } catch (err) {
    post({ type: 'failed', id, error: err instanceof Error ? err.message : String(err) });
  }
}

// Commands run one after the other, also across the awaits of a PDF import.
let queue: Promise<void> = Promise.resolve();
const enqueue = async (previous: Promise<void>, id: number, command: Command): Promise<void> => {
  await previous;
  await run(id, command);
};

scope.onmessage = ({ data }) => {
  if (data.type === 'setup') {
    channel = data.buffer ? { buffer: data.buffer } : null;
    return;
  }
  queue = enqueue(queue, data.id, data.command);
};
