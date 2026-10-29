// Test B: start from the blank sheet, "type" what a player enters (class and level, species,
// background, ability scores), and compare page 1 with the character Nick built in Acrobat.
import { boot, readJson } from './context.mjs';
const char = process.argv[2] ?? 'paladin.json';
const inputs = {
  'paladin.json': [
    ['Unit System', 'metric'],
    ['Attack.1.Weapon Selection', '+2 Halberd'],
    ['Class and Levels', 'Paladin (Oath of Devotion) 8, Warlock (Fiend Patron) 2'],
    ['Race', 'Silver Dragonborn'],
    ['Background', 'Acolyte'],
    ['Str', '14'],
    ['Dex', '9'],
    ['Con', '16'],
    ['Int', '19'],
    ['Wis', '10'],
    ['Cha', '18'],
    ['Extra.Magic Item 1', 'Adamantine Plate Armor'],
    ['Extra.Magic Item 2', '+2 Halberd'],
    ['Extra.Magic Item 3', 'Headband of Intellect'],
    ['Extra.Magic Item 4', 'Stone of Good Luck'],
    ['AC Armor Description', 'Adamantine Plate'],
    // plain text the player types
    ['PC Name', 'Test Paladin / Warlock'],
    ['Player Name', 'Remph'],
    ['Alignment', 'Lawful Good'],
    ['Sex', 'Male'],
    ['Age', '28'],
    ['Hair colour', 'None'],
    ['Eyes colour', 'Blue'],
    ['Skin colour', 'Silver'],
    ['Faith/Deity', 'Thassa'],
    ['Height', '180cm'],
    ['Weight', '250kg'],
  ],
}[char];
const r = boot({ scripts: process.env.UPSTREAM ?? 'pdf' });
const d = r.doc;
const want = readJson(char).fields;
const t0 = performance.now();
const times = [];
for (const [name, value] of inputs) {
  const t = performance.now();
  d.userCommit(name, value);
  d.runTimers();
  times.push([name, Math.round(performance.now() - t)]);
}
console.log('inputs (ms each):', times.map((x) => x.join('=')).join('  '), 'total', Math.round(performance.now() - t0));
console.log('errors', d.stats.errors.length, 'events', d.stats.events, 'calc runs', d.stats.calcRuns);
for (const e of d.stats.errors.slice(0, 5)) console.log(e.where, '\n', e.message.split('\n').slice(0, 4).join('\n'));
console.log('host calls', JSON.stringify(r.host.calls.map((c) => c.name ?? c.msg?.slice(0, 80))));
const norm = (v) => (v === undefined || v === null ? '' : String(v));
let same = 0,
  diff = [];
for (const [name, def] of Object.entries(want)) {
  if (def.pg?.[0] !== 0 || (def.type === 'Btn' && def.btn === 'push')) continue; // page 1 only
  const exp = norm(def.v ?? (def.type === 'Btn' ? 'Off' : ''));
  const f = d.fields.get(name);
  const got = f ? String(f.$.value) : '';
  const empty = (x) => x === '' || x === 'Off';
  if (exp === got || (empty(exp) && empty(got))) same++;
  else diff.push([name, exp, got]);
}
console.log('page 1: same', same, 'different', diff.length);
for (const [n, e, g] of diff.slice(0, 200))
  console.log(
    ' ',
    JSON.stringify(n),
    'acrobat:',
    JSON.stringify(e.slice(0, 60)),
    'ours:',
    JSON.stringify(g.slice(0, 60)),
  );
