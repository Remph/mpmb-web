// The buttons of MPMB's app.alert pop-ups, in the app's order (the main button last) and with the main one
// marked.
import { ALERT_ANSWER, ALERT_BUTTONS } from '../engine/host.ts';
import type { Texts } from '../i18n.ts';

export interface AlertButton {
  answer: number;
  label: string;
  /** Drawn as the filled main button, the one the eye and the thumb go to. */
  primary: boolean;
  /** Drawn in red: the answer that does what can't be undone. */
  danger: boolean;
}

/**
 * MPMB's warnings that an answer can't be taken back: "This cannot be undone!", "(can't be undone)", "All this
 * data will be permanently lost". Matches all three; rejects "This will undo any changes".
 * Try it: https://regex101.com/?regex=(can%27t%7Ccannot%7Ccan+not)+be+undone%7Cpermanently+(lost%7Cdelete)&flags=i&testString=This+cannot+be+undone!%0A(can%27t+be+undone)%0AAll+this+data+will+be+permanently+lost.%0AThis+will+undo+any+changes
 */
const IRREVERSIBLE = /(can't|cannot|can not) be undone|permanently (lost|delete)/i;

/**
 * The buttons for an alert. A yes/no question whose message says Yes can't be undone ("Start over", "Delete
 * all the Spell Sheet(s)") makes No the main button and draws Yes in red: the safe answer is the easy one
 * (UI review 2, finding 02). The order stays the same everywhere, so a player's hand learns one place.
 */
export function alertButtons(buttons: number, message: string, t: Texts): AlertButton[] {
  const ok = { answer: ALERT_ANSWER.ok, label: t.ok };
  const cancel = { answer: ALERT_ANSWER.cancel, label: t.cancel };
  const yes = { answer: ALERT_ANSWER.yes, label: t.yes };
  const no = { answer: ALERT_ANSWER.no, label: t.no };
  const order: { answer: number; label: string }[] =
    buttons === ALERT_BUTTONS.okCancel
      ? [cancel, ok]
      : buttons === ALERT_BUTTONS.yesNo
        ? [no, yes]
        : buttons === ALERT_BUTTONS.yesNoCancel
          ? [cancel, no, yes]
          : [ok];
  const careful = order.includes(yes) && IRREVERSIBLE.test(message);
  return order.map((button, i) => ({
    ...button,
    primary: careful ? button === no : i === order.length - 1,
    danger: careful && button === yes,
  }));
}
