// @ts-nocheck -- runs in the sheet's realm next to MPMB's scripts, whose globals TypeScript doesn't know.
// Find Steed for MPMB Web: a companion template and the Otherworldly Steed, in MPMB's own list syntax.
// MPMB's 2024 lists have the spell (SpellsList["find steed"]) but no companion for it. The app runs this file
// after MPMB's list scripts and before the sheet starts (the name "ListsWeb" sorts it there), so it adds to
// MPMB's Base_ lists the way MPMB's own list files do; add-on scripts the player imports run later and may add
// steeds of their own to the same template (a creature whose `companion` includes "mount").
//
// The Otherworldly Steed's stat block is from the System Reference Document 5.2.1 by Wizards of the Coast LLC,
// licensed under CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/legalcode).
//
// Functions here must not use variables from around them: MPMB copies its lists with toSource and eval
// (newObj), which keeps a function's text but not what it closed over.

// "mount" is the key MPMB's syntax files give Find Steed's companion template.
Base_CompanionList['mount'] = {
  name: 'Find Steed',
  nameTooltip: 'the Find Steed spell',
  nameMenu: 'Steed (Find Steed spell)',
  source: [['SRD24', 130]],
  // Only creatures that name this template; the spell doesn't summon ordinary animals.
  includeCheck: function () {
    return false;
  },
  attributesAdd: {
    header: 'Steed',
    features: [
      {
        name: 'Find Steed',
        description:
          "The [THIS] shares its master's Initiative count and functions as a controlled mount while ridden. If its master is Incapacitated, it takes its turn right after the master's and acts independently, protecting the master. It disappears if it drops to 0 HP or its master dies.",
      },
    ],
    notes: [{ useSpellDescription: 'find steed' }],
  },
  // A creature with `spellLevelScaling` gets the numbers of the spell slot it was summoned with. The app writes
  // that level into the page's Hit Dice box before it applies the creature, and MPMB writes the creature's
  // Hit Dice (one per spell level) there afterwards, so the box carries the level when the sheet opens again.
  // MPMB passes the page's own entry of CurrentCompRace but not its prefix; the entry finds the page.
  attributesChange: function (sCrea, objCrea) {
    var oScaling = objCrea.spellLevelScaling;
    if (!oScaling || typeof oScaling.change !== 'function') return;
    var sPrefix = '';
    for (var sPage in CurrentCompRace) {
      if (CurrentCompRace[sPage] === objCrea) sPrefix = sPage;
    }
    var iMin = oScaling.minimum || 1;
    var iLevel = sPrefix ? Math.floor(Number(What(sPrefix + 'Comp.Use.HD.Level'))) : 0;
    if (!(iLevel >= iMin)) iLevel = iMin;
    if (iLevel > 9) iLevel = 9;
    oScaling.change(objCrea, iLevel);
  },
};

Base_CreatureList['otherworldly steed'] = {
  name: 'Otherworldly Steed',
  source: [['SRD24', 130]],
  size: 2,
  type: ['Celestial', 'Fey', 'Fiend'],
  companion: ['mount'],
  alignment: 'Neutral',
  // The numbers for a level 2 spell; spellLevelScaling below changes them for higher slots.
  ac: 12,
  hp: 25,
  hd: [2, 10],
  speed: '60 ft',
  scores: [18, 12, 14, 6, 12, 8],
  senses: '',
  passivePerception: 11,
  languages: 'Telepathy 1 mile (works only with its master)',
  // "None" in the stat block; a number keeps MPMB's sorting by challenge rating working.
  challengeRating: '0',
  proficiencyBonus: 2,
  proficiencyBonusLinked: true,
  attacksAction: 1,
  attacks: [
    {
      name: 'Otherworldly Slam',
      ability: 1,
      // To hit: the master's spell attack modifier; damage 1d8 + the spell's level, no ability modifier.
      useSpellMod: 'paladin',
      abilitytodamage: false,
      damage: [1, 8, 'radiant'],
      modifiers: ['', 2],
      range: 'Melee (5 ft)',
      description: 'Radiant if Celestial, Psychic if Fey, Necrotic if Fiend',
    },
  ],
  traits: [
    {
      name: 'Life Bond',
      description:
        "When the [THIS]'s master regains Hit Points from a level 1+ spell, the [THIS] regains the same number of Hit Points if the master is within 5 ft of it.",
    },
  ],
  actions: [
    {
      name: 'Fell Glare (Fiend Only; Bonus Action; Recharges after a Long Rest)',
      description:
        "Wisdom Saving Throw: DC equals the master's spell save DC, one creature within 60 ft the [THIS] can see. Failure: the target has the Frightened condition until the end of the master's next turn.",
    },
    {
      name: 'Fey Step (Fey Only; Bonus Action; Recharges after a Long Rest)',
      description:
        "The [THIS] teleports, along with its rider, to an unoccupied space of the master's choice up to 60 ft away from itself.",
    },
    {
      name: 'Healing Touch (Celestial Only; Bonus Action; Recharges after a Long Rest)',
      description: 'One creature within 5 ft of the [THIS] regains 2d8 + 2 Hit Points.',
    },
  ],
  // The stat block per spell level: AC 10 + level, HP 5 + 10 × level, the slam and Healing Touch + level, and
  // a flying speed from level 4. The Hit Dice follow the level, so the page keeps it (see the template).
  spellLevelScaling: {
    minimum: 2,
    change: function (objCrea, iLevel) {
      objCrea.ac = 10 + iLevel;
      objCrea.hp = 5 + 10 * iLevel;
      objCrea.hd = [iLevel, 10];
      if (iLevel >= 4 && !/\bfly\b/i.test(objCrea.speed)) objCrea.speed += ', Fly 60 ft';
      for (var i = 0; i < objCrea.attacks.length; i++) {
        if (objCrea.attacks[i].name === 'Otherworldly Slam') objCrea.attacks[i].modifiers = ['', iLevel];
      }
      for (var j = 0; j < objCrea.actions.length; j++) {
        objCrea.actions[j].description = objCrea.actions[j].description.replace(/2d8 \+ \d+/, '2d8 + ' + iLevel);
      }
    },
  },
};
