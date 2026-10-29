// The add-on scripts a sheet carries. MPMB keeps them in two fields and runs both when the sheet
// opens (RunUserScript in InitializeEverything), the way Acrobat does when it opens the PDF:
// - `User_Imported_Files.Stringified`: whole files imported with "Add Extra Materials", as
//   ({"2026/10/29 - name.js": "code"}), read into the global CurrentScriptFiles.
// - `User Script`: code pasted into MPMB's script dialog.
// A file that fails to run is dropped from the sheet by MPMB itself, with an alert, so after opening
// the global holds the files that work.
import type { Engine } from './engine.ts';

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
