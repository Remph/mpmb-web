// M1 spike: bundle the upstream repo's 27 scripts into one JSON file for the browser run.
// Usage: node build-upstream-json.mjs <upstream checkout> <out.json>
import fs from 'node:fs';
import path from 'node:path';

const [src, out] = process.argv.slice(2);
const scripts = [];
for (const dir of ['_functions', '_variables']) {
  for (const f of fs.readdirSync(path.join(src, dir))) {
    scripts.push({ name: f.replace(/\.js$/, ''), code: fs.readFileSync(path.join(src, dir, f), 'utf8') });
  }
}
// Acrobat runs document scripts in name order
scripts.sort((a, b) => (a.name < b.name ? -1 : 1));
fs.writeFileSync(out, JSON.stringify(scripts));
console.log(scripts.length, 'scripts,', Math.round(fs.statSync(out).size / 1024), 'KB');
