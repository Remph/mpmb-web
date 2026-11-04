import { describe, expect, test } from 'vitest';
import { mpmbNotes } from './mpmb-notes.ts';

// The shape of MPMB's text (FunctionsImport.js), headings in mathematical bold italic letters as toUni writes them.
const SUMMARY = [
  "[Can't see the 'OK' button at the bottom? Use ENTER to close this dialog]",
  '𝙎𝙤𝙢𝙚 𝙢𝙖𝙣𝙪𝙖𝙡 𝙖𝙙𝙙𝙞𝙩𝙞𝙤𝙣𝙨 𝙢𝙞𝙜𝙝𝙩 𝙣𝙤𝙩 𝙝𝙖𝙫𝙚 𝙩𝙧𝙖𝙣𝙨𝙛𝙚𝙧𝙧𝙚𝙙 𝙤𝙫𝙚𝙧',
  'Some things that you adjusted manually on your old sheet might not have transferred to the new sheet…',
  '𝘽𝙚 𝘼𝙬𝙖𝙧𝙚',
  "  • The 'Class Features' text is now solely what the automation added.",
  '',
  '  • Wild Shapes have been re-calculated, manual changes have been ignored.',
].join('\n');

describe("MPMB's notes on the import", () => {
  test('headings in plain letters, points without their bullet, no line about Acrobat', () => {
    expect(mpmbNotes(SUMMARY)).toEqual([
      { kind: 'heading', text: 'Some manual additions might not have transferred over' },
      {
        kind: 'text',
        text: 'Some things that you adjusted manually on your old sheet might not have transferred to the new sheet...',
      },
      { kind: 'heading', text: 'Be Aware' },
      { kind: 'point', text: "The 'Class Features' text is now solely what the automation added." },
      { kind: 'point', text: 'Wild Shapes have been re-calculated, manual changes have been ignored.' },
    ]);
  });

  test('no text, no notes', () => {
    expect(mpmbNotes('')).toEqual([]);
  });
});
