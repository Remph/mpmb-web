// Test A: open a filled reference PDF (its values loaded, scripts run), recalculate, and compare
// every field value with what Acrobat saved in the PDF.
import { boot, readJson } from './context.mjs';
const char = process.argv[2] ?? 'paladin.json';
const r = boot({ char, scripts: process.env.UPSTREAM ?? 'pdf' });
const want = readJson(char).fields;
const d = r.doc;
const snap = () => {
  const out = {};
  for (const [n, f] of d.fields) out[n] = String(f.$.value);
  return out;
};
const initial = snap();
d.runTimers();
d.calculateNow();
const after = snap();
// Stronger check: blank every calculated field, then recalculate and see what comes back
const wiped = process.argv.includes('--wipe');
if (wiped) {
  let n = 0;
  for (const name of readJson(char).calcOrder) {
    const f = d.fields.get(name);
    if (f && f.$.def.acts.C) {
      f.$.value = '';
      n++;
    }
  }
  console.log('wiped', n, 'calculated fields');
  d.calculateNow();
  d.calculateNow();
  Object.assign(after, snap());
}
const norm = (v) => (v === undefined || v === null ? '' : String(v));
function diff(got, label) {
  const bad = [];
  let n = 0;
  for (const [name, def] of Object.entries(want)) {
    if (def.type === 'Btn' && def.btn === 'push') continue;
    n++;
    const exp = norm(def.v ?? (def.type === 'Btn' ? 'Off' : ''));
    const g = got[name];
    if ((exp === '' || exp === 'Off') && (g === '' || g === 'Off' || g === undefined)) continue;
    if (exp !== g) bad.push([name, exp, g, def.pg?.[0]]);
  }
  console.log(label, 'compared', n, 'different', bad.length);
  return bad;
}
console.log('load ms', Math.round(r.ms), 'errors', d.stats.errors.length);
const bad0 = diff(initial, 'after open       ');
const bad1 = diff(after, 'after recalc     ');
const byPage = {};
for (const b of bad1) byPage[b[3]] = (byPage[b[3]] ?? 0) + 1;
console.log('different by page (after recalc)', JSON.stringify(byPage));
const show = (arr, k = 25) => {
  for (const [n, e, g] of arr.slice(0, k))
    console.log(
      ' ',
      JSON.stringify(n),
      'acrobat:',
      JSON.stringify(e.slice(0, 70)),
      'ours:',
      JSON.stringify(String(g).slice(0, 70)),
    );
};
show(bad1, 40);
for (const e of d.stats.errors.slice(0, 5)) console.log(e.where, '\n', e.message.split('\n').slice(0, 4).join('\n'));
console.log('host calls', JSON.stringify(r.host.calls, null, 1).slice(0, 3000));
console.log('missing', JSON.stringify(d.stats.missing));
