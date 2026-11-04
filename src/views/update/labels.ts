// Names for the entries a sheet update changed (M11), in the player's language. MPMB's field names are
// English and technical; the entries that an import changes most often get a name here, the rest keep
// MPMB's field name.
import type { Texts } from '../../i18n.ts';
import { fill } from '../../i18n.ts';

interface Rule {
  pattern: RegExp;
  label: (match: RegExpExecArray, t: Texts) => string;
}

const RULES: Rule[] = [
  {
    // Matches "Limited Feature 3"; rejects "Limited Feature Max Usages 3".
    // Try it: https://regex101.com/?regex=%5ELimited+Feature+(%5Cd%2B)%24&testString=Limited+Feature+3%0ALimited+Feature+Max+Usages+3
    pattern: /^Limited Feature (\d+)$/,
    label: (m, t) => fill(t.updLimitedFeature, { n: m[1] ?? '' }),
  },
  {
    // Matches "Limited Feature Max Usages 3"; rejects "Limited Feature 3".
    // Try it: https://regex101.com/?regex=%5ELimited+Feature+Max+Usages+(%5Cd%2B)%24&testString=Limited+Feature+Max+Usages+3%0ALimited+Feature+3
    pattern: /^Limited Feature Max Usages (\d+)$/,
    label: (m, t) => fill(t.updLimitedUses, { n: m[1] ?? '' }),
  },
  {
    // Matches "Bonus Action 2"; rejects "Bonus Actions".
    // Try it: https://regex101.com/?regex=%5EBonus+Action+(%5Cd%2B)%24&testString=Bonus+Action+2%0ABonus+Actions
    pattern: /^Bonus Action (\d+)$/,
    label: (m, t) => fill(t.updBonusAction, { n: m[1] ?? '' }),
  },
  {
    // Matches "Reaction 1"; rejects "Reactions".
    // Try it: https://regex101.com/?regex=%5EReaction+(%5Cd%2B)%24&testString=Reaction+1%0AReactions
    pattern: /^Reaction (\d+)$/,
    label: (m, t) => fill(t.updReaction, { n: m[1] ?? '' }),
  },
  {
    // A spell sheet's spell attack or save DC: matches "SSmore#0.spellshead.dc.0"; rejects "Spell save DC 1".
    // Try it: https://regex101.com/?regex=%5ESS%5Cw*%23%5Cd%2B%5C.spellshead%5C.(attack%7Cdc)%5C.%5Cd%2B%24&testString=SSmore%230.spellshead.dc.0%0ASpell+save+DC+1
    pattern: /^SS\w*#\d+\.spellshead\.(attack|dc)\.\d+$/,
    label: (m, t) => (m[1] === 'dc' ? t.updSpellDc : t.updSpellAttack),
  },
  {
    // A spell's line on a spell sheet: matches "SSmore#0.spells.description.36"; rejects "Spell description".
    // Try it: https://regex101.com/?regex=%5C.spells%5C.description%5C.%5Cd%2B%24&testString=SSmore%230.spells.description.36%0ASpell+description
    pattern: /\.spells\.description\.\d+$/,
    label: (_m, t) => t.updSpellText,
  },
];

/** Whole field names with a name of their own. */
const NAMED: Record<string, (t: Texts) => string> = {
  'Extra.Notes': (t) => t.updNotes3,
  'Class Features': (t) => t.updClassFeatures,
};

/** The entry's name for the player: one of the names above, or MPMB's field name. */
export function changeLabel(field: string, t: Texts): string {
  const named = NAMED[field];
  if (named) return named(t);
  const hit = RULES.map((rule) => ({ rule, match: rule.pattern.exec(field) })).find(({ match }) => match);
  return hit?.match ? hit.rule.label(hit.match, t) : field;
}
