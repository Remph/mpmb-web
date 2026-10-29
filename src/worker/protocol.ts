// Messages between the page and the engine worker.
import type { AlertReply, AlertRequest, DialogReply, DialogView, MenuItem } from '../engine/host.ts';
import type { CharacterData } from '../engine/sheet-data.ts';
import type { FieldViews } from './views.ts';

/** What the page asks the engine to do. */
export type Command =
  /** Opens the blank sheet, or a character saved by the app. */
  | { type: 'open'; character: CharacterData | null }
  /** Opens a character from a filled MPMB PDF (Colorful A4 v24.2.0). */
  | { type: 'importPdf'; bytes: ArrayBuffer }
  | { type: 'edit'; field: string; text: string }
  | { type: 'click'; field: string; widget?: number }
  | { type: 'bookmark'; path: string[] }
  /** The open character as differences from the blank sheet, to save. */
  | { type: 'save' };

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
  | { kind: 'menu'; items: MenuItem[] };

export type Answer = AlertReply | DialogReply | string | null;

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
  | { type: 'fields'; changed: FieldViews; removed: string[] }
  | { type: 'done'; id: number; result: unknown; summary: Summary }
  | { type: 'failed'; id: number; error: string };
