// Node harness: a vm context stands in for the worker global scope.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadSheet, recordingHost } from '../src/sheet.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA = path.join(here, '..', 'data');

export const readJson = (name) => JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));

// Scripts from the upstream repo checkout (UPSTREAM env var) or from the PDF's own copy.
export function scriptsFrom(source, blank) {
  if (source === 'pdf') return blank.docJs.map((s) => ({ name: s.name, code: s.code }));
  const out = [];
  for (const dir of ['_functions', '_variables']) {
    for (const f of fs.readdirSync(path.join(source, dir))) {
      out.push({ name: f.replace(/\.js$/, ''), code: fs.readFileSync(path.join(source, dir, f), 'utf8') });
    }
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : 1));
}

export function boot({ char, scripts = 'pdf', answers, hostOverride } = {}) {
  const blank = readJson('blank.json');
  const defs = char ? { ...readJson(char), templates: blank.templates } : blank;
  const ctx = vm.createContext({});
  const g = vm.runInContext('this', ctx);
  const host = hostOverride ?? recordingHost(answers);
  const evalGlobal = (code, filename = 'eval') => vm.runInContext(code, ctx, { filename });
  const t0 = performance.now();
  const res = loadSheet({ scripts: scriptsFrom(scripts, blank), defs, host, evalGlobal, g });
  return { ...res, g, host, evalGlobal, ms: performance.now() - t0, blank };
}
