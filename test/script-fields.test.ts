// MPMB's scripts against the blank sheet that ships with the app: every field name they spell out must
// exist, apart from the known ones below. After an upstream update, a new name here means the scripts
// were written for a newer PDF than the sheet data (see vendor/README.md, "Updating").
import { describe, expect, test } from 'vitest';
import { mpmbScripts } from '../src/engine/scripts.ts';
import { blankSheet } from '../src/engine/sheet.ts';
import { scriptFieldNames, unknownFields } from '../tools/script-fields.ts';

/** Names the Colorful A4 sheet doesn't have, and why the scripts may still use them. */
const KNOWN_MISSING: Record<string, string> = {
  // Only on the Printer Friendly sheet; the scripts check the sheet type (typePF) first.
  'Image.calc_lines.CSfront': 'Printer Friendly',
  'Image.DnDLogo.AL': 'Printer Friendly',
  'Text.HoS.Ability': 'Printer Friendly',
  'Text.HoS.Save': 'Printer Friendly',
  'Image.calc_lines.HoS': 'Printer Friendly',
  'Image.calc_boxes.HoS': 'Printer Friendly',
  BoxesLinesRemember: 'Printer Friendly',
  'Stealth Disadv': 'Printer Friendly',
  'Whiteout.Standard.0': 'older sheets (read once, when CurrentVars has no whiteout setting)',
  'P0.ALlog.CopyrightInformation': 'a spawned logsheet page that this sheet only has after spawning',
  // Fields of older sheet versions that "Import from another sheet" reads from the old PDF.
  'MakeMobileReady Remember': 'older sheets (import)',
  WhiteoutRemember: 'older sheets (import)',
  'FontSize Remember': 'older sheets (import)',
  'Extra.Layers Remember': 'older sheets (import)',
  'Manual Attack Remember': 'older sheets (import)',
  'Manual Background Remember': 'older sheets (import)',
  'Manual Class Remember': 'older sheets (import)',
  'Manual Feat Remember': 'older sheets (import)',
  'Manual Race Remember': 'older sheets (import)',
  'Class Features Remember': 'older sheets (import)',
  Portrait_Blank: 'older sheets (import)',
  'Notes Left': 'older sheets (import)',
  tempIconImports: 'a field the import makes and removes again',
};

describe('field names in the scripts', () => {
  const names = scriptFieldNames(mpmbScripts);

  test('the check finds the names (about 200, used in most scripts)', () => {
    const MANY = 150;
    expect(names.size).toBeGreaterThan(MANY);
    expect(names.get('Proficiency Bonus')).toContain('Functions1');
  });

  test('every one is a field of the blank sheet, or a known exception', () => {
    const missing = unknownFields(mpmbScripts, Object.keys(blankSheet().fields));
    const unexplained = [...missing].filter(([field]) => !(field in KNOWN_MISSING));
    expect(unexplained.map(([field, users]) => `${field} (${users.join(', ')})`)).toEqual([]);
  });

  test('the known exceptions are still used, so the list stays short', () => {
    expect(Object.keys(KNOWN_MISSING).filter((field) => !names.has(field))).toEqual([]);
  });

  test('a group name counts: getField("Limited Feature") reaches "Limited Feature.*"', () => {
    const script = { name: 'Test', code: 'What("A.B"); getField("A"); Value("C", 1); Hide("D")' };
    expect([...unknownFields([script], ['A.B.C', 'C']).keys()]).toEqual(['D']);
  });

  test("single quotes count too, a name built at run time doesn't", () => {
    const code = `How('Wis Mod'); getField('" + event.target.name + ".1'); What("Text." + x)`;
    expect([...scriptFieldNames([{ name: 'Test', code }]).keys()]).toEqual(['Wis Mod']);
  });
});
