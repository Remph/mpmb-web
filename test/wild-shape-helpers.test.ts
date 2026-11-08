// The Wild Shape helpers the play view uses: pure logic, no sheet (the engine side is test/wild-shape.test.ts).
import { describe, expect, test } from 'vitest';
import type { LimitedFeature } from '../src/play/read.ts';
import { copyHomebrew } from '../src/store/characters.ts';
import {
  changeSteps,
  challengeValue,
  currentForm,
  formLimits,
  readInForm,
  wildShapeUses,
  withinLimits,
} from '../src/play/wild-shapes.ts';
import type { Beast, WildShapeForm } from '../src/play/wild-shapes.ts';

const rules = (limitations: string, knownForms = '') => ({ limitations, knownForms, duration: '', tempHp: '' });
const beast = (name: string, challenge: string, speed = '12 m'): Beast => ({
  key: name.toLowerCase(),
  name,
  challenge,
  challengeValue: challengeValue(challenge),
  speed,
  group: '',
});

describe('challenge ratings and limits', () => {
  test('a challenge rating as a number', () => {
    expect(challengeValue('1/4')).toBe(0.25);
    expect(challengeValue(' 1 / 8 ')).toBe(0.125);
    expect(challengeValue('2')).toBe(2);
    expect(challengeValue('')).toBeNaN();
    expect(challengeValue('one')).toBeNaN();
  });

  test("MPMB's limits line, 2014 and 2024 wording", () => {
    expect(formLimits(rules('max CR 1/4, no Fly Speed', '4 Beast'))).toEqual({
      maxChallenge: 0.25,
      noFly: true,
      known: 4,
    });
    expect(formLimits(rules('CR 1 or lower', '8 Beast'))).toEqual({ maxChallenge: 1, noFly: false, known: 8 });
    expect(formLimits(rules(''))).toEqual({ maxChallenge: null, noFly: false, known: null });
    expect(formLimits(null)).toEqual({ maxChallenge: null, noFly: false, known: null });
  });

  test('beasts within the limits', () => {
    const young = formLimits(rules('max CR 1/4, no Fly Speed'));
    expect(withinLimits(beast('Wolf', '1/4'), young)).toBe(true);
    expect(withinLimits(beast('Brown Bear', '1'), young)).toBe(false);
    expect(withinLimits(beast('Eagle', '0', '3 m, fly 18 m'), young)).toBe(false);
    // A beast whose rating MPMB doesn't give as a number is outside any CR limit, inside none.
    expect(withinLimits(beast('Odd', '?'), young)).toBe(false);
    expect(withinLimits(beast('Odd', '?'), formLimits(null))).toBe(true);
    expect(withinLimits(beast('Eagle', '0', '3 m, fly 18 m'), formLimits(rules('CR 1 or lower')))).toBe(true);
  });
});

describe('uses and changing into a form', () => {
  const feature = (name: string, max: number | null, used: number): LimitedFeature => ({
    row: 3,
    name,
    maxText: String(max ?? ''),
    max,
    pool: false,
    recovery: 'Short Rest',
    used,
    die: null,
    from: [],
  });

  test('the uses come from the limited feature named Wild Shape', () => {
    expect(wildShapeUses([feature('Channel Divinity', 2, 0), feature('Wild Shape', 4, 1)])).toEqual({
      row: 3,
      left: 3,
      total: 4,
    });
    expect(wildShapeUses([feature('Wild Shape', null, 0)])).toBeNull();
    expect(wildShapeUses([feature('Wild Resurgence', 1, 0)])).toBeNull();
    expect(wildShapeUses([feature('Wild Shape', 2, 5)])?.left).toBe(0);
  });

  test('one use spent, and the Temp HP only when higher than what the druid has', () => {
    const uses = { row: 3, left: 3, total: 4 };
    expect(changeSteps(uses, 1, 19, null)).toEqual([
      { edit: 'Limited Feature Used 3', text: '2' },
      { edit: 'HP Temp', text: '19' },
    ]);
    // Temporary hit points don't add up: 25 already is more than 19.
    expect(changeSteps(uses, 1, 19, 25)).toEqual([{ edit: 'Limited Feature Used 3', text: '2' }]);
    expect(changeSteps(null, 0, null, null)).toEqual([]);
  });
});

describe('the form the character is in', () => {
  test('kept next to the character, read back with care', () => {
    expect(readInForm({ key: 'P6.WSfront.1', name: 'Wolf' })).toEqual({ key: 'P6.WSfront.1', name: 'Wolf' });
    expect(readInForm({ key: 'P6.WSfront.1' })).toBeNull();
    expect(readInForm({ key: '', name: 'Wolf' })).toBeNull();
    expect(readInForm('Wolf')).toBeNull();
    expect(readInForm(null)).toBeNull();
    expect(readInForm({ key: 'k', name: 'x'.repeat(500) })?.name).toHaveLength(200);
  });

  test('the plain copy that goes into IndexedDB keeps it', () => {
    const inForm = { key: 'P6.WSfront.1', name: 'Wolf' };
    const copy = copyHomebrew({ acEdge: 'adv', wildShape: inForm });
    expect(copy.wildShape).toEqual(inForm);
    expect(copy.wildShape).not.toBe(inForm);
    // Leaving the form takes it out again.
    expect(copyHomebrew({ ...copy, wildShape: undefined })).toEqual({ acEdge: 'adv' });
  });

  test('a form replaced in its place no longer counts', () => {
    const form = (name: string, slot: number) => ({ prefix: 'P6.WSfront.', slot, name }) as WildShapeForm;
    const forms = [form('Wolf', 1), form('Brown Bear', 2)];
    expect(currentForm(forms, { key: 'P6.WSfront.2', name: 'Brown Bear' })?.name).toBe('Brown Bear');
    expect(currentForm(forms, { key: 'P6.WSfront.2', name: 'Wolf' })).toBeNull();
    expect(currentForm(forms, null)).toBeNull();
  });
});
