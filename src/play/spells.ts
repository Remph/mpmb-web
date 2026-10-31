// The spells MPMB puts on its spell sheet pages, for the play view's Spells tab (M4.6). MPMB spawns the
// pages from two templates ("P6.SSfront.", "P7.SSmore.") and writes each row's kind into a hidden
// "remember" field: a class header, a level divider, a column caption, an empty line or a spell. The play
// view reads those rows in the sheet's order and leaves choosing spells to MPMB's own Spells menu.
// MPMB's code for it: GenerateSpellSheet and ApplySpell in vendor/mpmb/_functions/FunctionsSpells.js.
import { valueOf } from './read.ts';
import type { FieldViews } from '../worker/views.ts';

/** Rows on a page: SSfront has room for 67, SSmore (no title block) for 78. */
const SSFRONT_ROWS = 67;
const SSMORE_ROWS = 78;
const ROWS = { SSfront: SSFRONT_ROWS, SSmore: SSMORE_ROWS } as const;
type Template = keyof typeof ROWS;

/** MPMB adds these to a spell's name on the sheet (ListsSpells.js: SpellRitualTag, SpellReqLosTag). */
const RITUAL = '®';
const SIGHT = '◉';
/** The first column of an option of the spell above (Arcane Hand's four hands). */
const OPTION = '➥';

/** What the sheet's first column says about a spell: MPMB's check box and its other marks. */
export interface SpellMark {
  /** true or false where the player chooses (MPMB's check box); null where there is nothing to choose. */
  prepared: boolean | null;
  /** Prepared without counting against the limit (oath spells, a feat's spell). */
  always: boolean;
  /** Cast once without a slot, back after this rest (a feat's or species' spell); null when not. */
  free: 'long' | 'short' | 'day' | null;
  /** The free cast is used up (MPMB's "_used" box). */
  freeUsed: boolean;
  /** At will: a cantrip, or a spell an item casts at will. */
  atWill: boolean;
  /** Charges a cast costs (Staff of the Magi), null when none. */
  charges: number | null;
  /** Anything else MPMB wrote in the column ("d6"), as written. */
  other: string;
}

export interface Spell {
  /** The row's fields share this start: "P6.SSfront.spells." + field + "." + row. */
  page: string;
  row: number;
  /** MPMB's key for the spell, as in its spell list ("bless", "bigby's hand-1-clenched fist"). */
  key: string;
  /** As the sheet shows it, shortened to fit ("Prot. from Evil/Good"), without the ritual and sight marks. */
  name: string;
  /** The full name ("Protection from Evil and Good"). */
  fullName: string;
  ritual: boolean;
  /** Needs a target the caster can see (MPMB's ◉). */
  needsSight: boolean;
  concentration: boolean;
  mark: SpellMark;
  school: string;
  /** Save ability ("Wis"), '' when none. */
  save: string;
  /** As MPMB abbreviates it: "Act", "Bns", "React", "1 min". */
  time: string;
  /** The longer casting time from the tooltip, when MPMB gives one ("Reaction, which you take when …"). */
  timeFull: string;
  range: string;
  components: string;
  /** The material component ("A ball of bat guano and sulfur"), '' when none. */
  material: string;
  /** "Instantaneous", "1 min"; concentration is taken off into `concentration`. */
  duration: string;
  /** Book abbreviation and page ("SR", "131"). */
  book: string;
  bookPage: string;
  /** MPMB's one-line summary on the sheet. */
  summary: string;
  /** The full text MPMB keeps in the summary's tooltip, as plain text. */
  text: string;
  /** The options listed under the spell (Arcane Hand: Clenched Fist, Forceful Hand …). */
  options: Spell[];
}

export interface SpellLevel {
  /** 0 for cantrips. */
  level: number;
  spells: Spell[];
}

/** A class header on the sheet: a class, a species, a feat or an item that gives spells. */
export interface SpellSource {
  /** MPMB's key ("paladin", "magic initiate_-_cleric", "staff of the magi"). */
  key: string;
  /** The header's text ("Paladin Spells", "Magic Initiate"). */
  title: string;
  dc: string;
  attack: string;
  /** How many spells it may prepare, null when it doesn't prepare. */
  prepareMax: number | null;
  levels: SpellLevel[];
}

