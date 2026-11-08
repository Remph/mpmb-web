/* eslint-disable ts-patterns/no-magic-numbers -- counts and rows are the test data */
// The "Skills & languages" step's readings on MPMB's own fields of the reference characters, and what a
// tap on a skill box or an edit of a language row does there.
import { describe, expect, it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import { viewsOf } from '../worker/views.ts';
import {
  freeLangToolRow,
  hasProficiencies,
  openSkillPicks,
  readLangTools,
  readSaveProficiencies,
  moreProficiencies,
  readProficiencies,
  readSkillSources,
  skillChoices,
  skillText,
} from './proficiencies.ts';
import type { SkillSource } from './proficiencies.ts';
import { ui } from '../i18n.ts';
import { SKILLS } from '../play/read.ts';

describe("skill texts in the player's language", () => {
  const source = (text: string, choose: number, skills: SkillSource['skills']): SkillSource => ({
    source: 'Paladin',
    text,
    choose,
    skills,
  });
  const paladin = source('Choose 2: Athletics, Insight, Intimidation, Medicine, Persuasion, or Religion.', 2, [
    'Ath',
    'Ins',
    'Inti',
    'Med',
    'Pers',
    'Rel',
  ]);

  it("names the app's German skills, and leaves English as MPMB wrote it", () => {
    expect(skillText(paladin, ui.de)).toEqual({
      text: 'Wähle 2: Athletik, Motiv erkennen, Einschüchtern, Heilkunde, Überzeugen oder Religion',
      rest: null,
    });
    expect(skillText(source('Insight and Religion.', 0, ['Ins', 'Rel']), ui.de).text).toBe(
      'Motiv erkennen und Religion',
    );
    expect(skillText(paladin, ui.en)).toEqual({ text: paladin.text, rest: null });
  });

  it('says "any" without listing all eighteen', () => {
    const all = SKILLS.map(([key]) => key);
    expect(skillText(source('Choose any 3 skills.', 3, all), ui.de).text).toBe('Wähle 3 beliebige Fertigkeiten');
    expect(skillText(source('Choose any one skill.', 1, all), ui.de).text).toBe('Wähle eine beliebige Fertigkeit');
  });

  it("keeps MPMB's words when they say more, and MPMB's text when it names no skills", () => {
    const more = source('Choose 1: Arcana or History, if not already proficient.', 1, ['Arc', 'His']);
    expect(skillText(more, ui.de).rest).toBe(more.text);
    const expertise = source('I gain Expertise in one skill.', 0, []);
    expect(skillText(expertise, ui.de)).toEqual({ text: expertise.text, rest: null });
  });
});

describe('saving throws', () => {
  const brief = (fields: ReturnType<typeof viewsOf>) =>
    readSaveProficiencies(fields).map((s) => `${s.key} ${s.on ? 'on' : 'off'} ${s.sources.join(', ')}`.trim());

  it("reads the six boxes with the class MPMB names in each box's tooltip", () => {
    expect(brief(viewsOf(openSheet(referenceSheet('wizard10-evoker')).doc))).toEqual([
      'Str off',
      'Dex off',
      'Con off',
      'Int on Wizard',
      'Wis on Wizard',
      'Cha off',
    ]);
  });

  it('a tap ticks a save by hand or takes one off, and a level-up keeps both', () => {
    const engine = openSheet(referenceSheet('wizard10-evoker'));
    // The box has no script: a tap only changes the box, and the save's own calculation adds the
    // proficiency bonus (+4 at level 10).
    engine.click('Str ST Prof');
    engine.click('Wis ST Prof');
    let fields = viewsOf(engine.doc);
    expect(brief(fields)).toEqual(['Str on', 'Dex off', 'Con off', 'Int on Wizard', 'Wis off Wizard', 'Cha off']);
    expect([fields['Str ST Mod']?.value, fields['Wis ST Mod']?.value]).toEqual(['3', '0']);
    engine.edit('Class and Levels', 'Wizard 11');
    fields = viewsOf(engine.doc);
    expect(brief(fields)).toEqual(['Str on', 'Dex off', 'Con off', 'Int on Wizard', 'Wis off Wizard', 'Cha off']);
  });

  it("adds Honor or Sanity's box only while the sheet shows that score, and a tap ticks it", () => {
    const engine = openSheet(referenceSheet('wizard10-evoker'));
    expect(brief(viewsOf(engine.doc))).toHaveLength(6);
    engine.evaluate('ShowHonorSanity("Honor")');
    expect(brief(viewsOf(engine.doc)).at(-1)).toBe('HoS off');
    engine.click('HoS ST Prof');
    const fields = viewsOf(engine.doc);
    expect(brief(fields).at(-1)).toBe('HoS on');
    // Its modifier is -1 on this sheet; the proficiency bonus (+4) makes the save +3.
    expect(fields['HoS ST Mod']?.value).toBe('3');
  });
});

describe('skill sources', () => {
  it("reads MPMB's note on where the paladin's skills come from", () => {
    const fields = viewsOf(openSheet(referenceSheet('paladin8-warlock2')).doc);
    const sources = readSkillSources(fields);
    expect(sources).toEqual([
      { source: 'Acolyte (background)', text: 'Insight and Religion.', choose: 0, skills: ['Ins', 'Rel'] },
      {
        source: 'Paladin',
        text: 'Choose 2: Athletics, Insight, Intimidation, Medicine, Persuasion, or Religion.',
        choose: 2,
        skills: ['Ath', 'Ins', 'Inti', 'Med', 'Pers', 'Rel'],
      },
    ]);
  });

  it('counts a pick only where the background did not give the skill already', () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    let fields = viewsOf(engine.doc);
    // The test paladin has only the background's Insight and Religion: none of the class's two.
    expect(skillChoices(fields, readSkillSources(fields)).map((c) => c.chosen)).toEqual([0]);
    expect(openSkillPicks(skillChoices(fields, readSkillSources(fields)))).toBe(2);
    // A tap on Athletics: MPMB's own skill box script (applySkillClick) adds it.
    engine.click('Ath Prof');
    fields = viewsOf(engine.doc);
    expect(fields['Ath Prof']?.value).not.toBe('Off');
    expect(openSkillPicks(skillChoices(fields, readSkillSources(fields)))).toBe(1);
    // A second tap takes it away again.
    engine.click('Ath Prof');
    fields = viewsOf(engine.doc);
    expect(fields['Ath Prof']?.value).toBe('Off');
  });

  it("expertise goes through MPMB's second box and makes the skill proficient too", () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    const before = viewsOf(engine.doc)['Ins']?.value;
    engine.click('Ins Exp');
    const fields = viewsOf(engine.doc);
    expect(fields['Ins Exp']?.value).not.toBe('Off');
    expect(fields['Ins Prof']?.value).not.toBe('Off');
    // Insight +5 becomes +9 with the proficiency bonus doubled.
    expect(Number(fields['Ins']?.value)).toBe(Number(before) + 4);
  });

  it("the wizard's Scholar: a source with a colon, and expertise that gives no proficiency", () => {
    const engine = openSheet(referenceSheet('wizard10-evoker'));
    let fields = viewsOf(engine.doc);
    const sources = readSkillSources(fields);
    expect(sources.map((s) => [s.source, s.choose, s.skills])).toEqual([
      ['Sage (background)', 0, ['Arc', 'His']],
      ['Wizard', 2, ['Arc', 'His', 'Ins', 'Inv', 'Med', 'Nat', 'Rel']],
      ['Wizard: Scholar', 0, []],
    ]);
    expect(sources[2]?.text.startsWith('I gain Expertise in one skill')).toBe(true);
    // The test wizard has only the background's Arcana and History: both class picks are open, and
    // Investigation counts for the class (Scholar's list names it too, but gives nothing).
    expect(openSkillPicks(skillChoices(fields, sources))).toBe(2);
    engine.click('Inv Prof');
    fields = viewsOf(engine.doc);
    expect(skillChoices(fields, readSkillSources(fields))[0]?.picked).toEqual(['Inv']);
  });

  it('a ticked skill counts for one choice only, the narrowest first', () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    engine.click('Ath Prof');
    engine.click('Med Prof');
    engine.click('Ste Prof');
    const fields = viewsOf(engine.doc);
    fields['Acr Prof'] = {
      ...fields['Acr Prof']!,
      userName: `${fields['Acr Prof']!.userName}\n • 𝐒𝐤𝐢𝐥𝐥𝐞𝐝: Choose three skills or tools`,
    };
    const [paladin, skilled] = skillChoices(fields, readSkillSources(fields));
    expect(paladin?.picked).toEqual(['Ath', 'Med']);
    expect(skilled?.picked).toEqual(['Ste']);
    expect(openSkillPicks([paladin!, skilled!])).toBe(2);
  });

  it('a choice that names no skill lets the player pick any', () => {
    const fields = viewsOf(openSheet().doc);
    fields['Acr Prof'] = {
      ...fields['Acr Prof']!,
      userName: 'Skill proficiencies gained from:\n • 𝐁𝐚𝐫𝐝: Choose any three skills.',
    };
    const [bard] = readSkillSources(fields);
    expect(bard?.choose).toBe(3);
    expect(bard?.skills).toHaveLength(18);
  });
});

