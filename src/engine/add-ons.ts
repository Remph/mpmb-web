// The add-on scripts a sheet carries. MPMB keeps them in two fields and runs both when the sheet
// opens (RunUserScript in InitializeEverything), the way Acrobat does when it opens the PDF:
// - `User_Imported_Files.Stringified`: whole files imported with "Add Extra Materials", as
//   ({"2026/10/29 - name.js": "code"}), read into the global CurrentScriptFiles.
// - `User Script`: code pasted into MPMB's script dialog.
// A file that fails to run is dropped from the sheet by MPMB itself, with an alert, so after opening
// the global holds the files that work.
import type { Engine } from './engine.ts';
import type { DialogReply, DialogView } from './host.ts';

export interface AddOns {
  /** Imported files by the name MPMB gave them (the import date and the script's iFileName). */
  files: string[];
  /** Whether the sheet carries pasted code in `User Script`. */
  manual: boolean;
}

export function addOnsOf(engine: Engine): AddOns {
  const files = engine.tools.realm.global.CurrentScriptFiles;
  const manual = engine.doc.states.get('User Script')?.value ?? '';
  return {
    files: files && typeof files === 'object' ? Object.keys(files) : [],
    manual: String(manual).trim() !== '',
  };
}

/** A script file as the sheet keeps it: MPMB's name for it ("2026/11/03 - name.js") and its code. */
export interface ScriptFile {
  key: string;
  text: string;
}

/** The sheet's scripts with their code, for the app's "Add-on scripts" window. */
export interface ScriptFiles {
  files: ScriptFile[];
  /** The code pasted into MPMB's script dialog ("" for none). */
  manual: string;
}

export function scriptFilesOf(engine: Engine): ScriptFiles {
  const files = engine.tools.realm.global.CurrentScriptFiles as Record<string, unknown> | undefined;
  const manual = engine.doc.states.get('User Script')?.value ?? '';
  return {
    files:
      files && typeof files === 'object' ? Object.keys(files).map((key) => ({ key, text: String(files[key]) })) : [],
    manual: String(manual),
  };
}

/**
 * What the "Add-on scripts" window changes: files to remove (by MPMB's name for them) and the code of
 * files to add. A newer version of a file is both: the old one goes first, so MPMB doesn't ask to
 * overwrite what the player already chose to replace.
 */
export interface ScriptChanges {
  remove: string[];
  add: string[];
}

/** MPMB's dialog for script files (ImportScriptFileDialog), "IMPORT CUSTOM SCRIPT DIALOG". */
export const FILES_DIALOG = 'IMPORT CUSTOM SCRIPT DIALOG';
/** Runs that dialog, as MPMB's "Add Extra Materials" menu does for "Import a file with additional material". */
export const FILES_DIALOG_SCRIPT = 'ImportScriptFileDialog()';
/** MPMB's dialog for pasted code, as the same menu does for "Add material manually (copy-paste)". */
export const PASTE_SCRIPT = 'AddUserScript()';

/**
 * The player's part in MPMB's files dialog, step by step: select each file to remove and press "DELETE
 * selected file", press "Add file" once per new file (the worker hands MPMB the code as the picked file),
 * then "Apply changes". Answers only that dialog; MPMB's alerts and its Source Selection after it go to
 * the player, as in Acrobat. A file MPMB no longer lists is skipped.
 */
export function answerFilesDialog(changes: ScriptChanges): (view: DialogView) => DialogReply | null {
  const removals = [...changes.remove];
  let adds = changes.add.length;
  /** A file is selected and its "DELETE selected file" press is next. */
  let selected = false;
  return (view) => {
    if (view.description.name !== FILES_DIALOG) return null;
    if (selected) {
      selected = false;
      return { type: 'event', id: 'bRem', state: view.state };
    }
    const listed = (view.state.scrF ?? {}) as Record<string, unknown>;
    let key = removals.shift();
    while (key !== undefined && !(key in listed)) key = removals.shift();
    if (key !== undefined) {
      selected = true;
      // A hierarchical list box marks the selected entry with a positive number (GetPositiveElement).
      const scrF = Object.fromEntries(Object.keys(listed).map((name) => [name, name === key ? 1 : -1]));
      return { type: 'event', id: 'scrF', state: { ...view.state, scrF } };
    }
    if (adds > 0) {
      adds -= 1;
      return { type: 'event', id: 'bAdd', state: view.state };
    }
    return { type: 'close', result: 'ok', state: view.state };
  };
}
