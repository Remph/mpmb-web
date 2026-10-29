// M1 spike (throwaway): the sheet runs in this worker. Pop-ups block it with Atomics.wait on a
// SharedArrayBuffer while the page answers, which is the part that needs cross-origin isolation.
import { loadSheet } from '../src/sheet.js';

const decoder = new TextDecoder();
let doc = null;
let waitedMs = 0; // time spent blocked on the page, so run times can leave it out
let ctrl = null; // Int32Array: [0] flag (0 = waiting, 1 = answer ready), [1] byte length
let bytes = null; // Uint8Array for the JSON answer
let canBlock = false;
let asks = 0;

// Dialog descriptions carry functions (icon streams, handlers) that postMessage cannot copy
const plain = (o) => JSON.parse(JSON.stringify(o ?? null));

// Send a question to the page and block until it answers (or, without a SharedArrayBuffer,
// give up and return null, so the caller picks a default).
function ask(msg) {
  asks++;
  if (!canBlock) {
    postMessage({ type: 'ask', msg, blocking: false });
    return null;
  }
  Atomics.store(ctrl, 0, 0);
  postMessage({ type: 'ask', msg, blocking: true });
  const t0 = performance.now();
  Atomics.wait(ctrl, 0, 0);
  waitedMs += performance.now() - t0;
  const len = Atomics.load(ctrl, 1);
  return JSON.parse(decoder.decode(bytes.slice(0, len))); // slice(): TextDecoder won't read shared memory
}

// A dialog the way Acrobat runs it: the handlers stay here, the page draws the elements and
// sends back clicks (`event`) and finally `close`.
function execDialog(dlg) {
  const state = {};
  const api = {
    ended: null,
    load(o) {
      Object.assign(state, o);
    },
    store: () => JSON.parse(JSON.stringify(state)),
    end(r) {
      api.ended = r;
    },
    enable() {},
    visible() {},
    focus() {},
    setForeColorRed() {},
    setForeColorBlack() {},
    insertEntryInList() {},
    removeAllEntriesFromList() {},
  };
  dlg.initialize?.(api);
  if (api.ended) return api.ended;
  let reply = ask({
    kind: 'dialog',
    name: dlg.description?.name,
    description: plain(dlg.description),
    state: plain(state),
  });
  while (reply?.type === 'event') {
    Object.assign(state, reply.state);
    dlg[reply.id]?.(api); // a button or element handler on the dialog object
    if (api.ended) return api.ended;
    reply = ask({ kind: 'dialog-update', name: dlg.description?.name, state: plain(state) });
  }
  if (!reply || reply.result === 'cancel') return 'cancel';
  Object.assign(state, reply.state);
  if (dlg.validate && dlg.validate(api) === false) return 'cancel';
  dlg.commit?.(api);
  dlg.destroy?.(api);
  return api.ended ?? 'ok';
}

const host = {
  alert: (opts) => ask({ kind: 'alert', msg: String(opts.cMsg ?? '').slice(0, 300), type: opts.nType })?.answer ?? 1,
  execDialog,
  popUpMenuEx: (items) => ask({ kind: 'popup', n: items.length })?.answer ?? null,
  launchURL() {},
  log() {},
};

const evalGlobal = (code, filename = 'eval') => (0, eval)(code + '\n//# sourceURL=' + filename);

const getJson = async (url) => (await fetch(url)).json();

// A filled PDF read in the page becomes definitions on top of the blank sheet: values, submitName
// and visibility are overridden; fields that only exist in the filled PDF are the pages spawned
// from templates ("P6.SSfront.<name>"), copied from the blank sheet's template fields.
function applyImport(blank, imported) {
  const fields = structuredClone(blank.fields);
  const spawned = new Set();
  for (const [name, d] of Object.entries(imported.fields)) {
    let def = fields[name];
    if (!def) {
      const m = /^(P\d+)\.([A-Za-z]+)\.(.*)$/.exec(name);
      const src = m && blank.fields[m[3]];
      if (!src) continue;
      def = fields[name] = structuredClone(src);
      def.v = def.dv;
      spawned.add(m[1]);
    }
    def.v = d.v ?? undefined;
    if (d.tm != null) def.tm = d.tm;
    def.disp = d.disp;
  }
  return { ...blank, fields, numPages: blank.numPages + spawned.size };
}

async function boot({ base, char, scripts, sab, imported }) {
  if (sab) {
    ctrl = new Int32Array(sab, 0, 2);
    bytes = new Uint8Array(sab, 8);
    canBlock = true;
  }
  const t0 = performance.now();
  const blank = await getJson(base + 'data/blank.json');
  const defs = imported
    ? applyImport(blank, imported)
    : char
      ? { ...(await getJson(base + 'data/' + char)), templates: blank.templates }
      : blank;
  const list = scripts === 'upstream' ? await getJson(base + 'data/upstream.json') : blank.docJs;
  const fetchMs = performance.now() - t0;
  const t1 = performance.now();
  const res = loadSheet({ scripts: list, defs, host, evalGlobal, g: self });
  doc = res.doc;
  return {
    fetchMs,
    loadMs: performance.now() - t1,
    timings: res.timings,
    errors: doc.stats.errors.length,
    fields: doc.fields.size,
  };
}

const ops = {
  boot,
  userCommit: ({ name, value }) => ({ ok: doc.userCommit(name, value) }),
  runTimers: () => ({ ran: doc.runTimers() }),
  value: ({ name }) => ({ value: doc.fields.get(name)?.$.value }),
  eval: ({ code }) => ({ value: String(evalGlobal(code)) }),
  // All values as strings, for comparing with what Acrobat saved
  values: () => {
    const out = {};
    for (const [n, f] of doc.fields) out[n] = String(f.$.value);
    return { values: out };
  },
  calculateNow: () => {
    doc.calculateNow();
    return {};
  },
  // Round trips through the blocking channel, to time them
  pings: ({ n }) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) ask({ kind: 'ping', i });
    return { perTripMs: (performance.now() - t0) / n };
  },
  errors: () => ({ errors: doc.stats.errors, missing: doc.stats.missing }),
  env: () => ({
    crossOriginIsolated: self.crossOriginIsolated,
    sab: typeof SharedArrayBuffer !== 'undefined',
    canBlock,
  }),
};

self.onmessage = async (e) => {
  const { id, op, args } = e.data;
  waitedMs = 0;
  asks = 0;
  const t0 = performance.now();
  try {
    const result = await ops[op](args ?? {});
    const ms = performance.now() - t0;
    postMessage({
      type: 'done',
      id,
      op,
      ms,
      activeMs: ms - waitedMs,
      waitedMs,
      asks,
      errors: doc?.stats.errors.length ?? 0,
      result,
    });
  } catch (err) {
    postMessage({ type: 'done', id, op, error: String(err?.stack ?? err).slice(0, 800) });
  }
};