/** The spell sheet pages as their field prefixes, in page order: ["P6.SSfront.", "P7.SSmore."]. */
export function spellPages(fields: FieldViews): { prefix: string; template: Template }[] {
  const pages = (['SSfront', 'SSmore'] as const).flatMap((template) =>
    // MPMB keeps the prefixes as a list: ",P6.SSfront." (Template.extras.SSfront).
    valueOf(fields, `Template.extras.${template}`)
      .split(',')
      .filter(Boolean)
      .map((prefix) => ({ prefix, template })),
  );
  // "P7." is page 7: the number after the P orders them; "SSmore." alone doesn't match. Try it: https://regex101.com/?regex=%5EP(%5Cd%2B)%5C.&testString=P7.SSmore.
  const pageNumber = (prefix: string): number => Number(/^P(\d+)\./.exec(prefix)?.[1] ?? 0);
  return pages.sort((a, b) => pageNumber(a.prefix) - pageNumber(b.prefix));
}

/** The first column's text as a mark: "checkedbox", "oncelr+markedbox_used", "atwill", "2". */
export function spellMark(column: string): SpellMark {
  const value = column.trim().toLowerCase();
  // MPMB's boxes (ApplySpell's okChecks): a once-per-rest box, maybe with an always-prepared box and
  // "_used": matches "oncelr+markedbox_used" and "oncesr", not "markedbox".
  // Try it: https://regex101.com/?regex=%5Eonce(lr%7Csr%7Cday)(%5C%2Bmarkedbox)%3F(_used)%3F%24&testString=oncelr%2Bmarkedbox_used
  const once = /^once(lr|sr|day)(\+markedbox)?(_used)?$/.exec(value);
  const free = once ? ({ lr: 'long', sr: 'short', day: 'day' } as const)[once[1] as 'lr' | 'sr' | 'day'] : null;
  const always = value === 'markedbox' || once?.[2] !== undefined;
  // The player's own choice is the plain check box; an always prepared spell counts as prepared.
  const CHOICE: Record<string, boolean> = { checkedbox: true, checkbox: false };
  const prepared = CHOICE[value] ?? (always || null);
  // Charges per cast: a whole number such as "2" or "7", not "d6". Try it: https://regex101.com/?regex=%5E%5Cd%2B%24&testString=7
  const charges = /^\d+$/.test(value) ? Number(value) : null;
  const known = ['', 'checkbox', 'checkedbox', 'markedbox', 'atwill'];
  return {
    prepared,
    always,
    free,
    freeUsed: once?.[3] !== undefined,
    atWill: value === 'atwill',
    charges,
    other: once || charges !== null || known.includes(value) ? '' : column.trim(),
  };
}

/** Whether a spell can be cast now: everything except the ones MPMB lists to choose from but not prepared. */
export const isReady = (spell: Spell): boolean => spell.mark.prepared !== false;

// The spell level on a divider: "1st Level" is 1, "Cantrips (0 Level)" is 0; "Spells" has none. Try it:
// https://regex101.com/?regex=%5Cd%2B&testString=Cantrips%20(0%20Level)
const dividerLevel = (text: string): number => Number(/\d+/.exec(text)?.[0] ?? 0);

/** Text from MPMB's tooltips: they set titles in mathematical bold letters, which NFKC turns into plain ones. */
const plain = (text: string): string => text.normalize('NFKC');

function readSpell(fields: FieldViews, page: string, row: number, remember: string): Spell {
  const field = (name: string): string => valueOf(fields, `${page}spells.${name}.${row}`);
  const tip = (name: string): string => plain(fields[`${page}spells.${name}.${row}`]?.userName ?? '').trim();
  const shown = field('name');
  const name = shown.replace(RITUAL, '').replace(SIGHT, '').trim();
  const duration = field('duration');
  // "Conc, 1 min": MPMB's concentration mark in front of the duration; "1 min" alone doesn't match. Try it:
  // https://regex101.com/?regex=%5EConc%2C%5Cs*&testString=Conc%2C%201%20min
  const conc = /^Conc,\s*/;
  const none = (text: string): string => (text === '–' ? '' : text);
  return {
    page,
    row,
    key: remember.split('##')[0] ?? '',
    name,
    fullName: tip('name') || name,
    ritual: shown.includes(RITUAL),
    needsSight: shown.includes(SIGHT),
    concentration: conc.test(duration),
    mark: spellMark(field('check')),
    school: none(field('school')),
    save: none(field('save')),
    time: none(field('time')),
    timeFull: tip('time'),
    range: none(field('range')),
    components: none(field('components')),
    material: tip('components'),
    duration: none(duration.replace(conc, '')),
    book: field('book'),
    bookPage: field('page'),
    summary: field('description'),
    text: tip('description'),
    options: [],
  };
}

