// M1 spike (throwaway): page side. Starts the worker, plays the user for pop-ups, and times things.
const round = (x) => Math.round(x * 10) / 10;
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

export function startWorker({ useSab = true, userDelayMs = 15 } = {}) {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  const sabOk = useSab && typeof SharedArrayBuffer !== 'undefined';
  const sab = sabOk ? new SharedArrayBuffer(1 << 20) : null;
  const ctrl = sab && new Int32Array(sab, 0, 2);
  const bytes = sab && new Uint8Array(sab, 8);
  const asked = [];
  const pending = new Map();
  let nextId = 1;

  // What a person would do with each pop-up
  function answerFor(msg) {
    if (msg.kind === 'dialog' && msg.name === 'SUBCLASS SELECTION DIALOG') {
      return { type: 'close', result: 'ok', state: { Su00: true } }; // picks the first subclass
    }
    if (msg.kind === 'dialog' || msg.kind === 'dialog-update') return { type: 'close', result: 'ok', state: {} };
    return { answer: 1 };
  }

  function reply(obj) {
    const data = new TextEncoder().encode(JSON.stringify(obj));
    bytes.set(data);
    Atomics.store(ctrl, 1, data.length);
    Atomics.store(ctrl, 0, 1);
    Atomics.notify(ctrl, 0);
  }

  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'ask') {
      asked.push({ kind: m.msg.kind, name: m.msg.name });
      if (m.blocking) {
        if (m.msg.kind === 'ping') reply({ answer: 1 });
        else setTimeout(() => reply(answerFor(m.msg)), userDelayMs);
      }
    } else if (m.type === 'done') {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(m.error)) : p.resolve(m);
    }
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error('worker error: ' + e.message));
  };

  const call = (op, args) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, op, args });
    });
  return { worker, call, asked, sab, sabOk };
}

const base = new URL('../', import.meta.url).href;

// Blank sheet: boot, class and level changes with pop-ups answered through Atomics.wait
export async function runBlank({ scripts = 'pdf', useSab = true } = {}) {
  const w = startWorker({ useSab });
  const out = { scripts, useSab, sabAvailable: w.sabOk, crossOriginIsolated: self.crossOriginIsolated };
  const boot = await w.call('boot', { base, scripts, sab: w.sab });
  out.boot = {
    wallMs: round(boot.ms),
    fetchMs: round(boot.result.fetchMs),
    scriptsAndInitMs: round(boot.result.loadMs),
    errors: boot.result.errors,
    fields: boot.result.fields,
  };
  out.slowScripts = Object.fromEntries(boot.result.timings.filter((t) => t[1] >= 5));

  const first = await w.call('userCommit', { name: 'Class and Levels', value: 'Paladin 8, Warlock 2' });
  await w.call('runTimers');
  out.firstClassChange = {
    wallMs: round(first.ms),
    activeMs: round(first.activeMs),
    waitedMs: round(first.waitedMs),
    popups: first.asks,
    errors: first.errors,
  };
  out.errorsAfterFirst = (await w.call('errors')).result;
  out.classField = (await w.call('value', { name: 'Class and Levels' })).result.value;
  out.subclass = (
    await w.call('eval', {
      code: 'JSON.stringify(Object.keys(classes.known).map(function (k) { return [k, classes.known[k].level, classes.known[k].subclass]; }))',
    })
  ).result.value;
  out.characterLevel = (await w.call('value', { name: 'Character Level' })).result.value;
  out.profBonus = (await w.call('value', { name: 'Proficiency Bonus' })).result.value;

  // Level up and down a few times; the field text now names the subclasses, so no dialog
  const lv = [];
  for (let i = 0; i < 6; i++) {
    const text = `Paladin (Oath of Devotion) ${8 + (i % 2)}, Warlock (Fiend Patron) 2`;
    const r = await w.call('userCommit', { name: 'Class and Levels', value: text });
    await w.call('runTimers');
    lv.push({ active: r.activeMs, wall: r.ms, popups: r.asks });
  }
  out.levelChange = {
    activeMs: lv.map((x) => round(x.active)),
    medianActiveMs: round(median(lv.map((x) => x.active))),
    popups: lv.map((x) => x.popups),
  };

  if (w.sabOk) {
    const p = await w.call('pings', { n: 500 });
    out.blockingRoundTripMs = round(p.result.perTripMs * 1000) / 1000;
  }
  out.askedByWorker = w.asked.filter((a) => a.kind !== 'ping').map((a) => a.name ?? a.kind);
  w.worker.terminate();
  return out;
}

// Open a filled reference PDF's values and compare every field with what Acrobat saved
export async function runOpen({ char = 'paladin.json', scripts = 'pdf' } = {}) {
  const w = startWorker({ useSab: true });
  const boot = await w.call('boot', { base, scripts, char, sab: w.sab });
  await w.call('calculateNow');
  const want = (await (await fetch(base + 'data/' + char)).json()).fields;
  const got = (await w.call('values')).result.values;
  let compared = 0;
  const bad = [];
  for (const [name, def] of Object.entries(want)) {
    if (def.type === 'Btn' && def.btn === 'push') continue;
    compared++;
    const exp = def.v ?? (def.type === 'Btn' ? 'Off' : '');
    const g = got[name] ?? '';
    const empty = (x) => x === '' || x === 'Off';
    if (exp !== g && !(empty(exp) && empty(g))) bad.push([name, exp, g]);
  }
  w.worker.terminate();
  return {
    char,
    scripts,
    bootMs: round(boot.ms),
    errors: boot.result.errors,
    compared,
    different: bad.length,
    sample: bad.slice(0, 5),
  };
}

// The real import path: read the filled PDF in the page (pdf-lib), hand its fields to the worker,
// run the scripts, recalculate, and compare with what the Python extraction says Acrobat saved
export async function runImport({ pdf = 'paladin8-warlock2.pdf', char = 'paladin.json', scripts = 'pdf' } = {}) {
  const { readFilledPdf } = await import('./dist/pdf-read.js');
  const bytes = new Uint8Array(await (await fetch(base + 'data/' + pdf)).arrayBuffer());
  const t0 = performance.now();
  const imported = await readFilledPdf(bytes);
  const readMs = performance.now() - t0;
  const w = startWorker({ useSab: true });
  const boot = await w.call('boot', { base, scripts, sab: w.sab, imported });
  await w.call('calculateNow');
  const want = (await (await fetch(base + 'data/' + char)).json()).fields;
  const got = (await w.call('values')).result.values;
  let compared = 0;
  const bad = [];
  for (const [name, def] of Object.entries(want)) {
    if (def.type === 'Btn' && def.btn === 'push') continue;
    compared++;
    const exp = def.v ?? (def.type === 'Btn' ? 'Off' : '');
    const g = got[name] ?? '';
    const empty = (x) => x === '' || x === 'Off';
    if (exp !== g && !(empty(exp) && empty(g))) bad.push([name, exp.slice(0, 40), g.slice(0, 40)]);
  }
  const userScript = imported.fields['User Script'];
  w.worker.terminate();
  return {
    pdf,
    bytes: bytes.length,
    readMs: round(readMs),
    fieldsRead: Object.keys(imported.fields).length,
    bootMs: round(boot.ms),
    errors: boot.result.errors,
    compared,
    different: bad.length,
    sample: bad.slice(0, 5),
    userScriptField: userScript ? { exists: true, empty: !userScript.v } : { exists: false },
    sheetVersion: imported.info.SheetVersion,
  };
}

window.runImport = runImport;
window.runBlank = runBlank;
window.runOpen = runOpen;
document.getElementById('out').textContent = 'ready';
