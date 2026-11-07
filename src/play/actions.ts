// The Actions card (session feedback, 2026-11-04: "one long line"). MPMB fills Action, Bonus Action and
// Reaction rows; the first rows always hold the basic actions every creature has ("Attack / Magic /
// Utilize", "Opportunity Attack"), and features sometimes land twice ("Rallying Cry" and "Rallying Cry
// (Rallying Cry)"). The card shows the character's own actions as chips and folds the basic ones away.
import type { FieldViews } from '../worker/views.ts';
import type { FeatureText } from './read.ts';
import { readNotesPages } from './notes.ts';
import { featureLine, linesOf, readFeatures, readInventory, rows, textRuns, valueOf } from './read.ts';

/** One action: "Gem of Brightness (light)" is the name "Gem of Brightness" with the note "light". */
export interface ActionItem {
  name: string;
  note: string;
  /**
   * Where MPMB says the action comes from ("Warlock: Pact of the Blade"), for the rule text when the
   * action is named differently ("Conjure/Bond Pact Weapon"). Empty for an action the player typed in.
   */
  from: string[];
}

export interface ActionList {
  action: ActionItem[];
  bonusAction: ActionItem[];
  reaction: ActionItem[];
  /** The basic actions MPMB lists (SRD 5.2.1, "Actions"), in its order. */
  basic: string[];
}

// The basic actions of the 2024 rules as MPMB writes them on every sheet.
const BASIC = new Set([
  'Attack',
  'Dash',
  'Disengage',
  'Dodge',
  'Escape Grapple',
  'Help',
  'Hide',
  'Influence',
  'Magic',
  'Ready',
  'Search',
  'Study',
  'Utilize',
  'Opportunity Attack',
]);

// A note in brackets at the end: "Gem of Brightness (blinding flash)". Try it:
// https://regex101.com/?regex=%5E(.%2B%3F)%5Cs*%5C((.%2B)%5C)%24&testString=Gem%20of%20Brightness%20(blinding%20flash)
const NOTE = /^(.+?)\s*\((.+)\)$/;

export function actionItem(text: string, from: string[] = []): ActionItem {
  const m = NOTE.exec(text.trim());
  if (!m) return { name: text.trim(), note: '', from };
  const name = m[1] ?? '';
  const note = m[2] ?? '';
  // "Rallying Cry (Rallying Cry)": a note that only repeats the name says nothing.
  return { name, note: note.toLowerCase() === name.toLowerCase() ? '' : note, from };
}

// MPMB's AddAction keeps the action and where it came from in the row's submitName, joined by "#!#":
// "Conjure/Bond Pact Weapon#!#Warlock: Pact of the Blade". A row the player typed has no source. Typing over
// a row MPMB filled leaves its submitName as it was (the field has no script to clear it), so the sources
// count only while the row still holds the action they were written for, as MPMB's own AddAction checks.
const SOURCE_MARK = '#!#';
function sourcesOf(submitName: string | undefined, value: string): string[] {
  if (!submitName?.includes(SOURCE_MARK)) return [];
  const [action, ...sources] = submitName.split(SOURCE_MARK);
  return action?.trim() === value ? sources.filter(Boolean) : [];
}

export function readActionList(fields: FieldViews): ActionList {
  const basic: string[] = [];
  const own = (label: string): ActionItem[] => {
    const seen = new Map<string, ActionItem>();
    rows(fields, `${label} `)
      .map((n) => `${label} ${n}`)
      .forEach((field) => {
        const value = valueOf(fields, field);
        const from = sourcesOf(fields[field]?.submitName, value);
        // MPMB puts several actions in one row: "Dash / Disengage / Dodge / Hide".
        value
          .split(' / ')
          .map((text) => actionItem(text, from))
          .forEach((item) => {
            if (item.name === '') return;
            if (!item.note && BASIC.has(item.name)) {
              if (!basic.includes(item.name)) basic.push(item.name);
              return;
            }
            const key = `${item.name}\n${item.note}`.toLowerCase();
            const known = seen.get(key);
            // The same action twice ("Rallying Cry" typed in or kept from an older sheet, "Rallying Cry (Rallying
            // Cry)" from MPMB): one chip, with every source either row knows.
            if (known) known.from = [...new Set([...known.from, ...item.from])];
            else seen.set(key, item);
          });
      });
    return [...seen.values()];
  };
  return {
    action: own('Action'),
    bonusAction: own('Bonus Action'),
    reaction: own('Reaction'),
    basic,
  };
}

/** The rule text behind an action, to read on the Combat tab without opening Features. */
export interface ActionRule {
  title: string;
  /** Where it comes from, as MPMB writes it: "Paladin 1, SRD'24 53", or "Magic item". */
  source: string;
  /** Plain lines, MPMB's bold and italic marks taken off. */
  lines: string[];
}

const plain = (line: string): string =>
  textRuns(line)
    .map((run) => run.text)
    .join('');
// A species trait some add-on scripts write as "• Stone Hide: My base AC is …". Try it:
// https://regex101.com/?regex=%5E%E2%80%A2%5Cs*(%5B%5E%3A%5D%2B)%3A%5Cs*(.*)%24&testString=%E2%80%A2%20Stone%20Hide%3A%20My%20base%20AC
const BULLET = /^•\s*([^:]+):\s*(.*)$/;
const key = (name: string): string => name.replace(/^◆\s*/, '').trim().toLowerCase();

/**
 * A part of a feature with its own name, as MPMB writes it inside the feature's text: "***Psychic Whispers
 * (1/LR or PsiD)***. As a Magic action, …" or a magic item's "***Regaining Charges***. …".
 * A limited feature or an action is often named after such a part, not after the whole feature.
 */
