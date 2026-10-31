// MPMB's welcome pop-up on a new sheet, answered by the app (src/engine/welcome.ts).
import { describe, expect, test } from 'vitest';
import type { AlertRequest } from '../src/engine/host.ts';
import { answerWelcome } from '../src/engine/welcome.ts';
import { openSheet } from './characters.ts';
import { ScriptedHost } from './hosts.ts';

const WELCOME = 'Welcome to';

describe('the welcome pop-up', () => {
  test('a new sheet shows it, and the app answers it with "don’t show again" ticked', () => {
    const shown = new ScriptedHost();
    openSheet(undefined, shown);
    expect(shown.asked.some((a) => a.what.includes(WELCOME))).toBe(true);

    const player = new ScriptedHost();
    const engine = openSheet(undefined, {
      alert: (request: AlertRequest) => answerWelcome(request) ?? player.alert(request),
      dialog: player.dialog.bind(player),
      popUpMenu: player.popUpMenu.bind(player),
    });
    expect(player.asked.some((a) => a.what.includes(WELCOME))).toBe(false);
    expect(engine.values()['Opening Remember']).toBe('Yes');
  });

  test('other alerts go to the player', () => {
    expect(answerWelcome({ message: 'x', title: 'Changes', icon: 3, buttons: 0 })).toBeNull();
  });
});
