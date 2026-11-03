// What the Build screen (M6) needs to know from MPMB's own data: the classes it offers (from the sources
// the player chose) with their subclasses, the classes the character has, and what each next level brings.
// Read inside the sheet, where MPMB keeps it in globals (ClassList, ClassSubList, classes.known), and
// handed out as JSON, since objects of the script realm can't leave it as they are.
import { CHOICES_SCRIPT, choicesOf } from './choices.ts';
import type { Choice, RawChoices } from './choices.ts';
import type { DialogReply, DialogView } from './host.ts';
import { GEAR_SCRIPT } from './gear.ts';
import type { GearInfo } from './gear.ts';
import { ORIGINS_SCRIPT } from './origins.ts';
import type { OriginsInfo } from './origins.ts';
import { SCORES_SCRIPT } from './scores.ts';
import type { ScoresInfo } from './scores.ts';

export interface SubclassInfo {
  /** MPMB's key in ClassSubList, e.g. "paladin-devotion". */
  key: string;
  /** As MPMB writes it in brackets after the class, e.g. "Oath of Devotion". */
  name: string;
  /** The first source the player has, as MPMB abbreviates it, with the page: "SRD'24 56". */
  source: string;
}

export interface ClassInfo {
  key: string;
  name: string;
  /** The hit die's size: 10 for d10. */
  die: number;
  source: string;
  /** What multiclassing into it needs, as MPMB writes it ("Strength 13 and Charisma 13"); may be empty. */
  prereqs: string;
  subclasses: SubclassInfo[];
  /** The features a first level of this class brings, by name. */
  firstFeatures: string[];
}

export interface KnownClass {
  key: string;
  level: number;
  /** ClassSubList key, or empty while the character has no subclass. */
  subclass: string;
  /** The features its next level brings (class and subclass), by name. */
  nextFeatures: string[];
  /**
   * Whether its next level brings a feat (Ability Score Improvement, Epic Boon). MPMB keeps these out of
   * the features, in the class's `improvements` count per level.
   */
  nextFeat: boolean;
}

export interface BuilderInfo {
  classes: ClassInfo[];
  /** The character's classes, the first one (whose proficiencies the character has) first. */
  known: KnownClass[];
  /** The experience points each level starts at; index 1 is level 2. */
  xpTable: number[];
  /** Species, backgrounds and feats (origins.ts). */
  origins: OriginsInfo;
  /** The ability score columns (scores.ts). */
  scores: ScoresInfo;
  /** What the class features, species and feats let the player choose, from MPMB's menus (choices.ts). */
  choices: Choice[];
  /**
   * MPMB's tools (ToolsList, add-on scripts included), as MPMB writes them on the sheet: "Thieves' Tools".
   * The "Skills & languages" step offers them.
   */
  tools: string[];
  /** What MPMB's armour and attack drop-downs offer, for the "Armour & weapons" step (gear.ts). */
  gear: GearInfo;
  /**
   * The names of the sources the lists use: MPMB's books and the sources add-on scripts bring, without
   * those switched off in Source Selection. Build steps name them under their lists.
   */
  sources: string[];
}

/**
 * The sources switched on, as SourceList names them. MPMB's catch-all "Homebrew" (group "default") holds
 * no content of its own and is left out. ES5.
 */
const SOURCES_SCRIPT = `(function () {
  var out = [];
  for (var key in SourceList) {
    var src = SourceList[key];
    if (!src || src.group === 'default' || CurrentSources.globalExcl.indexOf(key) !== -1) continue;
    out.push(String(src.name || key));
  }
  return JSON.stringify(out);
})()`;

/** MPMB's tool names with each word capitalised, as the sheet shows them ("Cook's Utensils"). ES5. */
const TOOLS_SCRIPT = `(function () {
  var out = [];
  for (var key in ToolsList) {
    var name = String((ToolsList[key] && ToolsList[key].name) || key);
    // The first letter of each word: "cook's utensils" becomes "Cook's Utensils" (not "Cook'S"). Try it:
    // https://regex101.com/?regex=(%5E%7C%5Cs)(%5CS)&flags=g&testString=cook%27s%20utensils
    name = name.replace(/(^|\\s)(\\S)/g, function (all, space, first) { return space + first.toUpperCase(); });
    if (out.indexOf(name) === -1) out.push(name);
  }
  return JSON.stringify(out);
})()`;