describe('languages and tools', () => {
  it("reads the rows with their sources; the species' choices may be changed", () => {
    const fields = viewsOf(openSheet(referenceSheet('paladin8-warlock2')).doc);
    expect(readLangTools(fields, 'Language')).toEqual([
      { field: 'Language 1', name: 'Common', sources: ['Silver Dragonborn'], choice: false },
      { field: 'Language 2', name: 'Draconic', sources: ['Silver Dragonborn'], choice: true },
      { field: 'Language 3', name: 'Elvish', sources: ['Silver Dragonborn'], choice: true },
    ]);
    expect(readLangTools(fields, 'Tool')).toEqual([
      { field: 'Tool 1', name: "Calligrapher's Supplies", sources: ['Acolyte (background)'], choice: false },
    ]);
    expect(freeLangToolRow(fields, 'Language')).toBe('Language 4');
  });

  it("a background's tool choice may be changed too, also when it kept MPMB's name", () => {
    const engine = openSheet();
    engine.edit('Background', 'Soldier');
    // MPMB names a group of tools with its article since c1044f6 ("A Gaming Set", "A Musical Instrument").
    expect(readLangTools(viewsOf(engine.doc), 'Tool')).toEqual([
      { field: 'Tool 1', name: 'A Gaming Set', sources: ['Soldier (background)'], choice: true },
    ]);
  });

  it('an emptied choice slot goes from the list and is the last row a new language takes', () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    engine.edit('Language 2', '');
    let fields = viewsOf(engine.doc);
    expect(readLangTools(fields, 'Language').map((row) => row.field)).toEqual(['Language 1', 'Language 3']);
    // MPMB's tag stays on the empty row, so a language typed in now would read as the species' choice.
    expect(fields['Language 2']?.submitName).toContain('_#_');
    expect(freeLangToolRow(fields, 'Language')).toBe('Language 4');
    ['Undercommon', 'Abyssal', 'Infernal', 'Giant', 'Orc'].forEach((name, i) => engine.edit(`Language ${i + 4}`, name));
    fields = viewsOf(engine.doc);
    expect(freeLangToolRow(fields, 'Language')).toBe('Language 2');
  });

  it("a hand-added language moved into a choice slot reads as the species' choice, and goes with the species", () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    engine.edit('Language 4', 'Giant');
    engine.edit('Language 5', 'Orc');
    // What the pencil's "Added by you" does: the slot takes the name, the hand-added row is emptied.
    engine.edit('Language 2', 'Giant');
    engine.edit('Language 4', '');
    engine.edit('Language 3', '');
    let fields = viewsOf(engine.doc);
    expect(readLangTools(fields, 'Language')).toEqual([
      { field: 'Language 1', name: 'Common', sources: ['Silver Dragonborn'], choice: false },
      { field: 'Language 2', name: 'Giant', sources: ['Silver Dragonborn'], choice: true },
      { field: 'Language 5', name: 'Orc', sources: [], choice: false },
    ]);
    expect(freeLangToolRow(fields, 'Language')).toBe('Language 4');
    // MPMB's RemoveLangTool finds both tagged rows, the filled and the emptied one, and the player's own stays.
    engine.edit('Race', '');
    fields = viewsOf(engine.doc);
    expect(readLangTools(fields, 'Language').map((row) => [row.name, row.choice])).toEqual([['Orc', false]]);
  });

  it("a language typed into a free row shows as the player's own", () => {
    const engine = openSheet(referenceSheet('paladin8-warlock2'));
    engine.edit('Language 4', 'Undercommon');
    const rows = readLangTools(viewsOf(engine.doc), 'Language');
    expect(rows[3]).toEqual({ field: 'Language 4', name: 'Undercommon', sources: [], choice: false });
  });
});

