// The engine in a real browser, through the worker and its blocking pop-ups: open the blank sheet,
// replay a reference player's actions with scripted answers, and compare page 1 with Acrobat's
// values. Run `pnpm dev` and open /test/browser/engine-check.html (Firefox, Chrome, Safari). Not
// part of the app build.
import type { AlertReply, DialogReply, MenuItem } from '../../src/engine/host.ts';
import { characterSheet } from '../../src/engine/sheet.ts';
import type { CharacterData } from '../../src/engine/sheet-data.ts';
import { EngineClient } from '../../src/worker/client.ts';
import type { Done, PopUps } from '../../src/worker/client.ts';
import paladin from '../characters/paladin8-warlock2.json';
import { compareSheets, show } from '../compare.ts';
import { ScriptedHost } from '../hosts.ts';
import { PLAYERS, answersFor } from '../players.ts';
import type { Action } from '../players.ts';

const FIRST_PAGE = 0;
const ASKED_TEXT = 60;
const JSON_INDENT = 2;

interface CheckResult {
  isolated: boolean;
  openMs: number;
  playMs: number;
  asked: string[];
  scriptErrors: number;
  compared: number;
  differences: string;
}

const output = document.getElementById('result');
const print = (text: string): void => {
  if (output) output.textContent = text;
};

/** The scripted host, behind the page's asynchronous pop-up interface. */
const popUpsFrom = (host: ScriptedHost): PopUps => ({
  alert: async (request) => host.alert(request) ?? ({ answer: 1 } satisfies AlertReply),
  dialog: async (view, first) =>
    host.dialog(view, first) ?? ({ type: 'close', result: 'cancel', state: {} } satisfies DialogReply),
  menu: async (items: MenuItem[]) => host.popUpMenu(items),
});

function act(client: EngineClient, action: Action): Promise<Done> {
  if ('type' in action) return client.edit(action.type, action.text);
  if ('click' in action) return client.click(action.click);
  return client.bookmark(action.bookmark);
}

async function check(): Promise<CheckResult> {
  const player = PLAYERS['paladin8-warlock2'];
  const host = new ScriptedHost(answersFor(player));
  const client = new EngineClient(popUpsFrom(host));
  const t0 = performance.now();
  await client.open();
  const t1 = performance.now();
  const last = await player.actions.reduce<Promise<Done | null>>(async (previous, action) => {
    await previous;
    return act(client, action);
  }, Promise.resolve(null));
  const t2 = performance.now();
  const saved = await client.save();
  const acrobat = characterSheet(paladin as unknown as CharacterData);
  const ours = characterSheet(saved);
  const compared = Object.values(acrobat.fields).filter((def) => def.widgets.some((w) => w.page === FIRST_PAGE)).length;
  const differences = compareSheets(acrobat, ours, ['value']).filter((d) => d.page === FIRST_PAGE);
  client.close();
  return {
    isolated: client.answersPopUps,
    openMs: Math.round(t1 - t0),
    playMs: Math.round(t2 - t1),
    asked: host.asked.map((a) => `${a.kind}: ${a.what.slice(0, ASKED_TEXT)}`),
    scriptErrors: last?.summary.errors ?? 0,
    compared,
    differences: show(differences),
  };
}

const run = async (): Promise<void> => {
  print('Running…');
  try {
    const result = await check();
    Object.assign(window, { engineCheck: result });
    print(JSON.stringify(result, null, JSON_INDENT));
  } catch (err) {
    Object.assign(window, { engineCheck: { error: String(err) } });
    print(String(err));
  }
};

void run();
