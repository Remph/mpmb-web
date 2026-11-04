// One version of MPMB's sheet as the engine runs it: the document scripts and the blank-sheet data of
// one release. The app ships the current version in the worker; older versions it keeps (see
// vendor/versions/README.md) come to the worker as a pack, to open characters saved on them and to
// update those characters with MPMB's own import (import-sheet.ts).
import type { SheetScript } from './engine.ts';
import type { PackedSheet } from './sheet-data.ts';

export interface SheetPack {
  /** MPMB's version number, as the sheet's document info has it ("24.2.0"). */
  version: string;
  scripts: SheetScript[];
  sheet: PackedSheet;
}
