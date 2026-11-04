// The engine's home in the browser: a Web Worker, so MPMB's scripts (a second or more on big changes)
// never freeze the page, and so the worker can wait for the user's answer to a pop-up the way
// Acrobat's scripts expect (see channel.ts).
//
// One worker holds one open sheet. MPMB's scripts keep their state in globals, so a second sheet gets
// a fresh worker (EngineClient does that) instead of reusing this global scope.
import { FILES_DIALOG_SCRIPT, PASTE_SCRIPT, addOnsOf, answerFilesDialog, scriptFilesOf } from '../engine/add-ons.ts';
import type { ScriptChanges } from '../engine/add-ons.ts';
import { BUILDER_INFO_SCRIPT, answerUnits, readBuilderInfo } from '../engine/builder.ts';
import { displaySettings, refreshFormats } from '../engine/display-settings.ts';
import type { UnitSystem } from '../engine/builder.ts';
import { Engine } from '../engine/engine.ts';
import type { SheetScript } from '../engine/engine.ts';
import type { AlertReply, DialogReply, DialogView, Host, MenuItem } from '../engine/host.ts';
import { ImportHost, importSheet } from '../engine/import-sheet.ts';
import { currentRealm } from '../engine/realm.ts';
import { mpmbScripts } from '../engine/scripts.ts';
import { CHARACTER_FORMAT, FORMAT_VERSION, applyCharacter, diffCharacter, unpackSheet } from '../engine/sheet-data.ts';
import type { SheetPack } from '../engine/sheet-pack.ts';
import { blankSheet } from '../engine/sheet.ts';
import { serveDocument, sourceDocument } from '../engine/source-doc.ts';
import type { SourceReply, SourceRequest } from '../engine/source-doc.ts';
import { allowTimer } from '../engine/startup.ts';
import type { Bookmark, ImageSlot, SheetImage, SheetImages, SheetSnapshot } from '../engine/types.ts';
import { offers } from '../engine/choices.ts';
import { answerScores } from '../engine/scores.ts';
import { SPELLS_READ_SCRIPT, applySpellPicks, newSpellRow, readSpellsInfo } from '../engine/spells.ts';
import type { RowMenus } from '../engine/spells.ts';
import { answerWelcome } from '../engine/welcome.ts';
import { readSheetPdf } from '../pdf/read-sheet.ts';
import { writeSheetPdf } from '../pdf/write-sheet.ts';
import { waitForAnswer } from './channel.ts';
import type { Channel } from './channel.ts';
import { sendReply, waitForReply } from './link.ts';
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
  ToWorker,
} from './protocol.ts';
import { changedViews, viewsOf } from './views.ts';
import { lockDown } from './lockdown.ts';
import type { FieldViews } from './views.ts';

