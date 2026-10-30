// What the engine asks of the outside world: Acrobat's pop-ups. MPMB's scripts wait for the answer
// (`app.alert` returns the button, `app.execDialog` the result), so every call here is synchronous.
// In the app the worker blocks while the page shows the pop-up (see src/worker/); in the tests a
// scripted host answers.

/* eslint-disable ts-patterns/no-magic-numbers -- these tables name the numbers of Acrobat's API */
/** Acrobat's alert button sets (nType), and the numbers `app.alert` returns. */
export const ALERT_BUTTONS = { ok: 0, okCancel: 1, yesNo: 2, yesNoCancel: 3 } as const;
export const ALERT_ANSWER = { ok: 1, cancel: 2, no: 3, yes: 4 } as const;
/* eslint-enable ts-patterns/no-magic-numbers */

export interface AlertRequest {
  message: string;
  title: string;
  /** 0 error, 1 warning, 2 question, 3 status. */
  icon: number;
  /** One of ALERT_BUTTONS. */
  buttons: number;
  /** "Do not show this message again" check box, if the script asked for one. */
  checkbox?: { message: string; value: boolean };
}

export interface AlertReply {
  /** One of ALERT_ANSWER. */
  answer: number;
  checkboxValue?: boolean;
}

/** A dialog element as Acrobat describes it; the page draws it. Only the keys MPMB uses are typed. */
export interface DialogElement {
  type?: string;
  item_id?: string;
  name?: string;
  elements?: DialogElement[];
  [key: string]: unknown;
}

export interface DialogDescription {
  name?: string;
  elements?: DialogElement[];
  [key: string]: unknown;
}

/** Element values by item_id, as `dialog.load()` and `dialog.store()` exchange them. */
export type DialogState = Record<string, unknown>;

export interface DialogView {
  description: DialogDescription;
  state: DialogState;
  /** Elements switched off or hidden by the handlers, by item_id. */
  enabled: Record<string, boolean>;
  visible: Record<string, boolean>;
  /** Elements whose text is red (`setForeColorRed`). */
  red: Record<string, boolean>;
  /** The drop-down entries of combo boxes (edit_text with PopupEdit), by item_id. */
  choices: Record<string, string[]>;
}

/**
 * The page's answer while a dialog is open: an element was used (its handler runs and the dialog is
 * shown again), or the dialog closes with a button ("ok", "cancel", "other").
 */
export type DialogReply =
  { type: 'event'; id: string; state: DialogState } | { type: 'close'; result: string; state: DialogState };

export interface MenuItem {
  cName: string;
  cReturn?: string;
  bMarked?: boolean;
  bEnabled?: boolean;
  oSubMenu?: MenuItem | MenuItem[];
}

/**
 * A menu as Acrobat shows it. MPMB deletes empty groups from its menu arrays (`delete menu[i]`), which
 * leaves holes; after the JSON copy they are nulls, and Acrobat simply skips them.
 */
export function menuItems(raw: unknown): MenuItem[] {
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .filter((item): item is MenuItem => typeof item === 'object' && item !== null)
    .map((item) => (item.oSubMenu === undefined ? item : { ...item, oSubMenu: menuItems(item.oSubMenu) }));
}

export interface Host {
  /** Shows an alert and returns the button pressed, or null when it can't wait for the user. */
  alert(request: AlertRequest): AlertReply | null;
  /** Shows the dialog (first call) or its new state (later calls); null when it can't wait. */
  dialog(view: DialogView, first: boolean): DialogReply | null;
  /**
   * The dialog shown last has closed. Dialogs can open from a dialog's handlers, so the page keeps
   * them as a stack; an element event doesn't tell the page whether its handler ended the dialog.
   */
  dialogClosed?(): void;
  /** Shows a pop-up menu; returns the chosen item's cReturn, or null for none. */
  popUpMenu(items: MenuItem[]): string | null;
  launchURL?(url: string): void;
  /** Acrobat's console (console.println). */
  log?(message: string): void;
}
