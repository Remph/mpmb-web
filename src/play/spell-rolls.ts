// What a spell on the Spells tab can roll (M17, M14's follow-up 2): its spell attack and its damage, read from
// MPMB's one-line summary on the spell sheet. MPMB writes those lines for a person, not a program, but it uses
// the same words throughout ListsSpells.js: "Rngd spell atk for 2d8+3 Cold dmg", "Spell attack for 4d6+1d6/SL
// Radiant dmg", "6-m rad all crea 8d6+3+1d6/SL Fire dmg,; save half". The sheet's line already has what the
// character's features add (the Evoker's +3) and a cantrip's dice at the character's level.
import { parseFormula } from '../dice/dice.ts';
import type { Formula } from '../dice/dice.ts';

export interface SpellDamage {
  /** At the spell's own level. */
  formula: Formula;
  /** What each slot level above adds ("+1d6/SL"), or null when a higher slot changes nothing. */
  perLevel: Formula | null;
  /** "Fire", "Lightning", "elem." as MPMB wrote it, or "". */
  type: string;
}

export interface SpellRolls {
  /** The spell makes a spell attack: the source's attack bonus rolls it. */
  attack: boolean;
  /** The first damage the line names, or null when it names none the app can roll. */
  damage: SpellDamage | null;
}

/** MPMB's mark for "per slot level above the spell's own". */
const PER_LEVEL = '/sl';
/** How many words may stand between the dice and "dmg" ("8d6 Fire dmg", "2d10 Bludg. dmg"). */
const TYPE_WORDS = 2;

/** "dmg,;" -> "dmg": the punctuation MPMB puts after a word. Abbreviations keep their dot ("Bludg."). */
const trim = (word: string, marks: string): string =>
  word.slice(0, [...word].findLastIndex((c) => !marks.includes(c)) + 1);
const bare = (word: string): string => trim(word, ',;:.)');
const typeWord = (word: string): string => trim(word, ',;:');

const isDamageWord = (word: string): boolean => {
  const plain = bare(word).toLowerCase();
  return plain === 'dmg' || plain === 'damage';
};

/** "8d6+3+1d6/SL" -> its terms: ["8d6", "+3", "+1d6/SL"]. A new term starts at each sign after the first character. */
function termsOf(text: string): string[] {
  return [...text].reduce<string[]>((terms, c, i) => {
    if (i > 0 && (c === '+' || c === '-')) return [...terms, c];
    const last = terms.length - 1;
    return last < 0 ? [c] : [...terms.slice(0, last), `${terms[last]}${c}`];
  }, []);
}

/**
 * One word as dice: "8d6+3+1d6/SL" is 8d6+3 at the spell's level and 1d6 more per level. A leading "+" (Divine
 * Smite's "+2d8+1d8/SL Radiant damage", extra damage on a hit) still rolls; a leading "-" (Ray of Enfeeblement's
 * "-1d8 dmg", less damage) does not. Null when the word isn't dice ("Spell", "3+1/SL" creatures).
 */
function readDice(word: string): { formula: Formula; perLevel: Formula | null } | null {
  const text = bare(word);
  if (text.startsWith('-')) return null;
  const terms = termsOf(text.startsWith('+') ? text.slice(1) : text);
  const isPer = (term: string): boolean => term.toLowerCase().endsWith(PER_LEVEL);
  const base = terms.filter((term) => !isPer(term)).join('');
  const per = terms
    .filter(isPer)
    .map((term) => term.slice(0, -PER_LEVEL.length))
    .join('');
  // A term that is neither dice nor a number ("spell" of "+spell mod") makes the whole word unreadable.
  const formula = parseFormula(base.startsWith('+') ? base.slice(1) : base);
  const perLevel = per ? parseFormula(per.startsWith('+') ? per.slice(1) : per) : null;
  if (!formula || (per && !perLevel)) return null;
  return { formula, perLevel };
}

/**
 * The words between the dice and "dmg" as the damage type: "Fire", "Bludg.", "elem.", "Acid/Cold". An ability in
 * brackets ("1d6+5 (Cha) Bludg. dmg") is not part of it, and a plain lower-case word means the words are no type
 * at all (Fire Shield's "2d8 of other dmg type"): then the badge shows no type rather than "of other".
 */
function typeOf(words: string[]): string {
  const kept = words.map(typeWord).filter((word) => !word.startsWith('('));
  const plain = (word: string): boolean => word === word.toLowerCase() && !word.includes('.') && !word.includes('/');
  return kept.some(plain) ? '' : kept.join(' ');
}

/** The first dice in the line that are followed by "dmg" or "damage" within a word or two. */
function damageOf(summary: string): SpellDamage | null {
  const words = summary.split(' ').filter(Boolean);
  const found = words
    .map((word, i) => {
      const dice = readDice(word);
      // The type's words and "dmg" itself.
      const after = dice ? words.slice(i + 1, i + 1 + TYPE_WORDS + 1) : [];
      const at = after.findIndex(isDamageWord);
      return dice && at >= 0 ? { ...dice, type: typeOf(after.slice(0, at)) } : null;
    })
    .find((damage) => damage !== null);
  return found ?? null;
}

export function spellRolls(summary: string): SpellRolls {
  const line = summary.toLowerCase();
  return {
    attack: line.includes('spell atk') || line.includes('spell attack'),
    damage: damageOf(summary),
  };
}
