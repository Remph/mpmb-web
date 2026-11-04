// The "Armour & weapons" Build step's lists (M6.5): what MPMB offers in the page-1 armour drop-down
// ("AC Armor Description") and the attack drop-downs ("Attack.N.Weapon Selection"), with the numbers from
// its ArmourList and WeaponsList. MPMB fills both drop-downs with what the chosen sources and add-on
// scripts allow (SetArmordropdown, SetWeaponsdropdown), so the step reads the drop-downs' own entries and
// looks each one up the way MPMB does when a name is typed in (ParseArmor, ParseWeapon).

/**
 * Where an entry belongs in the step's lists. "own" is what the character's magic items and features add
 * at the top of MPMB's drop-down ("Adamantine Plate", "+2 Halberd", "Breath Weapon").
 */
export type ArmourGroup = 'own' | 'none' | 'light' | 'medium' | 'heavy' | 'other';
export type WeaponGroup =
  | 'own'
  | 'simple-melee'
  | 'simple-ranged'
  | 'martial-melee'
  | 'martial-ranged'
  | 'natural'
  | 'gear'
  | 'spell'
  | 'other';

export interface ArmourEntry {
  /** As MPMB lists it, and as it goes into the field. */
  name: string;
  group: ArmourGroup;
  /** The armour's own type when MPMB knows the name: light, medium, heavy, or empty. */
  type: string;
  /** Base AC, or null when MPMB doesn't know the name. */
  ac: number | null;
  /** How much Dexterity counts: all of it, at most 2 (medium armour), or none (heavy armour). */
  dex: 'all' | 'max2' | 'none';
  stealth: boolean;
  /** Strength needed, 0 for none. */
  strength: number;
  /** In the sheet's unit (see GearInfo.massUnit), null when MPMB gives none. */
  weight: number | null;
}

export interface WeaponEntry {
  name: string;
  group: WeaponGroup;
  /** MPMB's type: Simple, Martial, Natural, Cantrip … (empty when unknown). */
  type: string;
  /** As MPMB keeps it: [dice count or text, die size or "", damage type]; empty when unknown. */
  damage: (string | number)[];
  /** In the sheet's units ("Melee, 6/18 m"). */
  range: string;
  /** The properties ("Finesse, Light, Thrown"). */
  properties: string;
  /** The 2024 weapon mastery ("Sap"), or empty. */
  mastery: string;
  weight: number | null;
}

/** A magic item from MPMB's magic item drop-down ("Extra.Magic Item N"), session feedback 2026-11-04. */
export interface MagicItemEntry {
  name: string;
  /** MPMB's type, as it writes it: "Wondrous Item", "Weapon (any sword)", "Ring" … (empty when unknown). */
  type: string;
  rarity: string;
  attunement: boolean;
  /** MPMB's short description, the one its PDF puts in the item's field. */
  description: string;
  /** MPMB asks which version when the item is chosen ("Armor, +1, +2, or +3"). */
  choices: boolean;
}

export interface GearInfo {
  armour: ArmourEntry[];
  weapons: WeaponEntry[];
  magicItems: MagicItemEntry[];
  /** The unit of the weights above, as the sheet is set: "lb" or "kg". */
  massUnit: 'lb' | 'kg';
}

/**
 * Runs in the sheet and returns GearInfo as JSON. ES5, next to MPMB's scripts. Alternative spellings MPMB
 * adds at the end of the weapons ("Sword, Long" for a longsword) are left out: they are the same weapon.
 */
