// The engine's home in the browser: a Web Worker, so MPMB's scripts (a second or more on big changes)
// never freeze the page, and so the worker can wait for the user's answer to a pop-up the way
// Acrobat's scripts expect (see channel.ts).
//
// One worker holds one open sheet. MPMB's scripts keep their state in globals, so a second sheet gets
// a fresh worker (EngineClient does that) instead of reusing this global scope.
import { addOnsOf } from '../engine/add-ons.ts';
import { BUILDER_INFO_SCRIPT, answerUnits, readBuilderInfo } from '../engine/builder.ts';
import type { UnitSystem } from '../engine/builder.ts';
import { Engine } from '../engine/engine.ts';
import type { AlertReply, DialogReply, DialogView, Host, MenuItem } from '../engine/host.ts';
import { currentRealm } from '../engine/realm.ts';
import { mpmbScripts } from '../engine/scripts.ts';
import { diffCharacter } from '../engine/sheet-data.ts';
import { blankSheet, characterSheet } from '../engine/sheet.ts';
import { allowTimer } from '../engine/startup.ts';
import type { Bookmark, SheetSnapshot } from '../engine/types.ts';
import { offers } from '../engine/choices.ts';
import { answerScores } from '../engine/scores.ts';
import { answerWelcome } from '../engine/welcome.ts';
import { readSheetPdf } from '../pdf/read-sheet.ts';
import { waitForAnswer } from './channel.ts';
import type { Channel } from './channel.ts';
import type { Answer, Ask, Command, FailureCode, FromWorker, MenuNode, Opened, ToWorker } from './protocol.ts';
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
let shownMenu = '';

/** A failure the page explains in the player's language (see FailureCode). */
class CommandError extends Error {
  constructor(
    readonly code: FailureCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
  }
}

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

/**
 * An answer the app gives itself, for one command: the sheet menu's units switch sets MPMB's units dialog
 * and presses OK, so that MPMB converts the sheet exactly as after the player's own OK.
 */
let answerItself: ((view: DialogView) => DialogReply | null) | null = null;

/**
 * The menu answer of a `pick` command, for the first menu its button shows; later menus (MPMB may ask
 * a follow-up question) go to the player.
 */
let menuAnswer: string | null = null;
let menuPicked = false;

function popUpMenu(items: MenuItem[]): string | null {
  const answer = menuAnswer;
  if (answer === null) return ask({ kind: 'menu', items }) as string | null;
  menuAnswer = null;
  menuPicked = offers(items, answer);
  return menuPicked ? answer : null;
}

const host: Host = {
  alert: (request) => answerWelcome(request) ?? (ask({ kind: 'alert', request }) as AlertReply | null),
  dialog: (view, first) => answerItself?.(view) ?? (ask({ kind: 'dialog', view, first }) as DialogReply | null),
  popUpMenu,
  // Without shared memory the page never showed the dialog, so there is nothing to close.
  dialogClosed: () => {
    if (channel) post({ type: 'dialogClosed' });
  },
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

const menuOf = (bookmarks: Bookmark[]): MenuNode[] =>
  bookmarks.map((b) => ({ name: b.name, children: menuOf(b.children), action: Boolean(b.action) }));

/** Sends MPMB's bookmarks when they changed. */
function sendMenu(): void {
  if (!engine) return;
  const menu = menuOf(engine.doc.bookmarkRoot.children);
  const text = JSON.stringify(menu);
  if (text === shownMenu) return;
  shownMenu = text;
  post({ type: 'menu', menu });
}

function open(sheet: SheetSnapshot): Opened {
  if (engine) throw new Error('This worker already has a sheet open; open the next one in a new worker.');
  engine = Engine.load({ sheet, scripts: mpmbScripts, host, realm: currentRealm(), allowTimer });
  // Opening the sheet in Acrobat runs the timers MPMB set while loading (those the app allows).
  engine.runTimers();
  // Acrobat shows the text that Format scripts made when the PDF was saved; here each field's Format
  // runs once, so that the page gets "+3" for a modifier stored as 3, not only after it changes.
  engine.doc.formatAll();
  return { addOns: addOnsOf(engine) };
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
    const what = type || version ? `${type ?? '?'} v${version ?? '?'}` : '';
    throw new CommandError(
      'wrong-sheet',
      `This PDF is "${what || 'not an MPMB sheet'}"; the app reads "${blank.SheetType} v${blank.SheetVersion}" sheets.`,
      what,
    );
  }
}

async function readPdf(bytes: ArrayBuffer): Promise<SheetSnapshot> {
  try {
    return await readSheetPdf(bytes);
  } catch (err) {
    throw new CommandError('unreadable-pdf', `The PDF could not be read: ${String(err)}`);
  }
}

const COMMANDS: { [K in Command['type']]: (command: Extract<Command, { type: K }>) => unknown } = {
  open: ({ character }) => open(character ? characterSheet(character) : blankSheet()),
  // The PDF opens as it is, with its own field scripts: MPMB changes some at run time (setAction, e.g.
  // the calculations of limited features), so they are part of the character. checkSheetType makes
  // sure the rest equals the sheet the app ships. Its add-on scripts run while it opens, see add-ons.ts.
  importPdf: async ({ bytes }) => {
    const sheet = await readPdf(bytes);
    checkSheetType(sheet);
    return open(sheet);
  },
  edit: ({ field, text }) => opened().edit(field, text),
  click: ({ field, widget }) => opened().click(field, widget),
  bookmark: ({ path }) => opened().clickBookmark(path),
  save: () => diffCharacter(blankSheet(), opened().snapshot()),
  builder: () => readBuilderInfo(opened().evaluate(BUILDER_INFO_SCRIPT)),
  units: ({ system }) => switchUnits(opened(), system),
  scores: ({ changes }) => answered(answerScores(changes), () => opened().click('Ability Scores Button')),
  pick: ({ field, answer }) => pick(opened(), field, answer),
};

function pick(sheet: Engine, field: string, answer: string): boolean {
  menuAnswer = answer;
  menuPicked = false;
  try {
    sheet.click(field);
  } finally {
    menuAnswer = null;
  }
  return menuPicked;
}

/** Runs MPMB's script with the app answering its dialog (the answer gives null for any other pop-up). */
function answered(answer: (view: DialogView) => DialogReply | null, job: () => void): void {
  answerItself = answer;
  try {
    job();
  } finally {
    answerItself = null;
  }
}

/** MPMB's own units bookmark, with its dialog answered: imperial or metric, decimal separator unchanged. */
function switchUnits(sheet: Engine, system: UnitSystem): void {
  answered(answerUnits(system), () => sheet.clickBookmark(['Functions', 'Unit System']));
}

async function run(id: number, command: Command): Promise<void> {
  try {
    const handler = COMMANDS[command.type] as (c: Command) => unknown;
    const result = await handler(command);
    sendFields();
    sendMenu();
    const stats = engine?.stats;
    post({
      type: 'done',
      id,
      result: result ?? null,
      summary: { errors: stats?.errors.length ?? 0, missing: { ...stats?.missing } },
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    if (err instanceof CommandError) post({ type: 'failed', id, error, code: err.code, detail: err.detail });
    else post({ type: 'failed', id, error });
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