/**
 * The spells on the sheet, by source and level, in the sheet's order. On the first page the first header
 * and divider sit above row 0 (MPMB sets them without a row); a later page starts by continuing the source
 * and level the page before ended with, until its own header or divider.
 */
export function readSpells(fields: FieldViews): SpellSource[] {
  const sources: SpellSource[] = [];
  let level: SpellLevel | undefined;
  const addSource = (page: string, i: number): void => {
    const head = (name: string): string => valueOf(fields, `${page}spellshead.${name}.${i}`);
    const prepare = Number(head('prepare'));
    sources.push({
      key: head('class'),
      title: head('Text.header'),
      dc: head('dc'),
      attack: head('attack'),
      // MPMB hides the prepare box when the source doesn't prepare (it then holds 0).
      prepareMax: prepare > 0 && isShownField(fields, `${page}spellshead.prepare.${i}`) ? prepare : null,
      levels: [],
    });
    level = undefined;
  };
  const addLevel = (n: number): void => {
    level = { level: n, spells: [] };
    sources.at(-1)?.levels.push(level);
  };

  spellPages(fields).forEach(({ prefix, template }) => {
    if (template === 'SSfront') {
      addSource(prefix, 0);
      addLevel(dividerLevel(valueOf(fields, `${prefix}spellsdiv.Text.0`)));
    }
    Array.from({ length: ROWS[template] }, (_, row) => row).forEach((row) => {
      const remember = valueOf(fields, `${prefix}spells.remember.${row}`);
      const [kind = '', first = '', second = ''] = remember.split('##');
      if (kind === 'setheader') addSource(prefix, Number(second));
      else if (kind === 'setdivider') addLevel(Number(first));
      // Captions, empty and hidden lines, the glossary: nothing to show. Matches "setcaptions" and
      // "hidethisline", not "bless". Try it: https://regex101.com/?regex=%5E(hidethisline%7Csetcaptions%7Csetglossary)&flags=i&testString=setcaptions
      else if (remember === '' || /^(hidethisline|setcaptions|setglossary)/i.test(kind)) return;
      else if (level && valueOf(fields, `${prefix}spells.name.${row}`) !== '') {
        const spell = readSpell(fields, prefix, row, remember);
        const above = level.spells.at(-1);
        if (valueOf(fields, `${prefix}spells.check.${row}`) === OPTION && above) above.options.push(spell);
        else level.spells.push(spell);
      }
    });
  });
  return sources
    .map((source) => ({ ...source, levels: source.levels.filter((l) => l.spells.length > 0) }))
    .filter((source) => source.levels.length > 0);
}

/** The spells a source has prepared (MPMB's ticked boxes, not the always prepared ones). */
export const preparedCount = (source: SpellSource): number =>
  source.levels.flatMap((l) => l.spells).filter((s) => s.mark.prepared === true && !s.mark.always).length;

/** MPMB's full text of a spell, split for the details pop-up. */
export interface SpellText {
  /** "Level 3 Evocation" from the first line, '' when the text has no heading. */
  kind: string;
  /** The description's paragraphs. */
  paragraphs: string[];
  /** MPMB's notes on what the character's features change ("Changes by Evoker: Empowered Evocation", …). */
  changes: string[];
}

const CHANGES = '> > CHANGES BY FEATURES < <';

/**
 * MPMB's tooltip: "Fireball — Level 3 Evocation", indented lines with casting time, range, components and
 * duration, a blank line, the description, then optionally its notes on changes by features.
 */
export function spellText(text: string): SpellText {
  const [head = '', ...rest] = text.split('\n\n');
  const [body = '', changes = ''] = rest.join('\n\n').split(CHANGES);
  const lines = (part: string): string[] =>
    part
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  const kind = head.split('\n')[0]?.split(' — ')[1]?.trim() ?? '';
  return {
    kind,
    paragraphs: lines(body),
    // The first line after the marker is MPMB's "The above original has been changed as follows:".
    changes: lines(changes).slice(1),
  };
}

/** Whether the sheet shows a field (a header's prepare box is hidden when there is nothing to prepare). */
function isShownField(fields: FieldViews, name: string): boolean {
  // Acrobat's widget flag 2 is "hidden" (PDF 1.7, 12.5.3).
  const HIDDEN = 2;
  const flags = fields[name]?.widgets[0]?.flags ?? HIDDEN;
  return (flags & HIDDEN) === 0;
}

/** For a tick the player makes: MPMB's toggle on the check box ("checkbox" ↔ "checkedbox", once-box ↔ "_used"). */
export const checkboxField = (spell: Spell): string => `${spell.page}spells.checkbox.${spell.row}`;
