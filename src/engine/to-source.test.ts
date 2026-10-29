/* eslint-disable ts-patterns/no-magic-numbers -- values are the test data */
import { describe, expect, test } from 'vitest';
import { vmRealm } from '../../test/vm-realm.ts';
import { installToSource, quote, sourceOf } from './to-source.ts';
import type { RealmConstructors } from './to-source.ts';

describe('sourceOf', () => {
  test('writes objects the way MPMB stored them in Acrobat', () => {
    // From a sheet saved in Acrobat: CurrentStats.Stringified.
    const stats = {
      cols: [{ type: 'ongoing', name: 'Items up to Max X\xB9', scores: [0, 0], notUserEditable: true }],
      applied: true,
    };
    expect(sourceOf(stats)).toBe(
      '{cols:[{type:"ongoing", name:"Items up to Max X\\xB9", scores:[0, 0], notUserEditable:true}], applied:true}',
    );
  });

  test('quotes property names that are not identifiers with single quotes', () => {
    expect(sourceOf({ 'staff of the magi': 1, a_1: 2 })).toBe("{'staff of the magi':1, a_1:2}");
  });

  test('values of every kind', () => {
    expect(sourceOf([1, 'a', null, undefined, true, -0])).toBe('[1, "a", null, undefined, true, -0]');
    // A regExpSearch like MPMB's: matches "Staff of the Magi", rejects "Wand of Magic Missiles".
    // Try it: https://regex101.com/?regex=%5E(%3F%3D.*staff).*%24&flags=i&testString=Staff%20of%20the%20Magi
    expect(sourceOf(/^(?=.*staff).*$/i)).toBe('/^(?=.*staff).*$/i');
    expect(sourceOf(new Date(0))).toBe('(new Date(0))');
  });

  test('escapes like SpiderMonkey', () => {
    expect(quote('a\n"b"•', '"')).toBe('"a\\n\\"b\\"\\u2022"');
    expect(quote("it's", "'")).toBe("'it\\'s'");
  });
});

describe('installToSource', () => {
  test('adds toSource to the realm, and eval reads it back', () => {
    const realm = vmRealm();
    installToSource(
      realm.evaluate('({Object, Array, Function, Date, RegExp, String, Number, Boolean})') as RealmConstructors,
    );
    expect(realm.evaluate('({a: [1, "x"], "b c": {d: 2}}).toSource()')).toBe('({a:[1, "x"], \'b c\':{d:2}})');
    expect(realm.evaluate('[1, 2].toSource()')).toBe('[1, 2]');
    // Strings as plain literals, so that reading them back gives a string again.
    expect(realm.evaluate('"x".toSource()')).toBe('"x"');
    // MPMB reads its stored objects back with eval; this is MPMB's own code path, in the test realm.
    expect(realm.evaluate('eval(({a: 1}).toSource()).a')).toBe(1);
    // Not enumerable, so for-in loops over MPMB's objects don't see it.
    expect(realm.evaluate('var n = 0; for (var k in {a: 1}) n++; n')).toBe(1);
  });
});
