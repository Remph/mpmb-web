// What the Build screen's Choices step (M6) needs: the choices the class features, the species and the
// feats offer, as MPMB offers them in its own menus ("Class Features Menu", "Race Features Menu" and each
// feat line's button). The sheet builds those menus (MakeClassMenu, MakeRaceMenu, MakeFeatMenu_FeatOptions);
// this reads them, and a pick presses the same button with the menu answered in the player's place, so
// MPMB applies it exactly as after the player's own pick (the worker's `pick` command).

/** One entry of an MPMB menu, as the read script hands it out. */
export interface RawMenuItem {
  name: string;
  /** What picking it returns to MPMB (its cReturn); empty for a group or a separator. */
  value: string;
  marked: boolean;
  enabled: boolean;
  /** MPMB's short description of the option, where its lists have one. */
  description: string;
  children: RawMenuItem[];
}

export interface RawChoices {
  /** Menus.classfeatures; empty without class features that offer a choice. */
  classes: RawMenuItem[];
  /** The species' variants (Menus.raceoptions), with the species as MPMB names it; null without any. */
  species: { name: string; items: RawMenuItem[] } | null;
  /** Feats with several forms ("Change type of …" in the feat line's menu), by feat line. */
  feats: { line: number; name: string; items: RawMenuItem[] }[];
}

export interface ChoiceOption {
  /** As MPMB names it, without the source: "Defense". */
  label: string;
  /** "SRD'24 88"; empty where MPMB gives none. */
  source: string;
  /** The answer to MPMB's menu that picks it (or, when chosen, takes it back where MPMB allows that). */
  value: string;
  chosen: boolean;
  /** False where MPMB greys it out (a prerequisite the character doesn't meet). */
  enabled: boolean;
  description: string;
}

export interface ChoiceSection {
  /** MPMB's group in the menu ("Level 5+", "Martial Weapons"); empty for options outside a group. */
  heading: string;
  options: ChoiceOption[];
}

export type ChoiceKind = 'class' | 'species' | 'feat';

export interface Choice {
  /** Unique on the page: the button and the choice's name. */
  id: string;
  kind: ChoiceKind;
  /** The button whose menu offers it. */
  field: string;
  /** Whose choice it is: "Paladin (Oath of Devotion)", "Silver Dragonborn", "Magic Initiate". */
  owner: string;
  /** The class feature: "Fighting Style", "Weapon Mastery". Empty for a species variant or feat form. */
  name: string;
  /** Several options may be chosen (MPMB's "extra choices": invocations, weapon masteries). */
  many: boolean;
  /** How many MPMB counts as chosen, and how many the level allows (null: no number given). */
  selected: number;
  allowed: number | null;
  /** The labels of the chosen options. */
  chosen: string[];
  /** Still to be chosen: nothing yet, or fewer than allowed. */
  open: boolean;
  sections: ChoiceSection[];
}

/**
 * MPMB's count after an extra choice's name.
 * Try it: https://regex101.com/?regex=%5E(.*)%20%5C(selected%20(%5Cd%2B)(%3F%3A%20of%20(%5Cd%2B))%3F%5C)%24&testString=Weapon%20Mastery%20(selected%200%20of%202)
 */
const SELECTED = /^(.*) \(selected (\d+)(?: of (\d+))?\)$/;

/**
 * MPMB puts the source after a tab, in brackets: "Defense   \t[SRD'24 88]".
 * Try it: https://regex101.com/?regex=%5E(%5B%5E%5Ct%5D*)%5Ct%5Cs*%5C%5B(.*)%5C%5D%5Cs*%24&testString=Defense%20%20%20%09%5BSRD%2724%2088%5D
 */
const WITH_SOURCE = /^([^\t]*)\t\s*\[(.*)\]\s*$/;

const isSeparator = (item: RawMenuItem): boolean => item.name === '-';

