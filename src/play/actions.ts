// The Actions card (session feedback, 2026-11-04: "one long line"). MPMB fills Action, Bonus Action and
// Reaction rows; the first rows always hold the basic actions every creature has ("Attack / Magic /
// Utilize", "Opportunity Attack"), and features sometimes land twice ("Rallying Cry" and "Rallying Cry
// (Rallying Cry)"). The card shows the character's own actions as chips and folds the basic ones away.
import type { FieldViews } from '../worker/views.ts';
import { featureLine, linesOf, readActions, readFeatures, readInventory, textRuns } from './read.ts';

/** One action: "Gem of Brightness (light)" is the name "Gem of Brightness" with the note "light". */
export interface ActionItem {
  name: string;
  note: string;
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

export function actionItem(text: string): ActionItem {
  const m = NOTE.exec(text.trim());
  if (!m) return { name: text.trim(), note: '' };
  const name = m[1] ?? '';
  const note = m[2] ?? '';
  // "Rallying Cry (Rallying Cry)": a note that only repeats the name says nothing.
  return { name, note: note.toLowerCase() === name.toLowerCase() ? '' : note };
}

export function readActionList(fields: FieldViews): ActionList {
  const raw = readActions(fields);
  const basic: string[] = [];
  const own = (rows: string[]): ActionItem[] => {
    const seen = new Set<string>();
    // MPMB puts several actions in one row: "Dash / Disengage / Dodge / Hide".
    return rows
      .flatMap((row) => row.split(' / '))
      .map(actionItem)
      .filter((item) => {
        if (item.name === '') return false;
        if (!item.note && BASIC.has(item.name)) {
          if (!basic.includes(item.name)) basic.push(item.name);
          return false;
        }
        const key = `${item.name}\n${item.note}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };
  return {
    action: own(raw.action),
    bonusAction: own(raw.bonusAction),
    reaction: own(raw.reaction),
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
 * Every named block of rule text on the sheet: class features and species traits ("◆ Lay on Hands"),
 * feats and magic items. The text runs until the next name or heading.
 */
export function ruleIndex(fields: FieldViews): Map<string, ActionRule> {
  const index = new Map<string, ActionRule>();
  const add = (rule: ActionRule): void => {
    if (rule.title && !index.has(key(rule.title))) index.set(key(rule.title), rule);
  };
  for (const block of readFeatures(fields)) {
    if (block.title) {
      add({ title: block.title, source: '', lines: linesOf(block.text).map(plain).filter(Boolean) });
      continue;
    }
    let current: ActionRule | null = null;
    for (const line of linesOf(block.text)) {
      const parsed = featureLine(line);
      const bullet = BULLET.exec(line.trim());
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
  }
  for (const item of readInventory(fields).magicItems) {
    add({ title: item.name, source: '', lines: linesOf(item.description).map(plain).filter(Boolean) });
  }
  return index;
}

/**
 * The rule for an action, found by name: "Lay on Hands" is the class feature of that name. A few
 * actions name their feature differently: "Lay on Hands - Poison" is under "Lay on Hands", and
 * "Divine Sense (Channel Divinity)" may only exist as its note.
 */
export function ruleFor(index: Map<string, ActionRule>, item: ActionItem): ActionRule | null {
  const tries = [item.name, item.name.split(' - ')[0] ?? '', item.note];
  for (const name of tries) {
    const rule = name ? index.get(key(name)) : undefined;
    if (rule && rule.lines.length) return rule;
  }
  return null;
}
