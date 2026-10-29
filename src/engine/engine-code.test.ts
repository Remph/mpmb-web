// Rules for the engine's own code that come from sharing a global scope with MPMB's scripts.
import fs from 'node:fs';
import { expect, test } from 'vitest';

const ENGINE_DIRS = ['src/engine', 'src/pdf', 'src/worker'];

const sources = (): [string, string][] =>
  ENGINE_DIRS.flatMap((dir) =>
    fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .map((file): [string, string] => [`${dir}/${file}`, fs.readFileSync(`${dir}/${file}`, 'utf8')]),
  );

test('no Array.prototype.find: MPMB replaces it in the worker, where the engine runs too', () => {
  // A call of a method named find: matches "list.find((x) =>", not "findIndex(" or "a comment on find".
  // Try it: https://regex101.com/?regex=%5C.find%5Cs*%5C(&testString=list.find((x)%20%3D%3E%20x)
  const findCall = /\.find\s*\(/;
  const offenders = sources()
    .filter(([, code]) => findCall.test(code))
    .map(([file]) => file);
  expect(offenders).toEqual([]);
});
