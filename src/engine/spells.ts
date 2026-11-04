// The Build screen's "Spells" step (M7, Nick picked a Build step, 2026-11-03): what MPMB's own spell dialogs
// offer, read without showing them, and the player's picks handed to those same dialogs.
//
// In Acrobat, "(Re)generate a Spell Sheet" walks through one SPELL SELECTION DIALOG per spell source
// (AskUserSpellSheet in FunctionsSpells.js), then the order dialog, then makes the pages. The dialogs show
// what MPMB keeps in CurrentSpells (each source's cantrips, spells, spellbook, "what spells to show") and
// write the player's picks back there. So the step:
// - reads: runs AskUserSpellSheet with a stand-in execDialog that notes what each dialog would show and
//   presses OK unchanged, cancels the order dialog (so no sheet is made), then puts CurrentSpells back
//   exactly as it was (MPMB's own text in "CurrentSpells.Stringified");
// - writes: puts the picks into CurrentSpells, where MPMB's dialogs load them from, and runs MPMB's
//   "(Re)generate a Spell Sheet" with the app pressing OK in each spell dialog (answerSpellDialogs). MPMB's
//   own dialog code then loads, checks and stores the picks, and makes the pages as in Acrobat.
import { valueOf } from '../play/read.ts';
import { checkboxField, readSpells } from '../play/spells.ts';
import { viewsOf } from '../worker/views.ts';
import type { Engine } from './engine.ts';
import type { DialogReply, DialogView } from './host.ts';

/** One spell as MPMB knows it (SpellsList), in the sheet's units. */
export interface SpellInfo {
  key: string;
  name: string;
  /** 0 for cantrips. */
  level: number;
  /** The school's full name ("Evocation"), or MPMB's abbreviation for one it doesn't name. */
  school: string;
  /** MPMB's short casting time: "Act", "Bns", "React", "1 min" … */
  time: string;
  range: string;
  duration: string;
  components: string;
  ritual: boolean;
  concentration: boolean;
  /** The saving throw's ability as MPMB writes it ("Dex"), or empty. */
  save: string;
  /** MPMB's one-line description, as the spell sheet shows it. */
  description: string;
  /** The full text (MPMB's descriptionFull), paragraphs separated by line breaks. */
  full: string;
  /** The first source the player has, abbreviated, with the page: "SRD'24 107". */
  source: string;
}

/** Cantrips, or the spells known or in the spellbook, of one source. */
export interface SpellPart {
  /** How many MPMB gives at this level (the spellbook's 20 is its number of drop-downs, not a limit). */
  count: number;
  /** How many more (or fewer) the player set in the dialog's number box. */
  offset: number;
  /** Spell keys, as chosen now. */
  chosen: string[];
  /** Spell keys the dialog's drop-downs offer, in MPMB's order. */
  list: string[];
}

/** One of the bonus spells a feature or item gives ("Cantrip", "1st-Level", "7 charges"). */
export interface SpellBonus {
  name: string;
  /** The spell key chosen, or empty. */
  chosen: string;
  list: string[];
  /** A row above the feature's own number (raised in Acrobat's dialog, kept in spCast.extraBo). */
  extra: boolean;
}

/** One of MPMB's spell sources (a CurrentSpells entry): a class, a feat, a species, a magic item. */
export interface SpellSource {
  /** MPMB's key: "wizard", "magic initiate [wizard]", "staff of the magi" … */
  key: string;
  /** The name MPMB's dialog has in its heading. */
  name: string;
  /** With the level: "Wizard (Evoker), level 10". */
  fullName: string;
  /** MPMB's typeSp: "book" (spellbook), "known", "list" (the whole class list), or another word. */
  type: string;
  level: number;
  /** The highest spell level the source can cast now, 0 when MPMB has none (items, feats). */
  maxLevel: number;
  cantrips: SpellPart | null;
  spells: SpellPart | null;
  /** "What spells to show?": MPMB's radio button number (1 to 4), 0 when the dialog has none. */
  show: number;
  /** The radio buttons the dialog has, with MPMB's labels. */
  showOptions: { id: number; name: string }[];
  /** "Prepare cantrips just like spells", or null when the dialog doesn't offer it. */
  preparedCantrips: boolean | null;
  bonus: SpellBonus[];
  /**
   * "Prepared spells only": what MPMB's PREPARED SPELLS DIALOG offers (count = how many MPMB lets the
   * character prepare), or null when the source has no such choice.
   */
  prepared: SpellPart | null;
  /** Spells a subclass or feature adds ("[always prepared]"), or null. */
  extra: { label: string; spells: string[] } | null;
}

