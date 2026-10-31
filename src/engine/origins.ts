// What the Build screen's species, background and feats steps (M6) need from MPMB's own lists: what it
// offers from the sources the player chose (and their add-on scripts), and what the character has. Read
// inside the sheet, where MPMB keeps it (RaceList, RaceSubList, BackgroundList, FeatsList and the
// Current* globals), and handed out as JSON. The page writes the choice into MPMB's own fields ("Race",
// "Background", "Feat Name 1"…), as if the player had typed it, and MPMB does the rest.

export interface SpeciesFacts {
  /** MPMB's size numbers: 3 is Medium, 4 is Small (2 Large, 5 Tiny); several when the player picks. */
  size: number[];
  /** The walking speed in the sheet's units, as MPMB converts it: "30 ft" or "9 m". */
  speed: string;
  /** Darkvision and the like, in the sheet's units: "Darkvision 18 m". MPMB's English. */
  vision: string[];
}

export interface SpeciesVariant extends SpeciesFacts {
  /** MPMB's variant key, e.g. "silver" (RaceSubList key "dragonborn-silver"). */
  key: string;
  /** The text for the "Race" field that MPMB recognises: "Silver Dragonborn". */
  name: string;
  /** Short, for a chip next to the species' name: "Silver". */
  label: string;
  source: string;
  /** MPMB's trait text with its marks (##◆ Breath Weapon##), one line per trait, in the sheet's units. */
  traits: string;
}

export interface SpeciesInfo extends SpeciesFacts {
  key: string;
  name: string;
  source: string;
  /** As SpeciesVariant.traits; may hold MPMB's placeholder DAMAGE_TYPE that a variant fills in. */
  traits: string;
  variants: SpeciesVariant[];
}

export interface BackgroundVariant {
  key: string;
  /** The text for the "Background" field. */
  name: string;
  source: string;
}

export interface BackgroundInfo {
  key: string;
  name: string;
  source: string;
  skills: string[];
  tools: string[];
  /** MPMB's text about the ability score increase (English), e.g. "+2 to one and +1 to another -or- …". */
  scoresText: string;
  /** The abilities the increase may go to (0 Strength … 5 Charisma), read from scoresText. */
  abilities: number[];
  variants: BackgroundVariant[];
}

export interface FeatChoice {
  /** MPMB's key of the choice, e.g. "cleric". */
  key: string;
  /** As MPMB lists it: "Cleric". */
  name: string;
  /** The text for a "Feat Name" field that MPMB recognises with this choice: "Magic Initiate [Cleric]". */
  text: string;
}

export interface FeatInfo {
  key: string;
  name: string;
  source: string;
  /** MPMB's feat type: "origin", "general", "fighting style", "epic boon"; empty for older add-ons. */
  type: string;
  /** As MPMB writes it ("Level 4+, Strength or Dexterity 13+"); empty without one. */
  prerequisite: string;
  /** Whether the character meets it, by MPMB's own test; null when the feat has no test. */
  meets: boolean | null;
  /** MPMB's short description (the one it writes on the sheet). */
  description: string;
  choices: FeatChoice[];
  /** Whether the character already has it and can't take it twice. */
  taken: boolean;
}

export interface OriginsInfo {
  species: SpeciesInfo[];
  backgrounds: BackgroundInfo[];
  feats: FeatInfo[];
  /** The character's species and background as MPMB recognised them; empty keys when none. */
  race: { key: string; variant: string };
  background: { key: string; variant: string };
  /** The nine feat lines: what MPMB recognised in each "Feat Name" field (empty key: nothing). */
  featLines: { key: string; choice: string }[];
}

/**
 * Runs in the sheet and returns OriginsInfo as JSON. ES5, next to MPMB's scripts. `testSource` is true for
 * what the player switched off in the Source Material dialog; `ConvertToMetric` is MPMB's own conversion,
 * with the rounding (0.5) its species traits use, so the texts read as they will on the sheet.
 */
