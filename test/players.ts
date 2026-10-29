// What the players of the reference characters did on the blank sheet, as data: the Node tests
// replay it on the engine directly (typed.test.ts), the browser check through the worker
// (test/browser/engine-check.ts).
import type { ReferenceCharacter } from './characters.ts';
import type { DialogAnswer, ScriptedAnswers } from './hosts.ts';

export type Action = { type: string; text: string } | { click: string } | { bookmark: string[] };

export interface Player {
  /** The ability scores dialog: base, background and feat columns. */
  scores: DialogAnswer;
  /** In the order the player did them. */
  actions: Action[];
}

/** Ability scores dialog steps: type each score of one column (00 base, 01 background, 02 feats). */
const scoreColumn = (column: string, scores: readonly number[]): { set: Record<string, string>; click: string }[] =>
  ['St', 'Dx', 'Cn', 'In', 'Ws', 'Ch', 'HS'].map((ability, i) => ({
    set: { [column + ability]: String(scores[i] ?? 0) },
    click: column + ability,
  }));

const FIXED_HP = ['Set the Max HP to automatically assume', 'The total HP using fixed values'];
const METRIC: DialogAnswer = { steps: [{ set: { SyIm: false, SyMe: true } }] };
export const METRIC_UNITS: Action = { bookmark: ['Functions', 'Unit System'] };

/** The answers to the pop-ups these players saw: the dialogs above, the HP menu, OK and No for the rest. */
export const answersFor = (player: Player): ScriptedAnswers => ({
  menus: [FIXED_HP],
  dialogs: { 'ABILITY SCORES DIALOG': player.scores, 'SET UNIT SYSTEM AND DECIMAL SEPARATOR': METRIC },
});

const typed = (fields: [string, string][]): Action[] => fields.map(([type, text]) => ({ type, text }));

/* eslint-disable ts-patterns/no-magic-numbers -- the scores are what the players typed into the dialog */
export const PLAYERS: Record<ReferenceCharacter, Player> = {
  'paladin8-warlock2': {
    scores: {
      steps: [
        ...scoreColumn('00', [14, 9, 15, 8, 9, 15, 8]),
        ...scoreColumn('01', [0, 0, 0, 0, 1, 2]),
        ...scoreColumn('02', [0, 0, 1, 0, 0, 1]),
      ],
    },
    actions: [
      ...typed([
        ['Class and Levels', 'Paladin (Oath of Devotion) 8, Warlock (Fiend Patron) 2'],
        ['Extra.Magic Item 1', 'Adamantine Plate Armor'],
        // What MPMB's own menu puts in the field for a "+2 weapon" of the halberd kind: the invisible
        // U+FEFF marks it as chosen gear. Acrobat drops that character when it saves the PDF.
        ['Extra.Magic Item 2', '+2 Halberd﻿'],
        ['Extra.Magic Item 3', 'Headband of Intellect'],
        ['Extra.Magic Item 4', 'Stone of Good Luck'],
        ['Race', 'Silver Dragonborn'],
        ['Background', 'Acolyte'],
      ]),
      { click: 'Ability Scores Button' },
      { type: 'AC Armor Description', text: 'Adamantine Plate' },
      { click: 'Buttons.HP Max' },
      METRIC_UNITS,
      ...typed([
        ['PC Name', 'Test Paladin / Warlock'],
        ['Player Name', 'Remph'],
        ['Alignment', 'Lawful Good'],
        ['Sex', 'Male'],
        ['Age', '28'],
        ['Hair colour', 'None'],
        ['Eyes colour', 'Blue'],
        ['Skin colour', 'Silver'],
        ['Faith/Deity', 'Thassa'],
        ['Height', '180cm'],
        ['Weight', '250kg'],
      ]),
    ],
  },
  'wizard10-evoker': {
    scores: { steps: [...scoreColumn('00', [8, 14, 14, 15, 10, 10, 8]), ...scoreColumn('01', [0, 0, 1, 2])] },
    actions: [
      ...typed([
        ['Class and Levels', 'Evoker 10'],
        ['Extra.Magic Item 1', 'Staff of the Magi'],
        ['Extra.Magic Item 2', 'Apparatus of Kwalish'],
        ['Race', 'Chthonic Tiefling'],
        ['Background', 'Sage'],
        ['Background Extra', 'Researcher'],
      ]),
      { click: 'Ability Scores Button' },
      ...typed([
        ['Total Experience', '64000'],
        ['AC Armor Description', 'Unarmored'],
      ]),
      { click: 'Buttons.HP Max' },
      METRIC_UNITS,
      ...typed([
        ['PC Name', 'Test Wizard'],
        ['Player Name', 'Wizard Player'],
        ['Alignment', 'Chaotic Neutral'],
        ['Sex', 'Female'],
        ['Age', '45'],
        ['Hair colour', 'Black'],
        ['Eyes colour', 'Red'],
        ['Skin colour', 'Red'],
        ['Faith/Deity', 'None'],
        ['Height', '169cm'],
        ['Weight', '78kg'],
      ]),
    ],
  },
};
/* eslint-enable ts-patterns/no-magic-numbers */
