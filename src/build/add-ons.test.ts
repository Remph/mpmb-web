/* eslint-disable ts-patterns/no-magic-numbers -- counts are the test data */
import { describe, expect, test } from 'vitest';
import { addedOn, fileTitle, parseScriptFiles, sameScript, scriptAdds, scriptName } from './add-ons.ts';

describe('a script’s name and date', () => {
  test('the name MPMB reads from iFileName, with either quote', () => {
    expect(scriptName('var iFileName = "Sea folk.js";\nRaceList["x"] = {};')).toBe('Sea folk.js');
    expect(scriptName("var iFileName='It\\'s mine.js';")).toBe("It's mine.js");
    expect(scriptName('RaceList["x"] = {};')).toBeNull();
  });

  test('two files are versions of one script when their names match in any case', () => {
    expect(sameScript('iFileName = "Sea Folk.js"', 'iFileName = "sea folk.js"')).toBe(true);
    expect(sameScript('iFileName = "Sea Folk.js"', 'iFileName = "Sky folk.js"')).toBe(false);
    expect(sameScript('no name', 'no name')).toBe(false);
  });

  test('the day from MPMB’s name for the file, and the name without it', () => {
    expect(addedOn('2026/11/03 - Sea folk.js')).toBe('2026-11-03');
    expect(addedOn('2026/11/03 14:22 - no iFileName')).toBe('2026-11-03');
    expect(addedOn('Sea folk.js')).toBeNull();
    expect(fileTitle('2026/11/03 - Sea folk.js')).toBe('Sea folk.js');
    expect(fileTitle('odd name')).toBe('odd name');
  });
});

describe('what a script adds', () => {
  test('counts the entries it defines, each once, in bracket, dot and AddSubClass form', () => {
    const text = `
      ClassList["alchemist"] = { name: "Alchemist" };
      AddSubClass("alchemist", "mixer", {});
      AddSubClass('paladin', 'oath of zeal', {});
      RaceList["sea folk"] = {}; RaceList.skyfolk={}; RaceList["sea folk"].trait = "x";
      SpellsList["test spark"] = {};
      if (RaceList["sea folk"] == undefined) {}
      MagicItemsList["lantern"] = {};`;
    expect(scriptAdds(text)).toEqual({ classes: 1, subclasses: 2, species: 2, spells: 1, items: 1 });
  });

  test('a script that only changes things adds nothing countable', () => {
    expect(scriptAdds('ClassList.paladin.features.x.name = "y";')).toEqual({});
  });
});

describe('scripts in a saved sheet', () => {
  test('reads Acrobat’s toSource of the files, with its escapes', () => {
    const stored = `({'2026/10/29 - a.js':"var iFileName = \\"a.js\\";\\r\\nx = '\\xE9\\u00e9';", "2026/11/03 - b.js":'y'})`;
    expect(parseScriptFiles(stored)).toEqual([
      { key: '2026/10/29 - a.js', text: 'var iFileName = "a.js";\r\nx = \'éé\';' },
      { key: '2026/11/03 - b.js', text: 'y' },
    ]);
  });

  test('no files in an empty list, an empty field or anything else', () => {
    expect(parseScriptFiles('({})')).toEqual([]);
    expect(parseScriptFiles('')).toEqual([]);
    expect(parseScriptFiles('({a:1})')).toEqual([]);
    expect(parseScriptFiles(`({'a':"x" junk 'b':"y"})`)).toEqual([]);
  });
});
