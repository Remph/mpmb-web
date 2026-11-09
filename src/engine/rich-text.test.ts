/* eslint-disable ts-patterns/no-magic-numbers -- font sizes and colours are the test data */
// Acrobat's /RV both ways, against what Acrobat itself saved: the blank sheet and the two SRD reference
// characters (test/characters, saved in Acrobat on metric sheets).
import { describe, expect, test } from 'vitest';
import { REFERENCE_CHARACTERS, referenceSheet } from '../../test/characters.ts';
import { blankSheet } from './sheet.ts';
import { buildRichValue, currentRichValue, parseRichValue, richValueText, sameText } from './rich-text.ts';
import type { FieldDef } from './types.ts';

/** Every field with an /RV and a text value, on the blank sheet and the reference characters. */
const withRv = (): [string, FieldDef & { richValue: string; value: string }][] =>
  [blankSheet(), ...REFERENCE_CHARACTERS.map(referenceSheet)].flatMap((sheet) =>
    Object.entries(sheet.fields).filter(
      (e): e is [string, FieldDef & { richValue: string; value: string }] =>
        typeof e[1].richValue === 'string' && typeof e[1].value === 'string',
    ),
  );

const head = (rv: string): string => rv.slice(0, rv.indexOf('<p'));

describe("reading Acrobat's /RV", () => {
  test('every /RV Acrobat saved spells its field’s value (line breaks aside)', () => {
    const fields = withRv();
    expect(fields.length).toBeGreaterThan(300);
    const wrong = fields.filter(([, def]) => !sameText(richValueText(def.richValue), def.value)).map(([n]) => n);
    expect(wrong).toEqual([]);
  });

  test('runs carry their whole style: the body’s under the span’s', () => {
    const kg = referenceSheet('paladin8-warlock2').fields['Display.Weighttxt.LbKg']?.richValue ?? '';
    expect(parseRichValue(kg)).toEqual([
      {
        text: 'K',
        textSize: 7,
        alignment: 'center',
        textColor: ['RGB', 0, 0, 0],
        fontWeight: 300,
        fontStyle: 'normal',
        fontFamily: ['Footlight MT Light', 'serif'],
        fontStretch: 'normal',
      },
      expect.objectContaining({ text: 'G', textSize: 4.9, fontFamily: ['Footlight MT Light', 'serif'] }),
    ]);
  });

  test('character references, paragraphs and line breaks', () => {
    const rv =
      '<?xml version="1.0"?><body style="font-size:9.0pt"><p>a &amp; b&#13;&#9670;</p><p dir="ltr">c<br/>d</p></body>';
    expect(richValueText(rv)).toBe('a & b\r◆\rc\rd');
  });

  test('a character reference past Unicode stays as written instead of stopping the snapshot', () => {
    expect(richValueText('<body><p>a&#99999999;b&#x110000;</p></body>')).toBe('a&#99999999;b&#x110000;');
  });
});

describe('writing it', () => {
  test('MPMB’s small caps for "Kg" come out as Acrobat saved them', () => {
    const sheet = referenceSheet('paladin8-warlock2');
    const blank = blankSheet().fields['Display.Weighttxt.LbKg']?.richValue;
    // createSmallCaps("Kg", 7, { alignment: "center" }) in MPMB's SetRichTextFields.
    const spans = [
      { text: 'K', textSize: 7, alignment: 'center' },
      { text: 'G', textSize: 4.9, alignment: 'center' },
    ];
    expect(buildRichValue(spans, blank)).toBe(sheet.fields['Display.Weighttxt.LbKg']?.richValue);
  });

  test('the speed label a calculation sets, in metric', () => {
    const sheet = referenceSheet('paladin8-warlock2');
    const blank = blankSheet().fields['Display.Speed.Enc']?.richValue;
    const spans = [
      { text: '3', textSize: 6 },
      { text: ' M', textSize: 4.2 },
      { text: ' S', textSize: 6 },
      { text: 'PEED', textSize: 4.2 },
    ];
    expect(buildRichValue(spans, blank)).toBe(sheet.fields['Display.Speed.Enc']?.richValue);
  });

  test('a colour, a font of its own and text outside ASCII', () => {
    const base =
      '<?xml version="1.0"?><body style="font-size:8.0pt;color:#000000;font-family:Pterra,serif"><p>x</p></body>';
    const rv = buildRichValue(
      [
        { text: 'A', textColor: ['RGB', 100 / 255, 36 / 255, 129 / 255] },
        { text: 'RMOR◆', textSize: 5.6, fontFamily: ['Segoe Print'] },
        { text: '\r' },
      ],
      base,
    );
    expect(rv).toBe(
      `${head(base)}<p><span style="color:#642481">A</span><span style="font-size:5.6pt;font-family:'Segoe Print'">RMOR&#9670;</span>&#13;</p></body>`,
    );
  });

  test('every /RV Acrobat saved reads back as the same runs (round trip)', () => {
    const changed = withRv()
      .filter(([, def]) => currentRichValue(def.richValue, def.value, parseRichValue(def.richValue)) !== def.richValue)
      .map(([n]) => n);
    expect(changed).toEqual([]);
  });

  test('the labels Acrobat saved are written byte for byte the same from their runs', () => {
    // The MPMB labels: matches "Display.Weighttxt.LbKg", "P6.SSfront.spells.name.0", not "Class Features".
    // Try it: https://regex101.com/?regex=Weighttxt%7CDisplay%5C.Speed%7Cspells%5C.(name%7Ccheck%7Csave)%7Cspellsdiv&testString=P6.SSfront.spells.name.0
    const labels = withRv().filter(([n]) => /Weighttxt|Display\.Speed|spells\.(name|check|save)|spellsdiv/.test(n));
    expect(labels.length).toBeGreaterThan(20);
    const differ = labels
      .filter(([, def]) => buildRichValue(parseRichValue(def.richValue), def.richValue) !== def.richValue)
      .map(([n]) => n);
    expect(differ).toEqual([]);
  });
});

describe('the /RV a field should carry', () => {
  const lbs = blankSheet().fields['Display.Weighttxt.LbKg']?.richValue ?? '';
  const speed = blankSheet().fields['Display.Speed.Enc']?.richValue ?? '';

  test('one that still spells the value stays as it is', () => {
    expect(currentRichValue(lbs, 'LBS')).toBe(lbs);
  });

  test('one under a value set as plain text: the value in the style of its first run', () => {
    // A character saved before the app kept MPMB's runs: the blank's "LBS" under "KG".
    expect(currentRichValue(lbs, 'KG')).toBe(`${head(lbs)}<p>KG</p></body>`);
    expect(currentRichValue(speed, '3 M SPEED')).toBe(
      `${head(speed)}<p><span style="font-size:6.0pt">3 M SPEED</span></p></body>`,
    );
  });

  test('runs a script set win; the same runs keep the /RV as it was', () => {
    const kg = [
      { text: 'K', textSize: 7 },
      { text: 'G', textSize: 4.9 },
    ];
    expect(currentRichValue(lbs, 'KG', kg)).toBe(`${head(lbs)}<p>K<span style="font-size:4.9pt">G</span></p></body>`);
    const lbsRuns = [
      { text: 'LB', textSize: 7 },
      { text: 'S', textSize: 4.9 },
    ];
    expect(currentRichValue(lbs, 'LBS', lbsRuns)).toBe(lbs);
  });

  test('none for an empty value, or for a field that had none', () => {
    expect(currentRichValue(lbs, '')).toBeUndefined();
    expect(currentRichValue(undefined, 'SPELL', [{ text: 'S', textSize: 7 }])).toBeUndefined();
  });
});