function optionOf(item: RawMenuItem): ChoiceOption {
  const match = WITH_SOURCE.exec(item.name);
  return {
    label: (match ? (match[1] ?? '') : item.name).trim(),
    source: match ? (match[2] ?? '').trim() : '',
    value: item.value,
    chosen: item.marked,
    enabled: item.enabled,
    description: item.description.trim(),
  };
}

/** A group's name without MPMB's source and the double spaces of its padding. */
function headingOf(name: string): string {
  const match = WITH_SOURCE.exec(name);
  return (match ? (match[1] ?? '') : name).replace(/\s+/g, ' ').trim();
}

/** The options outside groups first, then each group (a group in a group reads "Outer › Inner"). */
function groupsOf(items: RawMenuItem[], heading = ''): ChoiceSection[] {
  const kept = items.filter((item) => !isSeparator(item));
  const loose = kept.filter((item) => !item.children.length && item.value);
  const groups = kept.filter((item) => item.children.length);
  const own = loose.length ? [{ heading, options: loose.map(optionOf) }] : [];
  return own.concat(
    groups.flatMap((group) =>
      groupsOf(group.children, heading ? `${heading} › ${headingOf(group.name)}` : headingOf(group.name)),
    ),
  );
}

/**
 * Each option once. MPMB's menus offer the same option in several groups, as different ways to find it
 * (weapon masteries by weapon type and again by mastery; invocations by level and again by the pact they
 * improve); a list on the page would repeat them. The biggest group takes its options first, then the
 * biggest of the rest, and so on: what stays is the main grouping (by weapon type, by level), and groups
 * left empty disappear. The groups keep MPMB's order.
 */
function withoutRepeats(sections: ChoiceSection[]): ChoiceSection[] {
  const placed = new Map<string, number>();
  const left = new Set(sections.map((_, i) => i));
  const unplaced = (i: number): number => (sections[i]?.options ?? []).filter((o) => !placed.has(o.value)).length;
  while (left.size) {
    const best = [...left].reduce((a, b) => (unplaced(b) > unplaced(a) ? b : a));
    left.delete(best);
    sections[best]?.options.forEach((o) => {
      if (!placed.has(o.value)) placed.set(o.value, best);
    });
  }
  return sections
    .map((s, i) => ({ heading: s.heading, options: s.options.filter((o) => placed.get(o.value) === i) }))
    .filter((s) => s.options.length);
}

const sectionsOf = (items: RawMenuItem[]): ChoiceSection[] => withoutRepeats(groupsOf(items));

interface ChoiceStart {
  kind: ChoiceKind;
  field: string;
  owner: string;
  /** The menu entry's name, with MPMB's count when it has one. */
  title: string;
  items: RawMenuItem[];
}

function choiceOf({ kind, field, owner, title, items }: ChoiceStart): Choice {
  const count = SELECTED.exec(title);
  const sections = sectionsOf(items);
  const chosen = sections.flatMap((s) => s.options.filter((o) => o.chosen).map((o) => o.label));
  const many = Boolean(count);
  const selected = count ? Number(count[2]) : chosen.length;
  const allowed = count?.[3] ? Number(count[3]) : null;
  const name = count ? (count[1] ?? title) : title;
  return {
    // Without the count, which changes with every pick: the page keeps the choice open across picks.
    id: `${field}|${owner}|${name}`,
    kind,
    field,
    owner,
    name,
    many,
    selected,
    allowed,
    chosen,
    open: many ? allowed !== null && selected < allowed : !chosen.length,
    sections,
  };
}

const CLASS_MENU = 'Class Features Menu';
const SPECIES_MENU = 'Race Features Menu';

