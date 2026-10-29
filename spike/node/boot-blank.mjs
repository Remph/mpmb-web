import { boot } from './context.mjs';
const r = boot({ scripts: process.argv[2] ?? 'pdf' });
console.log('total ms', Math.round(r.ms));
console.log(r.timings.map((t) => t.join('=')).join(' '));
console.log('errors', r.doc.stats.errors.length);
for (const e of r.doc.stats.errors.slice(0, 8))
  console.log(e.where, '\n', e.message.split('\n').slice(0, 4).join('\n'));
console.log('missing', JSON.stringify(r.doc.stats.missing));
console.log('host calls', JSON.stringify(r.host.calls.slice(0, 10)));
