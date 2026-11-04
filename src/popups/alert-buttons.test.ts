import { describe, expect, test } from 'vitest';
import { ALERT_ANSWER, ALERT_BUTTONS } from '../engine/host.ts';
import { ui } from '../i18n.ts';
import { alertButtons } from './alert-buttons.ts';

const main = (buttons: number, message: string) =>
  alertButtons(buttons, message, ui.en)
    .filter((b) => b.primary)
    .map((b) => b.label);

describe('alert buttons', () => {
  test('the last button is the main one', () => {
    expect(alertButtons(ALERT_BUTTONS.yesNo, 'Add the feat?', ui.en).map((b) => b.label)).toEqual(['No', 'Yes']);
    expect(main(ALERT_BUTTONS.yesNo, 'Add the feat?')).toEqual(['Yes']);
    expect(main(ALERT_BUTTONS.okCancel, 'This cannot be undone!')).toEqual(['OK']);
    expect(main(ALERT_BUTTONS.ok, 'Done.')).toEqual(['OK']);
  });

  test.each([
    'Are you sure you want to reset all fields and functions to their initial value?\n\nThis cannot be undone!',
    'Removing the Spell Sheets cannot be undone!',
    "Delete the last page of the Spell Sheets (can't be undone)",
    'All this data will be permanently lost.',
  ])('No is the main button, Yes red, when Yes cannot be undone: %s', (message) => {
    const buttons = alertButtons(ALERT_BUTTONS.yesNoCancel, message, ui.en);
    expect(buttons.map((b) => b.label)).toEqual(['Cancel', 'No', 'Yes']);
    expect(buttons.filter((b) => b.primary).map((b) => b.answer)).toEqual([ALERT_ANSWER.no]);
    expect(buttons.filter((b) => b.danger).map((b) => b.answer)).toEqual([ALERT_ANSWER.yes]);
  });

  test('"undo" alone is no warning', () => {
    expect(main(ALERT_BUTTONS.yesNo, 'This will undo any changes you have made')).toEqual(['Yes']);
  });
});
