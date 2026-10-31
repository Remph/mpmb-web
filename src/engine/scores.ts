// The ability scores as MPMB keeps them (M6 Build screen): columns of numbers per ability (base, background,
// feats, class levels, magic items, overrides, maximums) in its global CurrentStats, which its Ability
// Scores dialog edits and adds up into the "Str" … "Cha" fields. The page reads the columns here and
// writes them through that same dialog, answered by the app in the player's place (answerScores), so
// MPMB's own code adds them up, sets the fields and recalculates what depends on them.
import type { DialogReply, DialogView } from './host.ts';

/** MPMB's column types (CurrentStats.cols[].type); add-ons and the player may add "extra" columns. */
export type ScoreColumnType =
  | 'base'
  | 'background'
  | 'race'
  | 'feats'
  | 'levels'
  | 'classes'
  | 'items'
  | 'ongoing'
  | 'override'
  | 'maximum'
  | 'extra';

export interface ScoreColumn {
  type: ScoreColumnType | string;
  /** MPMB's English caption, e.g. "Feat Bonus". */
  name: string;
  /** Strength … Charisma (MPMB's seventh, Honor or Sanity, is left alone here). */
  scores: number[];
}

export interface ScoresInfo {
  columns: ScoreColumn[];
  /** Per ability: what magic items add on top of the columns, which follows rules of its own. */
  ongoing: number[];
  /** Per ability: MPMB's total, as it is on the sheet now. */
  totals: number[];
  /** Per ability: the magic behind the overrides and item bonuses, e.g. "19 (Headband of Intellect)". */
  magic: string[];
  /** Ability score improvements from class levels so far, per class: each is +2 points or a feat. */
  improvements: { name: string; level: number; count: number }[];
  /** MPMB's texts about increases from the background, by background name (English). */
  backgroundTexts: { name: string; text: string }[];
}

/**
 * Runs in the sheet and returns ScoresInfo as JSON. ES5, next to MPMB's scripts. A sheet whose scores
 * were typed into the fields and never went through the dialog gets the same base MPMB's dialog would
 * work out when it opens (AbilityScores_Button), without changing anything.
 */
export const SCORES_SCRIPT = `(function () {
  initiateCurrentStats();
  var out = { columns: [], ongoing: [], totals: [], magic: [], improvements: [], backgroundTexts: [] };
  for (var c = 0; c < CurrentStats.cols.length; c++) {
    var col = CurrentStats.cols[c];
    out.columns.push({ type: String(col.type), name: String(col.name), scores: col.scores.slice(0, 6).map(Number) });
  }
  for (var i = 0; i < 6; i++) {
    var stat = getAbilityScoreTotals(i);
    if (!CurrentStats.applied && stat.value && stat.base === 8 && stat.value !== stat.calculatedTotal) {
      for (var b = 0; b < out.columns.length; b++) if (out.columns[b].type === 'base') out.columns[b].scores[i] = stat.value;
    }
    out.ongoing.push(stat.ongoingBonus);
    out.totals.push(stat.value);
    var parts = [];
    // One-time magic (a manual, a tome) adds into the "items" column; its names are not kept per ability.
    for (var m = 0; m < out.columns.length; m++) {
      var one = out.columns[m].type === 'items' ? out.columns[m].scores[i] : 0;
      if (one) parts.push((one > 0 ? '+' : '') + one);
    }
    var ov = CurrentStats.overrides[i];
    for (var o in ov) parts.push(ov[o] + ' (' + o + ')');
    for (var g = 0; g < stat.ongoingBonuses.length; g++) {
      var on = stat.ongoingBonuses[g];
      if (on.value) parts.push((on.value > 0 ? '+' : '') + on.value + ' (' + on.name + ')');
    }
    out.magic.push(parts.join(', '));
  }
  for (var k in classes.known) {
    var cl = CurrentClasses[k];
    if (!cl || !cl.improvements) continue;
    var lvl = Math.min(classes.known[k].level, cl.improvements.length);
    var count = lvl ? Number(cl.improvements[lvl - 1]) || 0 : 0;
    if (count) out.improvements.push({ name: String(cl.name), level: classes.known[k].level, count: count });
  }
  var bt = CurrentStats.txts.background || {};
  for (var n in bt) out.backgroundTexts.push({ name: n, text: String(bt[n]) });
  return JSON.stringify(out);
})()`;

/** The name of MPMB's Ability Scores dialog. */
const SCORES_DIALOG = 'ABILITY SCORES DIALOG';
/** MPMB's two-letter ability codes in the dialog's element ids ("00St" is the base Strength). */
const CODES = ['St', 'Dx', 'Cn', 'In', 'Ws', 'Ch'];
/** The dialog numbers its columns with two digits: "01", "02" … */
const COLUMN_DIGITS = 2;

/** New numbers for one column, by its place in CurrentStats.cols. */
export interface ScoreChange {
  column: number;
  scores: number[];
}

/**
 * The player's answer to MPMB's Ability Scores dialog for these changes: the numbers typed into their
 * boxes, then each ability's box "used" once, so that the dialog's own handlers work out the new totals
 * (as they do when the player leaves a box), then Apply. Other dialogs get null (the player answers).
 */
export function answerScores(changes: ScoreChange[]): (view: DialogView) => DialogReply | null {
  let step = 0;
  return (view) => {
    if (view.description.name !== SCORES_DIALOG) return null;
    if (step === CODES.length) return { type: 'close', result: 'ok', state: view.state };
    const state = { ...view.state };
    if (step === 0) {
      changes.forEach(({ column, scores }) => {
        const id = String(column).padStart(COLUMN_DIGITS, '0');
        scores.slice(0, CODES.length).forEach((score, i) => {
          state[`${id}${CODES[i]}`] = String(score);
        });
      });
    }
    const id = `00${CODES[step]}`;
    step += 1;
    return { type: 'event', id, state };
  };
}