function subFeature(line: string): { name: string; rest: string } | null {
  const [first, ...runs] = textRuns(line.trim());
  if (!first?.bold || !first.italic || !runs[0]?.text.startsWith('.')) return null;
  return {
    name: first.text.trim(),
    rest: plain(
      runs
        .map((run) => run.text)
        .join('')
        .replace(/^\.\s*/, ''),
    ).trim(),
  };
}

/** The Notes box on the third page, where MPMB writes a feature's text with `toNotesPage` and `page3notes`. */
const NOTES_FIELD = 'Extra.Notes';

/**
 * Every named block of rule text on the sheet: class features and species traits ("◆ Lay on Hands"),
 * feats, magic items, and what MPMB writes to the notes: the third page's Notes and the extra notes pages,
 * where features chosen from a list go (an invocation like Pact of the Blade, an add-on script's options).
 * The text runs until the next name or heading.
 */
export function ruleIndex(fields: FieldViews): Map<string, ActionRule> {
  const index = new Map<string, ActionRule>();
  const add = (rule: ActionRule, name = rule.title): void => {
    if (name && !index.has(key(name))) index.set(key(name), rule);
  };
  const addBlock = (block: FeatureText): void => {
    if (block.title) {
      add({ title: block.title, source: '', lines: linesOf(block.text).map(plain).filter(Boolean) });
      return;
    }
    let current: ActionRule | null = null;
    // A named part of the current feature: its text also stays in the whole feature's text.
    let part: ActionRule | null = null;
    for (const line of linesOf(block.text)) {
      const parsed = featureLine(line);
      const bullet = BULLET.exec(line.trim());
      const sub = subFeature(line);
      if (!('heading' in parsed) && sub) {
        current?.lines.push(plain(line));
        part = { title: sub.name, source: current?.source ?? '', lines: sub.rest ? [sub.rest] : [] };
        add(part);
        // "Psychic Whispers (1/LR or PsiD)" is also found as "Psychic Whispers".
        add(part, actionItem(sub.name).name);
        continue;
      }
      if (!('heading' in parsed) && !parsed.runs.some((run) => run.role === 'name') && !bullet && line.trim()) {
        part?.lines.push(plain(line));
      } else {
        part = null;
      }
      if ('heading' in parsed) {
        current = null;
      } else if (parsed.runs.some((run) => run.role === 'name')) {
        const name = parsed.runs.find((run) => run.role === 'name')?.text ?? '';
        const source = parsed.runs.find((run) => run.role === 'source')?.text.replace(/^\(|\)$/g, '') ?? '';
        const rest = parsed.runs
          .filter((run) => run.role === null)
          .map((run) => run.text)
          .join('')
          .replace(/^\.\s*/, '')
          .trim();
        current = { title: name.replace(/^◆\s*/, ''), source, lines: rest ? [rest] : [] };
        add(current);
      } else if (bullet) {
        current = { title: (bullet[1] ?? '').trim(), source: '', lines: [plain(bullet[2] ?? '')] };
        add(current);
      } else if (current && line.trim()) {
        current.lines.push(plain(line));
      }
    }
  };
  readFeatures(fields).forEach(addBlock);
  for (const item of readInventory(fields).magicItems) {
    add({ title: item.name, source: '', lines: linesOf(item.description).map(plain).filter(Boolean) });
  }
  // The notes last: a feature written there again (a class feature's longer text) keeps the first one.
  [valueOf(fields, NOTES_FIELD), ...readNotesPages(fields).flatMap((page) => [page.left, page.right])]
    .filter(Boolean)
    .forEach((text) => addBlock({ title: '', text }));
  return index;
}

/**
 * The feature names in one of MPMB's action sources: "Warlock: Pact of the Blade" and "Paladin (Oath of
 * Devotion): Sacred Weapon" name the feature after the colon, "Wand of Web (magic item)" names the item.
 */
export function featureNames(source: string): string[] {
  const at = source.lastIndexOf(': ');
  const own = (at === -1 ? source : source.slice(at + 2)).trim();
  // Try it: https://regex101.com/?regex=%5Cs*(%5C(%5B%5E()%5D*%5C)%7C%5C%5B%5B%5E%5B%5C%5D%5D*%5C%5D)%24&testString=Wand%20of%20Web%20(magic%20item)
  const bare = own.replace(/\s*(\([^()]*\)|\[[^[\]]*\])$/, '');
  return bare === own ? [own] : [own, bare];
}

/**
 * The rule for an action, found by name: "Lay on Hands" is the class feature of that name. A few
 * actions name their feature differently: "Lay on Hands - Poison" is under "Lay on Hands",
 * "Divine Sense (Channel Divinity)" may only exist as its note, and "Conjure/Bond Pact Weapon" only
 * says where it comes from ("Warlock: Pact of the Blade").
 */
export function ruleFor(index: Map<string, ActionRule>, item: ActionItem): ActionRule | null {
  const tries = [item.name, item.name.split(' - ')[0] ?? '', item.note, ...item.from.flatMap(featureNames)];
  for (const name of tries) {
    const rule = name ? index.get(key(name)) : undefined;
    if (rule && rule.lines.length) return rule;
  }
  return null;
}

/**
 * The rule behind a limited feature, to read on the Combat tab: by its name without MPMB's note
 * ("Psionic Energy Dice (regain 1/SR)" is "Psionic Energy Dice"), then by where MPMB says it came from.
 */
export const featureRule = (
  index: Map<string, ActionRule>,
  feature: { name: string; from: string[] },
): ActionRule | null => ruleFor(index, actionItem(feature.name, feature.from));
