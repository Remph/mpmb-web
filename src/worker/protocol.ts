// Messages between the page and the engine worker.
import type { AddOns, ScriptChanges } from '../engine/add-ons.ts';
import type { UnitSystem } from '../engine/builder.ts';
import type { ScoreChange } from '../engine/scores.ts';
import type { SpellPicks, SpellSheetPicks } from '../engine/spells.ts';
import type { AlertReply, AlertRequest, DialogReply, DialogView, MenuItem } from '../engine/host.ts';
import type { CharacterData } from '../engine/sheet-data.ts';
import type { SheetPack } from '../engine/sheet-pack.ts';
import type { ImageSlot, SheetImage, SheetImages } from '../engine/types.ts';
import type { FieldViews } from './views.ts';

/** What the page asks the engine to do. */
export type Command =
  /**
   * Opens the blank sheet, or a character saved by the app. `pack`: on an older version of the sheet
   * that the app keeps (sheet-versions.ts), instead of the current one.
   */
  | { type: 'open'; character: CharacterData | null; pack?: SheetPack }
  /** Opens a character from a filled MPMB PDF (Colorful A4 v24.2.0, or the version of `pack`). */
  | { type: 'importPdf'; bytes: ArrayBuffer; pack?: SheetPack }
  /** The values a player sees on the open sheet (FieldValues), to tell what a sheet update changed. */
  | { type: 'values' }
  /**
   * The open sheet becomes the old document of an update in another worker (`migrate`): it answers that
   * worker's requests from the port, through the shared buffer (link.ts). Its pop-ups are answered as
   * closed from then on: the player sees the new sheet's.
   */
  | { type: 'serve'; port: MessagePort; buffer: SharedArrayBuffer }
  /**
   * Opens the blank current sheet and imports the character the other worker serves into it, with MPMB's
   * own "Import from another sheet" (import-sheet.ts); then puts the pictures on it, which the import
   * leaves out. Returns Migrated.
   */
  | { type: 'migrate'; port: MessagePort; buffer: SharedArrayBuffer; images?: SheetImages }
  /**
   * The open character written into the player's own copy of the sheet (a blank Colorful A4 v24.2.0 is
   * best); returns the filled PDF's bytes.
   */
  | { type: 'exportPdf'; bytes: ArrayBuffer }
  | { type: 'edit'; field: string; text: string; cancelable?: boolean }
  /**
   * `shift`: with Shift held, as for MPMB's spell row menu. `newRow`: a spell level's "+ Row" on this
   * row's check box, MPMB's menu on a new row inserted there (newSpellRow in engine/spells.ts).
   */
  | { type: 'click'; field: string; widget?: number; shift?: boolean; newRow?: boolean }
  | { type: 'bookmark'; path: string[] }
  /** The open character as differences from the blank sheet, to save. */
  | { type: 'save' }
  /** The add-on scripts the open sheet carries now (the player may have added or removed some). */
  | { type: 'addOns' }
  /** The sheet's add-on scripts with their code (ScriptFiles), for the "Add-on scripts" window. */
  | { type: 'scriptFiles' }
  /** Removes and adds script files through MPMB's own files dialog, answered in the player's place. */
  | { type: 'setScripts'; changes: ScriptChanges }
  /** Opens MPMB's own dialog for pasted code. */
  | { type: 'pasteScript' }
  /** What the Build screen offers and shows (BuilderInfo), read from MPMB's data. */
  | { type: 'builder' }
  /** Switches MPMB's unit system, answering its units dialog in the player's place. */
  | { type: 'units'; system: UnitSystem }
  /** Sets ability score columns through MPMB's Ability Scores dialog, answered in the player's place. */
  | { type: 'scores'; changes: ScoreChange[] }
  /**
   * Presses a button whose script shows one of MPMB's menus (class features, species, a feat line) and
   * answers the menu with this item's cReturn, as the player's pick. Returns false (and picks nothing)
   * when the menu doesn't offer it.
   */
  | { type: 'pick'; field: string; answer: string }
  /** The same for one of MPMB's bookmarks (its "Functions" menu), as `path` names it. */
  | { type: 'pickBookmark'; path: string[]; answer: string }
  /** What MPMB's spell dialogs offer and hold (SpellsInfo), read without showing them. */
  | { type: 'spells' }
  /**
   * The Spells step's picks into MPMB's spell dialogs, then MPMB's "(Re)generate a Spell Sheet" with the app
   * pressing OK in those dialogs.
   */
  | { type: 'setSpells'; picks: SpellPicks[]; sheet: SpellSheetPicks | null }
  /** Puts the portrait or symbol on the sheet (already fitted by the page), or takes it off (null). */
  | { type: 'setImage'; slot: ImageSlot; image: SheetImage | null };

/** The page's first message: the shared memory for answers, when the page is cross-origin isolated. */
export interface Setup {
  type: 'setup';
  buffer: SharedArrayBuffer | null;
}

export interface CommandMessage {
  type: 'command';
  id: number;
  command: Command;
}

export type ToWorker = Setup | CommandMessage;

/** A pop-up the scripts are waiting for. The page answers through the shared memory channel. */
export type Ask =
  | { kind: 'alert'; request: AlertRequest }
  | { kind: 'dialog'; view: DialogView; first: boolean }
  | { kind: 'menu'; items: MenuItem[] }
  /** Acrobat's file picker (Host.openFile); the answer is the file's text, or null. */
  | { kind: 'file' };

export type Answer = AlertReply | DialogReply | string | null;

/** What `open` and `importPdf` return. */
export interface Opened {
  addOns: AddOns;
}

/** What `migrate` returns. */
export interface Migrated extends Opened {
  /** MPMB's closing "Things to consider about the import" text; null when the import stopped early. */
  summary: string | null;
}

/**
 * Why a command failed, for the page to explain in the player's language; anything else is a bug and
 * shows the worker's message.
 */
export type FailureCode =
  /** Not a PDF, or a PDF the reader can't take apart. */
  | 'unreadable-pdf'
  /** A PDF, but not the sheet type and version the app ships (`detail`: what it is, `found`: its info). */
  | 'wrong-sheet';

/** The sheet a PDF says it is (its document info), when it is not the one the app ships. */
export interface FoundSheet {
  type: string;
  version: string;
}

/** One entry of MPMB's bookmarks (its menu), as the page needs it. */
export interface MenuNode {
  name: string;
  children: MenuNode[];
  /** Whether clicking it runs a script. */
  action: boolean;
}

export interface Summary {
  /** Script errors so far (MPMB's scripts throwing), for the page to report. */
  errors: number;
  /** Acrobat features the scripts used that the engine leaves out, with counts. */
  missing: Record<string, number>;
}

export type FromWorker =
  | { type: 'ask'; ask: Ask }
  /** A pop-up the page can only show, because the worker could not wait for an answer. */
  | { type: 'notice'; ask: Ask }
  | { type: 'launchURL'; url: string }
  /** The dialog shown last has closed (see Host.dialogClosed). */
  | { type: 'dialogClosed' }
  | { type: 'fields'; changed: FieldViews; removed: string[] }
  /** MPMB's bookmarks, when they changed (MPMB adds the pages it spawns). */
  | { type: 'menu'; menu: MenuNode[] }
  | { type: 'done'; id: number; result: unknown; summary: Summary }
  | { type: 'failed'; id: number; error: string; code?: FailureCode; detail?: string; found?: FoundSheet };
