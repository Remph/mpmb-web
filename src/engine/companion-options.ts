// What the "Add a companion" window offers: MPMB's companion templates (Find Familiar, Pact of the Chain, the
// app's Find Steed and any an add-on script adds) with the creatures each one takes, read from the lists the
// sheet has loaded. MPMB's own Companion Options menu builds its "Create …" entries from the same function
// (MakeCompMenu_CompOptions with "justCompanions"), so the window and the menu always agree, and a creature an
// add-on script gives to a template shows up without the app knowing it.

/** A creature's numbers when summoned with a spell slot of this level (see `spellLevelScaling`). */
export interface LevelStats {
  level: number;
  ac: string;
  hp: number | null;
  speed: string;
}

export interface CompanionCreature {
  /** MPMB's key in CreatureList ("otherworldly steed"). */
  key: string;
  /** The name the entry offers (a creature can have alternative names, each its own entry). */
  name: string;
  /** What MPMB adds after the name in its menu: "(if DM approves)", the source ("[SRD'24 130]"). */
  note: string;
  /** The answer to the page's Companion Options menu that makes the page this creature. */
  answer: string;
  /** MPMB's size number (0 Gargantuan … 5 Tiny), null when the list doesn't give one. */
  size: number | null;
  /** "Beast", or the choices MPMB will ask about ("Celestial, Fey, Fiend"). */
  type: string;
  ac: string;
  hp: number | null;
  /** The numbers per spell slot level, for a creature that grows with the spell's level; else null. */
  levels: LevelStats[] | null;
}

export interface CompanionTemplate {
  /** MPMB's key in CompanionList ("familiar", "mount"). */
  key: string;
  /** "Find Steed" */
  name: string;
  /** MPMB's menu name: "Steed (Find Steed spell)". */
  menuName: string;
  /**
   * The spell that summons it, from the template's notes (useSpellDescription): "Find Steed". A summoned
   * companion disappears at 0 HP and comes back when the spell is cast again; null for other templates.
   */
  spell: string | null;
  /** Whether the character has that spell on its spell sheets (it is offered first). */
  known: boolean;
  creatures: CompanionCreature[];
}

/** The highest spell level, as for spell slots. */
const MAX_SPELL_LEVEL = 9;

/**
 * Runs in the sheet's realm. MPMB's function needs a page's prefix only to read that page's settings, which
 * "justCompanions" doesn't use; the first page's, or the template's own when the sheet has no page.
 */
export const COMPANION_OPTIONS_SCRIPT = `(function () {
  var sPrefix = What("Template.extras.AScomp").split(",")[1] || "AScomp.";
  var oOffered = MakeCompMenu_CompOptions(sPrefix, "justCompanions");
  var aTemplates = [];
  var typeText = function (type) { return isArray(type) ? type.join(", ") : type ? String(type) : ""; };
  for (var sComp in oOffered) {
    if (!oOffered[sComp].length) continue;
    var oComp = CompanionList[sComp];
    var sSpell = "";
    var aNotes = oComp.attributesAdd && oComp.attributesAdd.notes ? oComp.attributesAdd.notes : [];
    for (var n = 0; n < aNotes.length; n++) if (aNotes[n].useSpellDescription) sSpell = aNotes[n].useSpellDescription;
    var aCreatures = [];
    oOffered[sComp].sort();
    for (var i = 0; i < oOffered[sComp].length; i++) {
      var aEntry = oOffered[sComp][i];
      var oCrea = CreatureList[aEntry[1]];
      var aLevels = null;
      var oScaling = oCrea.spellLevelScaling;
      if (oScaling && typeof oScaling.change === "function") {
        aLevels = [];
        for (var iLevel = oScaling.minimum || 1; iLevel <= ${MAX_SPELL_LEVEL}; iLevel++) {
          var oCopy = newObj(oCrea);
          oCopy.spellLevelScaling.change(oCopy, iLevel);
          aLevels.push({ level: iLevel, ac: String(oCopy.ac), hp: Number(oCopy.hp) || null, speed: String(oCopy.speed || "") });
        }
      }
      aCreatures.push({
        key: aEntry[1],
        name: aEntry[0],
        note: String(aEntry[2] || "").replace(/^\\s+/, ""),
        answer: "companion#add_comp#" + sComp + "#" + aEntry[0] + "#" + aEntry[1],
        size: typeof oCrea.size === "number" ? oCrea.size : isArray(oCrea.size) ? oCrea.size[0] : null,
        type: typeText(oCrea.type),
        ac: String(oCrea.ac === undefined ? "" : oCrea.ac),
        hp: Number(oCrea.hp) || null,
        levels: aLevels,
      });
    }
    aTemplates.push({
      key: sComp,
      name: oComp.name || sComp,
      menuName: oComp.nameMenu || oComp.name || sComp,
      spell: sSpell && SpellsList[sSpell] ? SpellsList[sSpell].name : null,
      known: !!(sSpell && isSpellUsed(sSpell, true)),
      creatures: aCreatures,
    });
  }
  return JSON.stringify(aTemplates);
})()`;

export function readCompanionOptions(json: unknown): CompanionTemplate[] {
  if (typeof json !== 'string') throw new Error('The sheet gave no companion options');
  return JSON.parse(json) as CompanionTemplate[];
}