export interface SpellSheetOptions {
  glossary: boolean;
  dashEmptyFields: boolean;
  amendSpellDescriptions: boolean;
  allowSpellAdd: boolean;
  useDependencies: boolean;
}

export interface SpellsInfo {
  /** In the order MPMB's dialogs come. */
  sources: SpellSource[];
  /** The order dialog: the sources on the spell sheet, in order (keys), and those left out. */
  included: string[];
  excluded: string[];
  options: SpellSheetOptions | null;
  /** Every spell the sources mention or offer, by key. */
  spells: Record<string, SpellInfo>;
}

/** What the player picked for one source; parts left out stay as they are. */
export interface SpellPicks {
  key: string;
  cantrips?: string[];
  spells?: string[];
  show?: number;
  preparedCantrips?: boolean;
  /** The bonus spells in the dialog's order: a key, '' for none; shorter keeps the rest. */
  bonus?: string[];
  /** The spells for "Prepared spells only". */
  prepared?: string[];
}

/** The order dialog's choices: the sources on the spell sheet in order, those left out, and its options. */
export interface SpellSheetPicks {
  included: string[];
  excluded: string[];
  options: SpellSheetOptions;
}

/** MPMB's dialogs on the way to a spell sheet, by their description names. */
const SPELL_DIALOGS = {
  select: 'SPELL SELECTION DIALOG',
  book: 'EXTRA SPELLBOOK SPELLS DIALOG',
  prepared: 'PREPARED SPELLS DIALOG',
  order: 'SPELL LIST GENERATION DIALOG',
} as const;

/**
 * MPMB's spell dialogs loaded with what CurrentSpells holds and closed with OK, as a player who changes
 * nothing would; null for every other pop-up (those still go to the player).
 */
export const answerSpellDialogs = (view: DialogView): DialogReply | null =>
  (Object.values(SPELL_DIALOGS) as string[]).includes(String(view.description.name ?? ''))
    ? { type: 'close', result: 'ok', state: view.state }
    : null;

/**
 * Runs in the sheet; returns SpellsInfo as JSON. ES5, next to MPMB's scripts. MPMB's drop-down lists are
 * [names to numbers, name to key, key to name] (CreateSpellObject); the numbers give the order.
 */