export const GEAR_SCRIPT = `(function () {
  var metric = What("Unit System") !== "imperial";
  var massMod = metric ? UnitsList.metric.mass : 1;
  var lower = function (s) { return String(s).toLowerCase(); };
  var cap = function (s) { return s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : ""; };
  var weight = function (w) { return typeof w === "number" ? Math.round(w * massMod * 100) / 100 : null; };
  var itemsOf = function (name) {
    var f = tDoc.getField(name), out = [];
    for (var i = 0; f && i < f.numItems; i++) out.push(String(f.getItemAt(i, false)));
    return out;
  };
  var ownOf = function (display) {
    var own = [];
    for (var k in display || {}) {
      var arr = isArray(display[k]) ? display[k] : [display[k]];
      for (var a = 0; a < arr.length; a++) own.push(lower(arr[a]));
    }
    return own;
  };

  var out = { armour: [], weapons: [], magicItems: [], massUnit: metric ? "kg" : "lb" };

  var ownArmour = ownOf(CurrentVars.extraArmourDisplay);
  var armourItems = itemsOf("AC Armor Description");
  for (var i = 0; i < armourItems.length; i++) {
    var name = armourItems[i];
    if (!name) continue;
    var key = ParseArmor(name);
    var arm = key ? ArmourList[key] : null;
    var type = arm && arm.type ? lower(arm.type) : "";
    var list = arm ? lower(arm.list || arm.type || "") : "";
    var group = ownArmour.indexOf(lower(name)) !== -1 ? "own"
      : list === "firstlist" || list === "magic" ? "none"
      : list === "light" || list === "medium" || list === "heavy" ? list : "other";
    var dex = type === "heavy" || (arm && arm.dex === -10) ? "none" : type === "medium" ? "max2" : "all";
    out.armour.push({
      name: name, group: group, type: type, ac: arm && !isNaN(arm.ac) ? Number(arm.ac) : null, dex: dex,
      stealth: Boolean(arm && arm.stealthdis), strength: arm && arm.strReq ? Number(arm.strReq) : 0,
      weight: arm ? weight(arm.weight) : null
    });
  }

  var ownWeapons = ownOf(CurrentVars.extraWeaponsDisplay);
  var seen = [];
  var weaponItems = itemsOf("Attack.1.Weapon Selection");
  for (var j = 0; j < weaponItems.length; j++) {
    var wName = weaponItems[j];
    if (!wName) continue;
    var wKey = ParseWeapon(wName);
    var wea = wKey ? WeaponsList[wKey] : null;
    var base = wea && wea.baseWeapon ? WeaponsList[wea.baseWeapon] : null;
    var wList = wea ? lower(wea.list || "") : "";
    var wType = wea && wea.type ? String(wea.type) : "";
    var isOwn = wList === "startlist" || ownWeapons.indexOf(lower(wName)) !== -1;
    var isAlt = false;
    if (wea && isArray(wea.nameAlt)) {
      for (var n = 0; n < wea.nameAlt.length; n++) if (lower(wea.nameAlt[n]) === lower(wName)) isAlt = true;
    }
    if (!isOwn && (isAlt || seen.indexOf(lower(wName)) !== -1)) continue;
    seen.push(lower(wName));
    var wGroup = isOwn ? "own"
      : (wList === "melee" || wList === "ranged") && (wType === "Simple" || wType === "Martial") ? lower(wType) + "-" + wList
      : wType === "Natural" ? "natural"
      : wList === "gear" || /improvised/i.test(wType) ? "gear"
      : wList === "spell" || wType === "Spell" || wType === "Cantrip" ? "spell" : "other";
    var range = wea && wea.range ? String(wea.range) : base && base.range ? String(base.range) : "";
    var mastery = wea && wea.mastery ? wea.mastery : base && base.mastery ? base.mastery : "";
    out.weapons.push({
      name: wName, group: wGroup, type: wType,
      damage: wea && isArray(wea.damage) ? wea.damage.slice(0, 3) : [],
      range: metric && range ? ConvertToMetric(range, 0.5) : range,
      properties: wea && wea.description ? String(wea.description) : "",
      mastery: cap(mastery),
      weight: wea ? weight(wea.weight) : null
    });
  }

  // MPMB fills every magic item field's drop-down with the names of MagicItemsList's entries that the chosen
  // sources allow (SetMagicItemsDropdown); the same loop here keeps each name with its entry. (Looking each
  // name up with ParseMagicItem would scan the whole list once per name: seconds on a big list.)
  var seenItems = {};
  for (var mKey in MagicItemsList) {
    var mi = MagicItemsList[mKey];
    if (!mi || !mi.name || testSource(mKey, mi, "magicitemExcl") || seenItems[mi.name]) continue;
    seenItems[mi.name] = true;
    out.magicItems.push({
      name: String(mi.name), type: mi.type ? String(mi.type) : "", rarity: mi.rarity ? String(mi.rarity) : "",
      attunement: Boolean(mi.attunement), description: mi.description ? String(mi.description) : "",
      choices: Boolean(mi.choices)
    });
  }
  out.magicItems.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
  return JSON.stringify(out);
})()`;