/**
 * Runs in the sheet and returns the classes part of BuilderInfo as JSON. ES5 only: it runs next to MPMB's own scripts, in the
 * same dialect. `testSource` is MPMB's check against the player's source choices ("classExcl" holds the
 * classes and subclasses switched off in the Source Material dialog).
 */
const CLASSES_SCRIPT = `(function () {
  var source = function (obj) { return stringSource(obj, 'first,abbr') || ''; };
  var featuresAt = function (obj, level) {
    var names = [];
    var list = (obj && obj.features) || {};
    for (var f in list) if (list[f] && list[f].minlevel === level && list[f].name) names.push(String(list[f].name));
    return names;
  };
  var out = { classes: [], known: [], xpTable: [] };
  for (var key in ClassList) {
    var c = ClassList[key];
    if (!c || !c.name || testSource(key, c, 'classExcl')) continue;
    var subs = [];
    var subKeys = (c.subclasses && c.subclasses[1]) || [];
    for (var i = 0; i < subKeys.length; i++) {
      var s = ClassSubList[subKeys[i]];
      if (!s || testSource(subKeys[i], s, 'classExcl')) continue;
      subs.push({ key: subKeys[i], name: String(s.subname || s.fullname || subKeys[i]), source: source(s) });
    }
    out.classes.push({
      key: key, name: String(c.name), die: Number(c.die) || 0, source: source(c),
      prereqs: typeof c.prereqs === 'string' ? c.prereqs : '', subclasses: subs, firstFeatures: featuresAt(c, 1)
    });
  }
  var order = [];
  if (classes.primary && classes.known[classes.primary]) order.push(classes.primary);
  for (var k in classes.known) if (order.indexOf(k) === -1) order.push(k);
  for (var j = 0; j < order.length; j++) {
    var kn = classes.known[order[j]];
    var next = kn.level + 1;
    var imp = (ClassList[order[j]] && ClassList[order[j]].improvements) || [];
    out.known.push({
      key: order[j], level: kn.level, subclass: kn.subclass || '',
      nextFeatures: featuresAt(ClassList[order[j]], next).concat(kn.subclass ? featuresAt(ClassSubList[kn.subclass], next) : []),
      nextFeat: next <= imp.length && Number(imp[next - 1]) > Number(imp[next - 2] || 0)
    });
  }
  for (var x = 0; x < ExperiencePointsList.length; x++) out.xpTable.push(Number(ExperiencePointsList[x]) || 0);
  return JSON.stringify(out);
})()`;

/** The readings in one, so the Build screen gets them from one moment of the sheet. */
export const BUILDER_INFO_SCRIPT = `(function () {
  var info = JSON.parse(${CLASSES_SCRIPT});
  info.origins = JSON.parse(${ORIGINS_SCRIPT});
  info.scores = JSON.parse(${SCORES_SCRIPT});
  info.choices = JSON.parse(${CHOICES_SCRIPT});
  info.tools = JSON.parse(${TOOLS_SCRIPT});
  info.gear = JSON.parse(${GEAR_SCRIPT});
  info.sources = JSON.parse(${SOURCES_SCRIPT});
  return JSON.stringify(info);
})()`;

export function readBuilderInfo(json: unknown): BuilderInfo {
  if (typeof json !== 'string') throw new Error('The sheet gave no builder information');
  const info = JSON.parse(json) as Omit<BuilderInfo, 'choices'> & { choices: RawChoices };
  return { ...info, choices: choicesOf(info.choices) };
}

/** The name of MPMB's units dialog, which the app answers itself for the sheet menu's units switch. */
const UNITS_DIALOG = 'SET UNIT SYSTEM AND DECIMAL SEPARATOR';
export type UnitSystem = 'imperial' | 'metric';

/**
 * The answer to MPMB's units dialog that the player would give for this unit system: its two radio
 * buttons set, the decimal separator left as it is, OK. Other dialogs get null (the player answers).
 */
export const answerUnits =
  (system: UnitSystem) =>
  (view: DialogView): DialogReply | null =>
    view.description.name === UNITS_DIALOG
      ? {
          type: 'close',
          result: 'ok',
          state: { ...view.state, SyIm: system === 'imperial', SyMe: system === 'metric' },
        }
      : null;
