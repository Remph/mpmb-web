// MPMB's "Import from another sheet" (`DirectImport` in FunctionsImport.js), run by the app: it moves a
// character from an older version of the sheet onto this one. MPMB resets the new sheet, then copies the
// old sheet's choices (class, species, feats, spells, ...) through its own automation and its player
// input field by field, handling the fields older versions named differently. Players do the same in
// Acrobat by hand when MPMB releases a new sheet.
//
// The importing engine gets the old document through `app.openDoc` (see source-doc.ts). Its host answers
// MPMB's "which file?" dialog itself and keeps MPMB's closing "Things to consider about the import"
// pop-up for the app to show; every other pop-up goes to the player as usual.
import type { Engine } from './engine.ts';
import type { AlertReply, AlertRequest, DialogReply, DialogView, Host, MenuItem } from './host.ts';
import { ALERT_ANSWER } from './host.ts';

/** The dialog in which MPMB asks for the path of the PDF to import from. */
export const IMPORT_DIALOG = 'IMPORT FROM PDF DIALOG';
/** The title of MPMB's pop-up at the end of an import. */
export const IMPORT_SUMMARY_TITLE = 'Things to consider about the import';
/** The file name MPMB is told; it only shows up in its progress text. */
const SOURCE_FILE = 'old-version.pdf';

/** The host of an engine that imports: answers the file dialog, keeps the summary. */
export class ImportHost implements Host {
  /** MPMB's closing pop-up text, once the import ran. */
  summary: string | null = null;
  /** Whether the dialog on top is the file dialog (its close must not reach the player's host). */
  private answering = false;

  constructor(private readonly player: Host) {}

  alert(request: AlertRequest): AlertReply | null {
    if (request.title !== IMPORT_SUMMARY_TITLE) return this.player.alert(request);
    this.summary = request.message;
    return { answer: ALERT_ANSWER.ok };
  }

  dialog(view: DialogView, first: boolean): DialogReply | null {
    if (view.description.name !== IMPORT_DIALOG) return this.player.dialog(view, first);
    this.answering = true;
    // fLoc: the path; fRel: relative to this PDF; icYe/icNo: also import the PDF's own icons (no; the
    // app carries the portrait and symbol itself).
    return {
      type: 'close',
      result: 'ok',
      state: { ...view.state, fLoc: SOURCE_FILE, fRel: false, icYe: false, icNo: true },
    };
  }

  dialogClosed(): void {
    if (this.answering) this.answering = false;
    else this.player.dialogClosed?.();
  }

  popUpMenu(items: MenuItem[]): string | null {
    return this.player.popUpMenu(items);
  }

  launchURL(url: string): void {
    this.player.launchURL?.(url);
  }

  openFile(): string | null {
    return this.player.openFile?.() ?? null;
  }

  log(message: string): void {
    this.player.log?.(message);
  }
}

/** The field that holds a sheet's imported add-on files, as `({"<date> - name.js": "code"})`. */
const FILES_FIELD = 'User_Imported_Files.Stringified';

/**
 * Adds the old sheet's add-on files to this sheet and runs them, before the import starts. MPMB's import
 * leaves out every file that isn't one of its "all_WotC" bundles (FunctionsImport.js, `fromScriptsNotInTo`:
 * for other files the list of bundle parts is empty, and an empty list counts as "already there"). A
 * player in Acrobat adds their files to the new sheet first, as MPMB's own import warning advises; the
 * app does the same, with the steps MPMB's import uses for the files it does carry over. The reset at the
 * start of the import keeps them ("keep imported scripts").
 */
function addFilesFirst(engine: Engine, source: object): void {
  const getField = (source as { getField(name: string): { value: unknown } | null }).getField(FILES_FIELD);
  const files = String(getField?.value ?? '');
  if (files === '' || files === '({})') return;
  engine.tools.realm.evaluate(
    `CurrentScriptFiles = eval(${JSON.stringify(files)});
    SetStringifieds("scriptfiles");
    InitiateLists();
    RunUserScript(true);
    setStuffAfterUserScripts();`,
    'import add-on files',
  );
}

/** The notes on the sheet's third page (Colorful) or its Additional sheet: the player's own free notes. */
const NOTES_FIELD = 'Extra.Notes';

/**
 * The player's notes after an update: what MPMB's automation wrote on the new sheet, then the old sheet's
 * lines the new one doesn't have. MPMB's import empties these notes on purpose ("The 'Notes' section on the
 * 3rd page is now solely what the automation added"), so the automation can write its newer text there. But
 * the field is also where players keep their own notes, and nothing tells them to copy those across: a
 * player who keeps the update would lose them (UI review 2, finding 01). Lines the automation wrote on both
 * sheets are left out, so they don't appear twice; text the automation changed between versions does, once
 * in each wording, which is safer than losing a line the player wrote.
 */
export function keptNotes(before: string, now: string): string {
  const lines = (text: string): string[] => text.split(/\r\n|\r|\n/);
  if (before.trim() === '' || now.includes(before)) return now;
  const automation = new Set(lines(now).map((line) => line.trim()));
  const own = lines(before)
    .filter((line) => line.trim() === '' || !automation.has(line.trim()))
    // One empty line between paragraphs at most, none at the start or end.
    .filter((line, i, all) => line.trim() !== '' || (i > 0 && all[i - 1]?.trim() !== ''))
    .join('\r')
    .trim();
  if (own === '') return now;
  return now.trim() === '' ? own : `${now.replace(/\s+$/, '')}\r\r${own}`;
}

/** Carries the player's notes across, as a player would paste them in after the import in Acrobat. */
function keepNotes(engine: Engine, source: object): void {
  const old = (source as { getField(name: string): { value: unknown } | null }).getField(NOTES_FIELD);
  if (!old) return;
  const now = String(engine.doc.states.get(NOTES_FIELD)?.value ?? '');
  const kept = keptNotes(String(old.value ?? ''), now);
  if (kept !== now) engine.edit(NOTES_FIELD, kept);
}

/**
 * Imports the offered document into the engine's sheet, as MPMB's bookmark does, then lets its timers run
 * and refreshes the shown text. The player's own notes come along (see keptNotes). The engine must have been made with an ImportHost; its summary is MPMB's
 * closing text (null when the import stopped early, after its own error pop-up).
 */
export function importSheet(engine: Engine, source: object, host: ImportHost): string | null {
  engine.offerDocument(source);
  try {
    addFilesFirst(engine, source);
    // DirectImport(true) is the path for a sheet without MPMB's folder-level import functions: it opens
    // the other document with app.openDoc, as the app's engine offers it.
    engine.tools.realm.evaluate('DirectImport(true)', 'import');
    engine.runTimers();
    keepNotes(engine, source);
    engine.doc.formatAll();
  } finally {
    engine.offerDocument(null);
  }
  return host.summary;
}