export const SPELLS_READ_SCRIPT = `(function () {
  var saved = What("CurrentSpells.Stringified");
  var realExec = app.execDialog;
  var out = { sources: [], included: [], excluded: [], options: null, spells: {} };
  var keysOf = function (list) {
    var names = list && list[0] ? Object.keys(list[0]) : [];
    names.sort(function (a, b) { return Math.abs(list[0][a]) - Math.abs(list[0][b]); });
    var keys = [];
    for (var i = 0; i < names.length; i++) if (list[1][names[i]]) keys.push(list[1][names[i]]);
    return keys;
  };
  var radios = function (elements, found) {
    for (var i = 0; elements && i < elements.length; i++) {
      var e = elements[i];
      if (e.type === "radio" && /^SpR\\d$/.test(e.item_id)) found.push({ id: Number(e.item_id.charAt(3)), name: String(e.name) });
      radios(e.elements, found);
    }
    return found;
  };
  var part = function (show, count, offset, chosen, list) {
    return show ? { count: Number(count) || 0, offset: Number(offset) || 0, chosen: (chosen || []).slice(), list: keysOf(list) } : null;
  };
  var noteSelect = function (dia) {
    var cast = CurrentSpells[dia.curCast] || {};
    var bonus = [];
    for (var b = 0; b < dia.nmbrBo + (Number(dia.offsetBo) || 0) && b < 20; b++) {
      bonus.push({ name: String(dia.namesBo[b] || ""), chosen: dia.selectBo[b] || "", list: keysOf(dia.listBo[b]), extra: b >= dia.nmbrBo });
    }
    var spells = part(dia.showSp, dia.nmbrSp, dia.offsetSp, (dia.selectSp || []).concat(cast.selectSpSB || []), dia.listSp);
    out.sources.push({
      key: dia.curCast, name: String(dia.header), fullName: String(dia.fullname), type: String(dia.typeSp || ""),
      level: Number(cast.level) || 0, maxLevel: Number(dia.levelSp) || 0,
      cantrips: part(dia.showCa, dia.nmbrCa, dia.offsetCa, dia.selectCa, dia.listCa),
      spells: spells,
      show: dia.showSpRadio ? Number(dia.selectSpRadio) || 0 : 0,
      showOptions: dia.showSpRadio ? radios(dia.description.elements, []) : [],
      preparedCantrips: dia.showCaPr ? !!dia.preparedCantrips : null,
      bonus: bonus,
      prepared: null,
      extra: dia.showAd ? { label: String(dia.nameAd), spells: (dia.selectAd || []).slice() } : null
    });
    // MPMB offers "Prepared spells only" here: chosen for this run, so MPMB opens its prepared spells
    // dialog next and shows what it offers. The real choice is noted above; CurrentSpells is put back after.
    var options = out.sources[out.sources.length - 1].showOptions;
    for (var o = 0; o < options.length; o++) if (options[o].id === 3) dia.selectSpRadio = 3;
  };
  var notePrepared = function (dia) {
    // The dialog works out how many the character may prepare when it opens (nmbrSp); its rows are
    // nmbrSp plus the number box's offset.
    dia.initialize({ enable: function () {}, load: function () {} });
    for (var s = out.sources.length - 1; s >= 0; s--) {
      if (out.sources[s].key !== dia.curCast) continue;
      out.sources[s].prepared = part(true, Number(dia.nmbrSp) + (Number(dia.offsetSp) || 0), dia.offsetSp, dia.selectSp, dia.listSp);
      break;
    }
  };
  app.execDialog = function (dia) {
    var name = dia && dia.description ? dia.description.name : "";
    if (name === "${SPELL_DIALOGS.select}") { noteSelect(dia); return "ok"; }
    if (name === "${SPELL_DIALOGS.prepared}") { notePrepared(dia); return "ok"; }
    if (name === "${SPELL_DIALOGS.book}") return "ok";
    if (name === "${SPELL_DIALOGS.order}") {
      out.included = (CurrentCasters.incl || []).slice();
      out.excluded = (CurrentCasters.excl || []).slice();
      out.options = {
        glossary: !!dia.glossary, dashEmptyFields: !!dia.dashEmptyFields,
        amendSpellDescriptions: !!dia.amendSpellDescriptions, allowSpellAdd: !!dia.allowSpellAdd,
        useDependencies: !!dia.useDependencies
      };
    }
    // The order dialog cancelled: MPMB stops before it makes any page.
    return "cancel";
  };
  try {
    AskUserSpellSheet();
  } finally {
    app.execDialog = realExec;
    // CurrentSpells back as it was, the way MPMB reads it when the sheet opens (GetStringifieds evals
    // the same text of its own; nothing here comes from outside the sheet).
    Value("CurrentSpells.Stringified", saved);
    var parts = saved.split("##########");
    CurrentSpells = eval(parts[0].charAt(0) === "(" ? parts[0] : "(" + parts[0] + ")");
    CurrentCasters = eval(parts[1].charAt(0) === "(" ? parts[1] : "(" + parts[1] + ")");
    FindWeapons();
  }
  var metric = What("Unit System") === "metric";
  var addSpell = function (key) {
    var s = SpellsList[key];
    if (!key || out.spells[key] || !s) return;
    var full = s.descriptionFull;
    var description = metric ? (s.descriptionMetric || ConvertToMetric(s.description || "", 0.5)) : (s.description || "");
    out.spells[key] = {
      key: key, name: getSpNm(key) || String(s.name), level: Number(s.level) || 0,
      school: String((spellSchoolList && spellSchoolList[s.school]) || s.school || ""),
      time: String(s.time || ""), range: String(metric ? (s.rangeMetric || ConvertToMetric(s.range || "", 0.5)) : (s.range || "")),
      // "Conc, 1 min": the concentration mark goes to its own flag, as on the Spells tab.
      duration: String(s.duration || "").replace(/^Conc,\\s*/i, ""), components: String(s.components || ""), ritual: !!s.ritual,
      concentration: /conc/i.test(String(s.duration || "")), save: String(s.save || ""),
      description: String(description),
      full: String(isArray(full) ? full.join("\\n") : (full || "")),
      source: stringSource(s, "first,abbr") || ""
    };
  };
  for (var i = 0; i < out.sources.length; i++) {
    var src = out.sources[i];
    var lists = [src.cantrips, src.spells, src.prepared];
    for (var l = 0; l < lists.length; l++) {
      if (!lists[l]) continue;
      for (var c = 0; c < lists[l].chosen.length; c++) addSpell(lists[l].chosen[c]);
      for (var k = 0; k < lists[l].list.length; k++) addSpell(lists[l].list[k]);
    }
    for (var b = 0; b < src.bonus.length; b++) {
      addSpell(src.bonus[b].chosen);
      for (var bl = 0; bl < src.bonus[b].list.length; bl++) addSpell(src.bonus[b].list[bl]);
    }
    if (src.extra) for (var e = 0; e < src.extra.spells.length; e++) addSpell(src.extra.spells[e]);
  }
  return JSON.stringify(out);
})()`;

