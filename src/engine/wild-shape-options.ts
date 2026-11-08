// What the "Add a Wild Shape form" window offers: the creatures MPMB's own "Add Wild Shape" menu lists
// (MakeWildshapeMenu, Functions2.js), read from the lists the sheet has loaded, so a beast an add-on script
// adds shows up too. The same rules as the menu: beasts up to CR 6 and anything an add-on marks with
// `forceWildshapeOption`, never a creature that only exists for a companion page (extraCreatures) or whose
// source the player has excluded. Each of a creature's names is its own entry, as in the menu.
import type { Beast } from '../play/wild-shapes.ts';

/** Runs in the sheet's realm. */
export const WILD_SHAPE_OPTIONS_SCRIPT = `(function () {
  var aBeasts = [];
  var oSeen = {};
  for (var sCrea in CreatureList) {
    var oCrea = CreatureList[sCrea];
    var isBeast = /^Beast$/i.test(oCrea.type);
    if ((!oCrea.forceWildshapeOption && !isBeast)
      || (!oCrea.forceWildshapeOption && CurrentVars.extraCreatures && CurrentVars.extraCreatures[sCrea])
      || testSource(sCrea, oCrea, "creaExcl")) continue;
    var nCR = eval_ish(oCrea.challengeRating);
    if (isBeast && !(nCR <= 6)) continue;
    var aNames = [oCrea.name];
    if (oCrea.nameAlt) {
      aNames = aNames.concat((isArray(oCrea.nameAlt) ? oCrea.nameAlt : [oCrea.nameAlt]).filter(function (sName) {
        return !/,|;/.test(sName);
      }));
    }
    var sGroup = "";
    if (!isBeast) {
      sGroup = oCrea.forceWildshapeOption === true ? (isArray(oCrea.type) ? oCrea.type[0] : oCrea.type) : oCrea.forceWildshapeOption;
    }
    for (var i = 0; i < aNames.length; i++) {
      if (oSeen[aNames[i]]) continue;
      oSeen[aNames[i]] = true;
      aBeasts.push({
        key: sCrea,
        name: aNames[i],
        challenge: String(oCrea.challengeRating === undefined ? "" : oCrea.challengeRating),
        challengeValue: isNaN(nCR) ? -1 : nCR,
        speed: String(oCrea.speed || ""),
        group: String(sGroup || ""),
      });
    }
  }
  return JSON.stringify(aBeasts);
})()`;

export function readWildShapeOptions(json: unknown): Beast[] {
  if (typeof json !== 'string') throw new Error('The sheet gave no Wild Shape options');
  return JSON.parse(json) as Beast[];
}
