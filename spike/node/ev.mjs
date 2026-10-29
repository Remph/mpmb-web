// Evaluate expressions inside the loaded sheet: node ev.mjs <char.json|-> "expr" ["expr"...]
import { boot } from './context.mjs';
const char = process.argv[2] === '-' ? undefined : process.argv[2];
const r = boot({ char });
for (const e of process.argv.slice(3)) {
  try {
    const v = r.evalGlobal(e);
    console.log(e, '=>', typeof v === 'object' ? JSON.stringify(v)?.slice(0, 1500) : v);
  } catch (err) {
    console.log(e, 'THROWS', String(err).slice(0, 300));
  }
}
