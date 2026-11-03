import { describe, expect, it } from 'vitest';
import { vmRealm } from '../../test/vm-realm.ts';
import { installAcrobatReplace } from './acrobat-replace.ts';
import type { ReplaceRealm } from './acrobat-replace.ts';

describe("Acrobat's String.prototype.replace", () => {
  // MPMB's removeSpellUpcasting: one global RegExp tested and replaced on several texts in a row.
  const script = `(function () {
    var re = /\\+\\d+d?\\d*\\/(\\d*SL|PP)\\b/ig;
    var texts = ["5ft dia sphere; 20ft bright; crea hit/end in 5ft 2d6+1d6/SL Fire dmg", "1,5m dia sphere; crea in 1,5m 2d6+1d6/SL Fire dmg"];
    return texts.map(function (t) { return re.test(t) ? t.replace(re, "") : t; }).join(" | ");
  })()`;

  it("keeps a global RegExp's lastIndex, so the second text is searched from there, as in Acrobat", () => {
    const realm = vmRealm();
    installAcrobatReplace(realm.global as unknown as ReplaceRealm);
    expect(realm.evaluate(script, 'test')).toBe(
      '5ft dia sphere; 20ft bright; crea hit/end in 5ft 2d6 Fire dmg | 1,5m dia sphere; crea in 1,5m 2d6+1d6/SL Fire dmg',
    );
    expect(realm.evaluate('"a-b-c".replace(/-/g, "+") + " " + "a-b".replace("-", "+")', 'test')).toBe('a+b+c a+b');
  });

  it('is what today’s engines do differently', () => {
    const realm = vmRealm();
    expect(String(realm.evaluate(script, 'test'))).not.toContain('+1d6/SL');
  });
});
