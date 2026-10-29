// M1 spike (throwaway): load MPMB's scripts onto the stand-in and run them.
import { installAcrobat } from './acrobat.js';
import { PRELUDE } from './prelude.js';

// Dialogs and pop-ups are answered by `host`. The default host records what was asked
// and picks the "no" answer, so a run never blocks.
// Runs a dialog without a screen: the handlers (initialize, validate, commit) live on the dialog
// object MPMB's scripts pass in, and the results are read from that same object afterwards, so a
// dialog host only has to give them a `dialog` API and answer "ok" or "cancel".
// `pick(name, api, state)` plays the user between initialize and commit.
export function runDialog(dlg, pick) {
  const state = {};
  const api = {
    ended: null,
    load(o) {
      for (const [k, v] of Object.entries(o)) state[k] = v;
    },
    store() {
      return JSON.parse(JSON.stringify(state));
    },
    end(result) {
      api.ended = result;
    },
    enable() {},
    visible() {},
    focus() {},
    setForeColorRed() {},
    setForeColorBlack() {},
    insertEntryInList() {},
    removeAllEntriesFromList() {},
    removeEntryFromList() {},
    reset() {},
  };
  dlg.initialize?.(api);
  if (api.ended) return api.ended;
  const choice = pick?.(dlg.description?.name, api, state);
  if (choice === 'cancel') return 'cancel';
  if (dlg.validate && dlg.validate(api) === false) return 'cancel';
  dlg.commit?.(api);
  dlg.destroy?.(api);
  return api.ended ?? 'ok';
}

export function recordingHost(answers = {}) {
  const calls = [];
  return {
    calls,
    alert(opts) {
      calls.push({ kind: 'alert', msg: String(opts.cMsg ?? '').slice(0, 200), type: opts.nType });
      return answers.alert ?? 1; // 1 = OK / first button
    },
    execDialog(dlg) {
      calls.push({ kind: 'execDialog', name: dlg?.description?.name, has: Object.keys(dlg ?? {}).join(',') });
      return runDialog(dlg, answers.dialogPick);
    },
    popUpMenuEx(items) {
      calls.push({ kind: 'popUpMenuEx', n: items.length });
      return null;
    },
    launchURL(url) {
      calls.push({ kind: 'launchURL', url });
    },
    log() {},
  };
}

// `scripts`: [{name, code}] in the order Acrobat runs them (alphabetical by name).
// Returns {doc, timings} after every script has run, so `InitializeEverything()` (the last
// line of Startup.js) has already happened.
export function loadSheet({ scripts, defs, host, evalGlobal, g, now = () => performance.now() }) {
  const doc = installAcrobat(g, { defs, host, evalGlobal });
  evalGlobal(PRELUDE);
  const timings = [];
  for (const s of scripts) {
    const t0 = now();
    try {
      evalGlobal(s.code, s.name);
    } catch (err) {
      doc.stats.errors.push({ where: 'load ' + s.name, message: String(err?.stack ?? err).slice(0, 800) });
    }
    timings.push([s.name, Math.round((now() - t0) * 10) / 10]);
  }
  return { doc, timings };
}