export function readSpellsInfo(json: unknown): SpellsInfo {
  if (typeof json !== 'string') throw new Error('The sheet gave no spell information');
  return JSON.parse(json) as SpellsInfo;
}

/** MPMB's spellbook dialog has 20 drop-downs; the rest of a spellbook goes to its extra spellbook dialogs. */
const BOOK_ROWS = 20;

/**
 * Runs in the sheet: puts the picks into CurrentSpells where MPMB's spell dialogs load them from. A spellbook
 * longer than the dialog's 20 rows keeps the rest in `selectSpSB`, as MPMB's extra spellbook dialogs do; more
 * cantrips or spells than MPMB gives raise the dialog's number box (the offset), as typing a bigger number
 * there would. `counts` are SpellsInfo's numbers for the same sources.
 */
function spellPicksScript(
  picks: SpellPicks[],
  counts: Record<string, { cantrips: number; spells: number }>,
  sheet: SpellSheetPicks | null = null,
): string {
  const sets = picks.map((p) => {
    const count = counts[p.key] ?? { cantrips: 0, spells: 0 };
    return {
      key: p.key,
      cantrips: p.cantrips,
      offsetCa: p.cantrips ? Math.max(0, p.cantrips.length - count.cantrips) : undefined,
      spells: p.spells,
      offsetSp: p.spells ? Math.max(0, p.spells.length - count.spells) : undefined,
      show: p.show,
      preparedCantrips: p.preparedCantrips,
      bonus: p.bonus,
      prepared: p.prepared,
    };
  });
  // The bonus spells' choices live in the feature's own bonus entries (spCast.bonus[key], one object or a
  // list, each maybe "times" over), where AskUserSpellSheet loads them from: walked in the same order as
  // MPMB's dialog counts them, so the n-th pick lands on the dialog's n-th bonus drop-down.
  return `(function (sets, sheet) {
    var setBonus = function (cast, picks) {
      var n = 0;
      for (var bKey in cast.bonus) {
        var entry = cast.bonus[bKey];
        var list = isArray(entry) ? entry : [entry];
        for (var i = 0; i < list.length; i++) {
          var times = !list[i].times ? 1 : isArray(list[i].times) ? list[i].times[Math.min(list[i].times.length, cast.level) - 1] : list[i].times;
          for (var y = 0; y < times; y++, n++) {
            if (n >= picks.length) continue;
            if (!list[i].selection) list[i].selection = [];
            list[i].selection[y] = picks[n] || undefined;
          }
        }
      }
    };
    for (var i = 0; i < sets.length; i++) {
      var p = sets[i];
      var cast = CurrentSpells[p.key];
      if (!cast) continue;
      if (p.cantrips) { cast.selectCa = p.cantrips; cast.offsetCa = p.offsetCa; }
      if (p.spells) {
        if (cast.typeSp === "book") {
          cast.selectSp = p.spells.slice(0, ${BOOK_ROWS});
          if (p.spells.length > ${BOOK_ROWS}) cast.selectSpSB = p.spells.slice(${BOOK_ROWS}); else delete cast.selectSpSB;
        } else {
          cast.selectSp = p.spells;
          cast.offsetSp = p.offsetSp;
        }
      }
      if (p.show) cast.typeList = p.show;
      if (p.preparedCantrips !== undefined) cast.preparedCantrips = p.preparedCantrips;
      if (p.prepared) cast.selectPrep = p.prepared;
      if (p.bonus) setBonus(cast, p.bonus);
    }
    if (sheet) {
      CurrentCasters.incl = sheet.included;
      CurrentCasters.excl = sheet.excluded;
      CurrentCasters.glossary = sheet.options.glossary;
      CurrentCasters.emptyFields = !sheet.options.dashEmptyFields;
      CurrentCasters.amendSpDescr = sheet.options.amendSpellDescriptions;
      CurrentCasters.allowSpellAdd = sheet.options.allowSpellAdd;
      CurrentCasters.useDependencies = sheet.options.useDependencies;
    }
    SetStringifieds("spells");
  })(${JSON.stringify(sets)}, ${JSON.stringify(sheet)})`;
}

/** MPMB's Spells menu entry "(Re)generate a Spell Sheet", as the menu itself calls it. */
const GENERATE_SCRIPT = 'MakeSpellMenu_SpellOptions(["ssheet", "generate"])';