// The worker's global scope, typed by hand: the app's TypeScript setup has the DOM types, not the
// worker ones, and this is all the worker needs of it.
const scope = globalThis as unknown as {
  postMessage(message: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};
const post = (message: FromWorker, transfer: Transferable[] = []): void => scope.postMessage(message, transfer);

// Before any sheet script can run (see lockdown.ts). The imports above have loaded the engine already.
const stillReachable = lockDown(globalThis);
if (stillReachable.length) console.warn(`The engine worker could not remove: ${stillReachable.join(', ')}`);

let channel: Channel | null = null;
let engine: Engine | null = null;
/**
 * The version of MPMB's sheet this worker runs: the one the app ships, or an older one it keeps (a pack,
 * see sheet-versions.ts), for a character saved on it.
 */
let sheetVersion: { blank: () => SheetSnapshot; scripts: readonly SheetScript[] } = {
  blank: blankSheet,
  scripts: mpmbScripts,
};
/** Serving an update (the `serve` command): no more pop-ups for the player from this sheet. */
let serving = false;

function usePack(pack: SheetPack | undefined): void {
  if (!pack) return;
  const blank = unpackSheet(pack.sheet);
  sheetVersion = { blank: () => blank, scripts: pack.scripts };
}
let shown: FieldViews = {};
let shownMenu = '';

/** A failure the page explains in the player's language (see FailureCode). */
class CommandError extends Error {
  constructor(
    readonly code: FailureCode,
    message: string,
    readonly detail?: string,
    readonly found?: FoundSheet,
  ) {
    super(message);
  }
}

/**
 * A pop-up: with shared memory the worker sleeps until the page answers. Without, the page only gets
 * to see alerts, and the scripts carry on with Acrobat's answer for a closed pop-up.
 */
const ask = (question: Ask): Answer => {
  if (serving) return null;
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
/** The code of the files the "Add-on scripts" window adds, for MPMB's "Add file" presses in order. */
let filesToHand: string[] = [];
let menuPicked = false;
/**
 * For a spell level's "+ Row" (newSpellRow): the next menu goes to the player, but MPMB gets "nothing"
 * back; the player's pick is kept here and applied once MPMB has inserted the new row.
 */
let menuPeek: { picked: string | null } | null = null;

function popUpMenu(items: MenuItem[]): string | null {
  const peek = menuPeek;
  if (peek) {
    menuPeek = null;
    peek.picked = ask({ kind: 'menu', items }) as string | null;
    return null;
  }
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
  // Files the app hands MPMB itself come first (setScripts); without shared memory the page can't hand
  // the player's file back, which MPMB takes as a cancelled picker.
  openFile: () => filesToHand.shift() ?? (ask({ kind: 'file' }) as string | null),
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

function open(sheet: SheetSnapshot, sheetHost: Host = host): Opened {
  if (engine) throw new Error('This worker already has a sheet open; open the next one in a new worker.');
  engine = Engine.load({ sheet, scripts: sheetVersion.scripts, host: sheetHost, realm: currentRealm(), allowTimer });
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

/** The sheet this worker runs (see sheetVersion); a PDF of another type or version doesn't fit its data. */
function checkSheetType(sheet: SheetSnapshot): void {
  const blank = sheetVersion.blank().info;
  const { SheetType: type, SheetVersion: version } = sheet.info;
  if (type !== blank.SheetType || version !== blank.SheetVersion) {
    const what = type || version ? `${type ?? '?'} v${version ?? '?'}` : '';
    throw new CommandError(
      'wrong-sheet',
      `This PDF is "${what || 'not an MPMB sheet'}"; the app reads "${blank.SheetType} v${blank.SheetVersion}" sheets.`,
      what,
      type && version ? { type, version } : undefined,
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
  open: ({ character, pack }) => {
    usePack(pack);
    const blank = sheetVersion.blank();
    return open(character ? applyCharacter(blank, character) : blank);
  },
  // The PDF opens as it is, with its own field scripts: MPMB changes some at run time (setAction, e.g.
  // the calculations of limited features), so they are part of the character. checkSheetType makes
  // sure the rest equals the sheet the app ships. Its add-on scripts run while it opens, see add-ons.ts.
  importPdf: async ({ bytes, pack }) => {
    usePack(pack);
    const sheet = await readPdf(bytes);
    checkSheetType(sheet);
    return open(sheet);
  },
  // The PDF is read first (its own type check, and the writer needs it read anyway), then the open
  // character goes into it.
  exportPdf: async ({ bytes }) => {
    const sheet = await readPdf(bytes);
    checkSheetType(sheet);
    return writeSheetPdf(bytes, opened().snapshot(), sheet);
  },
  edit: ({ field, text }) => opened().edit(field, text),
  click: ({ field, widget, shift, newRow }) =>
    newRow ? newSpellRow(opened(), field, true, ROW_MENUS) : opened().click(field, widget, shift),
  bookmark: ({ path }) => opened().clickBookmark(path),
  save: () => diffCharacter(sheetVersion.blank(), opened().snapshot()),
  serve: ({ port, buffer }) => serve(opened(), port, buffer),
  migrate: ({ port, buffer, images }) => migrate(port, buffer, images),
  addOns: () => addOnsOf(opened()),
  scriptFiles: () => scriptFilesOf(opened()),
  setScripts: ({ changes }) => setScripts(opened(), changes),
  pasteScript: () => {
    const sheet = opened();
    sheet.evaluate(PASTE_SCRIPT);
    sheet.runTimers();
  },
  builder: () => readBuilderInfo(opened().evaluate(BUILDER_INFO_SCRIPT)),
  units: ({ system }) => switchUnits(opened(), system),
  scores: ({ changes }) => answered(answerScores(changes), () => opened().click('Ability Scores Button')),
  pick: ({ field, answer }) => pick(opened(), field, answer),
  spells: () => readSpellsInfo(opened().evaluate(SPELLS_READ_SCRIPT)),
  setSpells: ({ picks, sheet }) => applySpellPicks(opened(), picks, answered, sheet),
  setImage: ({ slot, image }) => opened().setImage(slot, image),
};

/**
 * Answers the requests of the worker that updates this character (`migrate`) from this sheet's realm, as
 * the old document of MPMB's import (source-doc.ts). Each answer goes back through the shared buffer.
 */
function serve(sheet: Engine, port: MessagePort, buffer: SharedArrayBuffer): void {
  serving = true;
  const answer = serveDocument(sheet.tools.realm.global, sheet.tools.copy);
  port.onmessage = ({ data }: MessageEvent<SourceRequest>) => {
    // Every request gets an answer, or the other worker sleeps forever.
    let reply: string;
    try {
      reply = JSON.stringify(answer(data));
    } catch (err) {
      reply = JSON.stringify({ error: String(err) } satisfies SourceReply);
    }
    sendReply({ buffer }, reply);
  };
}

/**
 * The blank current sheet with MPMB's welcome turned off: in Acrobat the player imports into a sheet they
 * opened before, and the import sets the same field anyway.
 */
const quietBlank = (): SheetSnapshot =>
  applyCharacter(blankSheet(), {
    format: CHARACTER_FORMAT,
    version: FORMAT_VERSION,
    info: blankSheet().info,
    numPages: blankSheet().numPages,
    fields: { 'Opening Remember': { value: 'Yes' } },
  });

/** Updates the character another worker serves (see `serve`) onto the current sheet. */
function migrate(port: MessagePort, buffer: SharedArrayBuffer, images: SheetImages = {}): Migrated {
  const importHost = new ImportHost(host);
  open(quietBlank(), importHost);
  const sheet = opened();
  // The scripts wait for each answer: the request goes out on the port, the answer comes back through
  // the shared buffer while this worker sleeps.
  const link = (request: SourceRequest): SourceReply => {
    port.postMessage(request);
    return JSON.parse(waitForReply({ buffer })) as SourceReply;
  };
  try {
    const summary = importSheet(sheet, sourceDocument(sheet.tools, link), importHost);
    // The app carries the pictures itself (the import's own icon copy is turned off, see ImportHost).
    (Object.entries(images) as [ImageSlot, SheetImage][]).forEach(([slot, image]) => sheet.setImage(slot, image));
    return { addOns: addOnsOf(sheet), summary };
  } finally {
    port.close();
  }
}

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

/**
 * The "Add-on scripts" window's changes through MPMB's own files dialog, which the app answers in the
 * player's place; MPMB then runs the scripts, says so, and opens its Source Selection for the player.
 */
function setScripts(sheet: Engine, changes: ScriptChanges): void {
  filesToHand = [...changes.add];
  try {
    answered(answerFilesDialog(changes), () => sheet.evaluate(FILES_DIALOG_SCRIPT));
    sheet.runTimers();
  } finally {
    filesToHand = [];
  }
}

/** The app's answers and the player's withheld pick for newSpellRow (a spell level's "+ Row"). */
const ROW_MENUS: RowMenus = {
  answered: (answer, job) => {
    menuAnswer = answer;
    try {
      job();
    } finally {
      menuAnswer = null;
    }
  },
  peeked: (job) => {
    const peek = { picked: null as string | null };
    menuPeek = peek;
    try {
      job();
    } finally {
      menuPeek = null;
    }
    return peek.picked;
  },
};

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
    // Any command may switch units (the app's own switch, MPMB's bookmark in the sheet menu, an import).
    const settings = engine ? displaySettings(engine) : null;
    const result = await handler(command);
    if (engine && settings !== null) refreshFormats(engine, settings);
    sendFields();
    sendMenu();
    const stats = engine?.stats;
    post(
      {
        type: 'done',
        id,
        result: result ?? null,
        summary: { errors: stats?.errors.length ?? 0, missing: { ...stats?.missing } },
      },
      // A filled PDF (27 MB) moves to the page instead of being copied.
      result instanceof Uint8Array ? [result.buffer as ArrayBuffer] : [],
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    if (err instanceof CommandError)
      post({
        type: 'failed',
        id,
        error,
        code: err.code,
        detail: err.detail,
        ...(err.found ? { found: err.found } : {}),
      });
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
