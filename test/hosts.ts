// Hosts that play the user in tests: they answer alerts, dialogs and menus from a script of answers
// and record what was asked.
import type {
  AlertReply,
  AlertRequest,
  DialogReply,
  DialogView,
  Host,
  MenuItem,
  Unavailable,
} from '../src/engine/host.ts';
import { ALERT_ANSWER, ALERT_BUTTONS } from '../src/engine/host.ts';

/** How much of a menu's item names `asked` keeps. */
const MENU_TEXT = 200;

export interface Asked {
  kind: 'alert' | 'dialog' | 'menu';
  /** Alert text, dialog name, or the menu's item names. */
  what: string;
}

/** Answers for one dialog, by the dialog's name: what to change and which button closes it. */
export interface DialogAnswer {
  /** Element values to set, then optional element events (button clicks inside the dialog). */
  steps?: { set?: Record<string, unknown>; click?: string }[];
  /** The closing button: "ok" (default), "cancel" or a custom result. */
  close?: string;
}

export interface ScriptedAnswers {
  /** Answer for alerts whose text contains the key; others get OK / No. */
  alerts?: Record<string, number>;
  /** Answers by dialog name (description.name); other dialogs are closed with OK as they are. */
  dialogs?: Record<string, DialogAnswer | DialogAnswer[]>;
  /** Menu answers in order: the path of item names to pick (each a prefix of cName), or null for none. */
  menus?: (string[] | null)[];
}

export class ScriptedHost implements Host {
  readonly asked: Asked[] = [];
  private readonly answers: ScriptedAnswers;
  private readonly dialogUses = new Map<string, number>();
  private open: { answer: DialogAnswer; step: number } | null = null;
  private menuIndex = 0;

  constructor(answers: ScriptedAnswers = {}) {
    this.answers = answers;
  }

  alert(request: AlertRequest): AlertReply | null {
    this.asked.push({ kind: 'alert', what: request.message });
    const match = Object.entries(this.answers.alerts ?? {}).find(([key]) => request.message.includes(key));
    if (match) return { answer: match[1] };
    return { answer: request.buttons >= ALERT_BUTTONS.yesNo ? ALERT_ANSWER.no : ALERT_ANSWER.ok };
  }

  dialog(view: DialogView, first: boolean): DialogReply | null {
    const name = String(view.description.name ?? '');
    if (first) {
      this.asked.push({ kind: 'dialog', what: name });
      const configured = this.answers.dialogs?.[name];
      const uses = this.dialogUses.get(name) ?? 0;
      this.dialogUses.set(name, uses + 1);
      const answer = Array.isArray(configured) ? configured[uses] : configured;
      this.open = answer ? { answer, step: 0 } : null;
    }
    if (!this.open) return { type: 'close', result: 'ok', state: view.state };
    const step = this.open.answer.steps?.[this.open.step++];
    if (step) {
      const state = { ...view.state, ...step.set };
      return step.click ? { type: 'event', id: step.click, state } : { type: 'event', id: '__none__', state };
    }
    return { type: 'close', result: this.open.answer.close ?? 'ok', state: view.state };
  }

  popUpMenu(items: MenuItem[]): string | null {
    this.asked.push({
      kind: 'menu',
      what: items
        .map((i) => i.cName)
        .join(' | ')
        .slice(0, MENU_TEXT),
    });
    const path = this.answers.menus?.[this.menuIndex++];
    if (!path) return null;
    const pick = path.reduce<MenuItem | undefined>((at, name, i) => {
      const list = i === 0 ? items : [at?.oSubMenu ?? []].flat();
      return list.find((item) => item.cName.startsWith(name));
    }, undefined);
    if (!pick) throw new Error(`No menu item ${path.join(' > ')} in ${items.map((i) => i.cName).join(', ')}`);
    return pick.cReturn ?? pick.cName;
  }

  launchURL(): void {}

  /** The Acrobat features the scripts used that the app doesn't have yet, in order. */
  readonly unavailableUsed: Unavailable[] = [];

  unavailable(feature: Unavailable): void {
    this.unavailableUsed.push(feature);
  }
}