/** A spell on the sheet, by its source and key: what stays the same spell across a new spell sheet. */
const preparedOnSheet = (engine: Engine): Set<string> =>
  new Set(
    readSpells(viewsOf(engine.doc)).flatMap((source) =>
      source.levels.flatMap((l) =>
        l.spells.filter((s) => s.mark.prepared === true).map((s) => `${source.key}|${s.key}`),
      ),
    ),
  );

/**
 * The Spells step's "Update spell sheet": the picks into CurrentSpells, then MPMB's "(Re)generate a Spell
 * Sheet" with the app pressing OK in each spell dialog (other pop-ups on the way still go to the player).
 * MPMB's new pages start with no spell ticked as prepared; the spells that were prepared and are still
 * there get their tick back, by a click on MPMB's own box as the player would do.
 */
export function applySpellPicks(
  engine: Engine,
  picks: SpellPicks[],
  answered: (answer: (view: DialogView) => DialogReply | null, job: () => void) => void,
  sheet: SpellSheetPicks | null = null,
): void {
  const info = readSpellsInfo(engine.evaluate(SPELLS_READ_SCRIPT));
  const counts = Object.fromEntries(
    info.sources.map((s) => [s.key, { cantrips: s.cantrips?.count ?? 0, spells: s.spells?.count ?? 0 }]),
  );
  const prepared = preparedOnSheet(engine);
  engine.evaluate(spellPicksScript(picks, counts, sheet));
  answered(answerSpellDialogs, () => engine.evaluate(GENERATE_SCRIPT));
  engine.runTimers();
  readSpells(viewsOf(engine.doc))
    .flatMap((source) =>
      source.levels.flatMap((l) =>
        l.spells.filter((s) => s.mark.prepared === false && prepared.has(`${source.key}|${s.key}`)),
      ),
    )
    .forEach((spell) => engine.click(checkboxField(spell)));
}

/** MPMB's cReturn for "Insert empty rows" > "1 empty row" in a spell row's menu. */
const INSERT_ONE_ROW = 'insert#1#';
/** MPMB's cReturn for "Delete row" in a spell row's menu (moves the rows below it up). */
const DELETE_ROW = 'delete';

/** Row menu picks that only make sense on a row that is already there (newSpellRow skips them). */
const NOT_ON_A_NEW_ROW = ['move up', 'move down', 'clear', DELETE_ROW];

/** How newSpellRow gets menus answered: by the app (`answered`), or by the player without MPMB seeing it. */
export interface RowMenus {
  /** Runs the job with the first menu it opens answered by the app with this cReturn. */
  answered: (answer: string, job: () => void) => void;
  /** Runs the job with its first menu shown to the player; MPMB gets "nothing". Returns the player's pick. */
  peeked: (job: () => void) => string | null;
}

/**
 * A level's "+ Row" (M7): MPMB's row menu on a new row at `box`, the check box of the row under the
 * level's last spell. When that row is in use (`used`: the next level's divider), the new row needs MPMB's
 * own "Insert empty rows" first, and that can't be undone cleanly: MPMB's "Delete row" renumbers the
 * dividers and leaves one that was pushed over a page break on the old page. So the player picks first,
 * from MPMB's menu for that same row as it is now (same row number, so the same entries and limits);
 * MPMB gets "nothing" back and changes nothing. Only after a pick does MPMB insert the empty row (answered
 * by the app) and apply the pick there. Closing the menu leaves the sheet exactly as it was.
 */
export function newSpellRow(engine: Engine, box: string, used: boolean, menus: RowMenus): void {
  if (!used) {
    engine.click(box, 0, true);
    return;
  }
  const picked = menus.peeked(() => engine.click(box, 0, true));
  // Moving, clearing or deleting a row that isn't there yet is the same as not adding it.
  if (!picked || NOT_ON_A_NEW_ROW.includes(picked)) return;
  // "Insert empty rows" asked for the new rows themselves: MPMB inserts them here, and that is all.
  if (picked.startsWith('insert#')) {
    menus.answered(picked, () => engine.click(box, 0, true));
    return;
  }
  menus.answered(INSERT_ONE_ROW, () => engine.click(box, 0, true));
  menus.answered(picked, () => engine.click(box, 0, true));
  // Should the empty row's menu not offer the pick after all, take the row out again rather than leave a
  // line the tab can't show (MPMB's "Delete row" is not a clean undo, see above, but better than a gap).
  const remember = box.replace('spells.checkbox.', 'spells.remember.');
  if (valueOf(viewsOf(engine.doc), remember) === '') menus.answered(DELETE_ROW, () => engine.click(box, 0, true));
}