describe('proficiencies for the play view', () => {
  it("the paladin's training, tools and languages", () => {
    const p = readProficiencies(viewsOf(openSheet(referenceSheet('paladin8-warlock2')).doc));
    expect(p).toMatchObject({
      armour: ['light', 'medium', 'heavy', 'shields'],
      weapons: ['simple', 'martial'],
      tools: ["Calligrapher's Supplies"],
      languages: ['Common', 'Draconic', 'Elvish'],
    });
    expect(hasProficiencies(p)).toBe(true);
  });

  it('a blank sheet knows only Common, as MPMB starts every sheet', () => {
    expect(readProficiencies(viewsOf(openSheet().doc))).toMatchObject({
      armour: [],
      weapons: [],
      tools: [],
      languages: ['Common'],
    });
  });

  it("a training box ticked by hand stays, through MPMB's own script", () => {
    const engine = openSheet();
    engine.click('Proficiency Armor Light');
    expect(readProficiencies(viewsOf(engine.doc)).armour).toEqual(['light']);
  });

  it('the overflow text as one entry each, split at MPMB\'s "; " and at line breaks', () => {
    const p = readProficiencies(viewsOf(openSheet().doc));
    expect(moreProficiencies({ ...p, more: "Orc (language); Smith's Tools (tool)\rGiant" })).toEqual([
      'Orc (language)',
      "Smith's Tools (tool)",
      'Giant',
    ]);
    expect(moreProficiencies({ ...p, more: '' })).toEqual([]);
  });
});