export const ORIGINS_SCRIPT = `(function () {
  var metric = What('Unit System') === 'metric';
  var units = function (txt) { return metric ? ConvertToMetric(txt, 0.5) : txt; };
  var source = function (obj) { return stringSource(obj, 'first,abbr') || ''; };
  var list = function (val) { return isArray(val) ? val : val || val === 0 ? [val] : []; };
  var traitText = function (trait) {
    var out = [];
    var arr = list(trait);
    for (var i = 0; i < arr.length; i++) {
      var line = String(arr[i]);
      // A line that is only the name in bold: the page shows the name already.
      if (/^\\*\\*[^*]+\\*\\*$/.test(line)) continue;
      out.push(units(line));
    }
    return out.join('\\n');
  };
  var facts = function (obj, base) {
    var size = obj.size !== undefined ? list(obj.size) : base ? base.size : [];
    var spd = obj.speed && obj.speed.walk ? obj.speed.walk.spd : undefined;
    var speed = spd === undefined ? (base ? base.speed : '') : isNaN(spd) ? String(spd) : units(spd + ' ft');
    var vision = base ? base.vision : [];
    if (obj.vision) {
      vision = [];
      for (var v = 0; v < obj.vision.length; v++) {
        var vis = list(obj.vision[v]);
        var range = vis[1];
        vision.push(String(vis[0]) + (range && !isNaN(range) ? ' ' + units(range + ' ft') : range ? ' ' + range : ''));
      }
    }
    return { size: size, speed: speed, vision: vision };
  };
  var byName = function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; };
  var out = { species: [], backgrounds: [], feats: [], featLines: [] };

  for (var key in RaceList) {
    var r = RaceList[key];
    if (!r || !r.name || testSource(key, r, 'racesExcl')) continue;
    var sp = facts(r);
    sp.key = key; sp.name = String(r.name); sp.source = source(r); sp.traits = traitText(r.trait); sp.variants = [];
    var vars = r.variants || [];
    for (var i = 0; i < vars.length; i++) {
      var subKey = key + '-' + vars[i];
      var s = RaceSubList[subKey];
      if (!s || testSource(subKey, s, 'racesExcl')) continue;
      // Named as MPMB names a variant without a name of its own in its species menu.
      var name = s.name ? String(s.name) : vars[i].charAt(0).toUpperCase() + vars[i].slice(1) + ' ' + r.name;
      var suffix = ' ' + r.name;
      var v = facts(s, sp);
      v.key = vars[i]; v.name = name;
      v.label = name.length > suffix.length && name.slice(-suffix.length) === suffix ? name.slice(0, -suffix.length) : name;
      v.source = s.source ? source(s) : sp.source;
      v.traits = s.trait ? traitText(s.trait) : sp.traits;
      sp.variants.push(v);
    }
    out.species.push(sp);
  }
  out.species.sort(byName);

  var abilityNames = [/strength|\\bstr\\b/i, /dexterity|\\bdex\\b/i, /constitution|\\bcon\\b/i, /intelligence|\\bint\\b/i, /wisdom|\\bwis\\b/i, /charisma|\\bcha\\b/i];
  for (var bKey in BackgroundList) {
    var b = BackgroundList[bKey];
    if (!b || !b.name || testSource(bKey, b, 'backgrExcl')) continue;
    var txt = b.scorestxt ? String(b.scorestxt) : '';
    var abilities = [];
    // The same reading of the text MPMB uses to mark the abilities in its dialog.
    for (var a = 0; a < 6; a++) if (abilityNames[a].test(txt)) abilities.push(a);
    var names = function (val) {
      var arr = list(val), res = [];
      for (var n = 0; n < arr.length; n++) res.push(String(isArray(arr[n]) ? arr[n][0] : arr[n]));
      return res;
    };
    var bVars = [];
    var bv = b.variant || [];
    for (var j = 0; j < bv.length; j++) {
      var bs = BackgroundSubList[bv[j]];
      if (!bs || testSource(bv[j], bs, 'backgrExcl')) continue;
      bVars.push({ key: bv[j], name: String(bs.name), source: bs.source ? source(bs) : source(b) });
    }
    out.backgrounds.push({
      key: bKey, name: String(b.name), source: source(b), skills: names(b.skills).concat(b.skillstxt ? [String(b.skillstxt)] : []),
      tools: names(b.toolProfs), scoresText: txt, abilities: abilities, variants: bVars
    });
  }
  out.backgrounds.sort(byName);

  var vars2 = gatherPrereqevalVars();
  for (var fKey in FeatsList) {
    var f = FeatsList[fKey];
    if (!f || !f.name || testSource(fKey, f, 'featsExcl')) continue;
    var meets = null;
    // MPMB's own test, run as ApplyFeat runs it (a string test is evaluated there too); it is code from
    // MPMB's lists or the player's own add-on scripts, which run in this sheet realm anyway.
    try {
      if (typeof f.prereqeval === 'function') meets = !!f.prereqeval(vars2);
      else if (typeof f.prereqeval === 'string') meets = !!eval(f.prereqeval);
    } catch (e) { meets = null; }
    var choices = [];
    var ch = f.choices || [];
    for (var c = 0; c < ch.length; c++) {
      var ck = String(ch[c]).toLowerCase();
      var co = f[ck];
      if (!co || testSource(fKey + '-' + ck, co, 'featsExcl')) continue;
      choices.push({ key: ck, name: String(ch[c]), text: co.name ? String(co.name) : f.name + ' [' + ch[c] + ']' });
    }
    out.feats.push({
      key: fKey, name: String(f.name), source: source(f), type: f.type ? String(f.type) : '',
      prerequisite: f.prerequisite ? String(f.prerequisite) : '', meets: meets,
      description: f.description ? String(f.description) : '', choices: choices,
      taken: CurrentFeats.known.indexOf(fKey) !== -1 && !f.allowDuplicates
    });
  }
  out.feats.sort(byName);

  out.race = { key: CurrentRace.known || '', variant: CurrentRace.variant || '' };
  out.background = { key: CurrentBackground.known || '', variant: CurrentBackground.variant || '' };
  for (var l = 0; l < 9; l++) {
    out.featLines.push({ key: CurrentFeats.known[l] || '', choice: CurrentFeats.choices[l] || '' });
  }
  return JSON.stringify(out);
})()`;