/** The choices in the order of the sheet: each class's features, the species, then the feats. */
export function choicesOf(raw: RawChoices): Choice[] {
  const classes = raw.classes
    .filter((item) => !isSeparator(item) && item.children.length)
    .flatMap((top): ChoiceStart[] =>
      // A "Bonus … (selected 1 of 2)" entry (a feat granting another class's invocation) is a choice
      // itself; every other entry is a class with its features below.
      SELECTED.test(top.name)
        ? [{ kind: 'class', field: CLASS_MENU, owner: '', title: top.name, items: top.children }]
        : top.children
            .filter((feature) => !isSeparator(feature) && feature.children.length)
            .map((feature) => ({
              kind: 'class',
              field: CLASS_MENU,
              owner: top.name,
              title: feature.name,
              items: feature.children,
            })),
    );
  const species: ChoiceStart[] = raw.species
    ? [{ kind: 'species', field: SPECIES_MENU, owner: raw.species.name, title: '', items: raw.species.items }]
    : [];
  const feats = raw.feats.map((feat): ChoiceStart => ({
    kind: 'feat',
    field: `Feat Button ${feat.line}`,
    owner: feat.name,
    title: '',
    items: feat.items,
  }));
  return [...classes, ...species, ...feats].map(choiceOf);
}

/**
 * Runs in the sheet and returns RawChoices as JSON. ES5, next to MPMB's scripts. It builds the menus with
 * MPMB's own functions, the way its buttons do before they show them; those only fill `Menus`.
 */
export const CHOICES_SCRIPT = `(function () {
  var desc = function (obj) { return obj && obj.description ? String(obj.description) : ''; };
  // The option behind a class feature menu entry: "paladin#fighting style#Defense##add".
  var classDesc = function (value) {
    var parts = value.split('#');
    var cl = CurrentClasses[parts[0]];
    var fea = cl && cl.features[parts[1]];
    return parts.length > 2 && fea ? desc(fea[String(parts[2]).toLowerCase()]) : '';
  };
  var copy = function (items, describe) {
    var out = [];
    var arr = isArray(items) ? items : items ? [items] : [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (!it) continue;
      var value = it.cReturn ? String(it.cReturn) : '';
      out.push({
        name: String(it.cName), value: value, marked: !!it.bMarked, enabled: it.bEnabled !== false,
        description: value && describe ? describe(value) : '', children: copy(it.oSubMenu, describe)
      });
    }
    return out;
  };
  var out = { classes: [], species: null, feats: [] };
  if (MakeClassMenu()) out.classes = copy(Menus.classfeatures, classDesc);

  MakeRaceMenu();
  var race = Menus.raceoptions;
  if (race.length && race[0].cReturn !== 'nothing') {
    var raceName = What('Race') || (RaceList[CurrentRace.known] ? RaceList[CurrentRace.known].name : '');
    out.species = { name: String(raceName), items: copy(race) };
  }

  for (var n = 1; n <= FieldNumbers.feats; n++) {
    var key = CurrentFeats.known[n - 1];
    var feat = key && FeatsList[key];
    if (!feat || !feat.choices) continue;
    MakeFeatMenu_FeatOptions('justMenu', n);
    var featDesc = function (value) { return desc(feat[value.split('#')[2]]) || desc(feat); };
    for (var m = 0; m < Menus.feats.length; m++) {
      var entry = Menus.feats[m];
      if (entry.oSubMenu && /^Change type of /.test(entry.cName)) {
        out.feats.push({ line: n, name: String(feat.name), items: copy(entry.oSubMenu, featDesc) });
      }
    }
  }
  return JSON.stringify(out);
})()`;

/**
 * Whether the answer is one the menu offers and allows, anywhere in it: the page's list may be a moment
 * older than the sheet, and an answer MPMB no longer offers would make it apply something else.
 */
export function offers(
  items: readonly { cReturn?: string; bEnabled?: boolean; oSubMenu?: unknown }[],
  answer: string,
): boolean {
  return items.some(
    (item) =>
      (item.cReturn === answer && item.bEnabled !== false) ||
      (Array.isArray(item.oSubMenu) && offers(item.oSubMenu as typeof items, answer)),
  );
}
