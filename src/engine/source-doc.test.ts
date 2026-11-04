// The link between two realms that MPMB's import reads the old sheet through: what crosses as a copy,
// what stays behind as a reference, and that the importing realm's code can't tell the difference.
import { describe, expect, test } from 'vitest';
import { vmRealm } from '../../test/vm-realm.ts';
import { realmTools } from './realm.ts';
import { serveDocument, sourceDocument } from './source-doc.ts';
import type { SourceLink, SourceRequest } from './source-doc.ts';

/** Two realms: the old document's (with a few globals like MPMB's) and the importing one's. */
function linked(sourceCode: string): { run: (code: string) => unknown; requests: SourceRequest[] } {
  const source = vmRealm();
  source.evaluate(sourceCode);
  const serve = serveDocument(source.global);
  const requests: SourceRequest[] = [];
  // Through JSON both ways, as between two workers.
  const link: SourceLink = (request) => {
    requests.push(request);
    return JSON.parse(
      JSON.stringify(serve(JSON.parse(JSON.stringify(request)) as SourceRequest)),
    ) as ReturnType<SourceLink>;
  };
  const importing = vmRealm();
  importing.global.docFrom = sourceDocument(realmTools(importing), link);
  return { run: (code) => importing.evaluate(code), requests };
}

/** The old sheet's hit points, a number the tests read back. */
const HP_MAX = 42;
/** The bump calls below add 2 and 3; then the test writes 7. */
const BUMPED = 2 + 3;
const WRITTEN = 7;
/** Entries in a big list: still one request. */
const BIG = 1000;

const OLD_SHEET = `
  var CurrentVars = { manual: { attacks: true }, weight: ['cCoi', 'cP2L'] };
  var fields = { 'HP Max': { value: ${HP_MAX}, getArray: function () { return [this]; } } };
  function What(name) { return fields[name].value; }
  function getField(name) { return fields[name]; }
  var counter = 0;
  function bump(by) { counter += by; return counter; }
  var info = {};
  Object.defineProperty(info, 'title', { get: function () { return 'MPMB sheet'; } });
`;

describe('the old document seen from the importing realm', () => {
  test('plain data arrives as a copy made in the importing realm', () => {
    const { run } = linked(OLD_SHEET);
    expect(run('docFrom.CurrentVars.weight.join("+")')).toBe('cCoi+cP2L');
    // Made by the importing realm's Array, so MPMB's methods on its prototypes apply to it.
    expect(run('docFrom.CurrentVars.weight instanceof Array')).toBe(true);
    expect(run('docFrom.CurrentVars.manual.attacks')).toBe(true);
    expect(run('docFrom.missing === undefined')).toBe(true);
  });

  test("functions run in the old document's realm, with its globals", () => {
    const { run } = linked(OLD_SHEET);
    expect(run('docFrom.What("HP Max")')).toBe(HP_MAX);
    expect(run('docFrom.bump(2); docFrom.bump(3)')).toBe(BUMPED);
    expect(run('docFrom.counter')).toBe(BUMPED);
  });

  test('objects with methods stay references, and `this` reaches the right object', () => {
    const { run } = linked(OLD_SHEET);
    expect(run('typeof docFrom.getField("HP Max").getArray')).toBe('function');
    expect(run('docFrom.getField("HP Max").getArray()[0].value')).toBe(HP_MAX);
    expect(run('docFrom.getField("HP Max") === docFrom.getField("HP Max")')).toBe(true);
  });

  test('getters are read on the source side (info.title)', () => {
    const { run } = linked(OLD_SHEET);
    expect(run('docFrom.info.title')).toBe('MPMB sheet');
  });

  test('writing, deleting, `in` and for...in reach the old document', () => {
    const { run } = linked(OLD_SHEET);
    run(`docFrom.dirty = false; docFrom.counter = ${WRITTEN}`);
    expect(run('docFrom.counter')).toBe(WRITTEN);
    expect(run('"bump" in docFrom && !("nothing" in docFrom)')).toBe(true);
    expect(run('var k = []; for (var key in docFrom.getField("HP Max")) k.push(key); k.join()')).toBe('value,getArray');
    expect(run('docFrom.extra = 1; delete docFrom.extra; docFrom.extra')).toBeUndefined();
    // A `var` can't be deleted, in Acrobat neither: false, no error.
    expect(run('delete docFrom.counter')).toBe(false);
  });

  test("an error on the source side throws in the importing realm, as the importing realm's Error", () => {
    const { run } = linked(OLD_SHEET);
    expect(
      run('try { docFrom.What("nothing") } catch (e) { e instanceof Error && e.message.indexOf("undefined") >= 0 }'),
    ).toBe(true);
  });

  test('a function can not be handed over', () => {
    const { run } = linked(OLD_SHEET);
    expect(run('try { docFrom.bump(function () {}); "passed" } catch (e) { e.message }')).toMatch(/function/);
  });

  test('a value is asked for once per read; big data costs no more requests', () => {
    const { run, requests } = linked(`${OLD_SHEET} var Big = []; for (var i = 0; i < ${BIG}; i++) Big.push({ i: i });`);
    expect(run('docFrom.Big.length')).toBe(BIG);
    expect(requests).toEqual([{ op: 'get', ref: 0, key: 'Big' }]);
  });
});
