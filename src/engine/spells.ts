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
}

/** MPMB's dialogs on the way to a spell sheet, by their description names. */
export const SPELL_DIALOGS = {
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
      bonus.push({ name: String(dia.namesBo[b] || ""), chosen: dia.selectBo[b] || "", list: keysOf(dia.listBo[b]) });
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
      extra: dia.showAd ? { label: String(dia.nameAd), spells: (dia.selectAd || []).slice() } : null
    });
  };
  app.execDialog = function (dia) {
    var name = dia && dia.description ? dia.description.name : "";
    if (name === "${SPELL_DIALOGS.select}") { noteSelect(dia); return "ok"; }
    if (name === "${SPELL_DIALOGS.book}" || name === "${SPELL_DIALOGS.prepared}") return "ok";
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
    var lists = [src.cantrips, src.spells];
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
export function spellPicksScript(
  picks: SpellPicks[],
  counts: Record<string, { cantrips: number; spells: number }>,
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
    };
  });
  return `(function (sets) {
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
    }
    SetStringifieds("spells");
  })(${JSON.stringify(sets)})`;
}

/** MPMB's Spells menu entry "(Re)generate a Spell Sheet", as the menu itself calls it. */
export const GENERATE_SCRIPT = 'MakeSpellMenu_SpellOptions(["ssheet", "generate"])';

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
): void {
  const info = readSpellsInfo(engine.evaluate(SPELLS_READ_SCRIPT));
  const counts = Object.fromEntries(
    info.sources.map((s) => [s.key, { cantrips: s.cantrips?.count ?? 0, spells: s.spells?.count ?? 0 }]),
  );
  const prepared = preparedOnSheet(engine);
  engine.evaluate(spellPicksScript(picks, counts));
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
